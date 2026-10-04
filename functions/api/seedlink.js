// functions/api/seedlink.js — fonction Cloudflare Pages : relais SeedLink → WebSocket pour la page « En direct ». Un
// navigateur ne peut pas ouvrir de connexion TCP ; la fonction se connecte au serveur SeedLink de GEOFON (port 18000),
// mène la poignée de main pour les flux demandés (au plus 12, validés par src/sismo/seedlink.js), puis transmet chaque
// enregistrement miniSEED (512 octets) en message binaire. Messages texte (JSON) : { type: 'etat' | 'erreur' | 'fin' }.
// La connexion se ferme d'elle-même après 10 minutes : la page se reconnecte en demandant la reprise (TIME) à partir de
// son dernier échantillon, ce qui garde chaque invocation courte. SEEDLINK_SERVEUR (hôte:port) remplace le serveur pour
// les essais. Diagnostic (requête HTTP ordinaire, ?diagnostic=1&flux=…) : chaque étape de l'échange avec chaque serveur,
// jusqu'au premier paquet reçu (15 s au plus), en JSON, pour comprendre un relais qui ne livre rien.
import { connect } from 'cloudflare:sockets';
import SeedLink from '../../src/sismo/seedlink.js';
import MiniSeed from '../../src/sismo/miniseed.js';

const SERVEURS = ['geofon.gfz.de:18000', 'geofon.gfz-potsdam.de:18000'];
const DUREE_MAX = 10 * 60 * 1000, DELAI_REPONSE = 15000, BATTEMENT = 25000;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url), flux = SeedLink.lireFlux(url.searchParams.get('flux'));
  if (url.searchParams.has('diagnostic')) return diagnostiquer(flux ? flux.slice(0, 1) : SeedLink.lireFlux('GE.MTE..BHZ'), env || {});
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Connexion WebSocket attendue', { status: 426 });
  if (!flux) return new Response('Flux invalides : RESEAU.STATION.EMPLACEMENT.VOIE, 12 au plus', { status: 400 });
  const depuis = SeedLink.lireDepuis(url.searchParams.get('depuis'));
  const [client, serveur] = Object.values(new WebSocketPair());
  serveur.accept();
  context.waitUntil(relayer(serveur, flux, depuis, env || {}));
  return new Response(null, { status: 101, webSocket: client });
}

const delai = ms => new Promise(r => setTimeout(() => r(null), ms));

async function relayer(ws, flux, depuis, env) {
  const etat = { ferme: false, socket: null };
  const envoyer = o => { try { ws.send(JSON.stringify(o)); } catch { etat.ferme = true; } };
  ws.addEventListener('close', () => { etat.ferme = true; try { etat.socket && etat.socket.close(); } catch { /* déjà fermé */ } });
  const serveurs = env.SEEDLINK_SERVEUR ? [env.SEEDLINK_SERVEUR] : SERVEURS;
  for (const adresse of serveurs) {
    if (etat.ferme) return;
    const [hostname, port] = adresse.split(':');
    try {
      etat.socket = connect({ hostname, port: Number(port) });
      await etat.socket.opened;
      await dialoguer(etat, ws, flux, depuis, envoyer, hostname);
      return;
    } catch (e) {
      envoyer({ type: 'etat', message: `${hostname} injoignable (${(e && e.message) || e})` });
      try { etat.socket.close(); } catch { /* déjà fermé */ }
    }
  }
  envoyer({ type: 'erreur', message: 'aucun serveur SeedLink joignable' });
  try { ws.close(1011, 'SeedLink injoignable'); } catch { /* déjà fermé */ }
}

async function dialoguer(etat, ws, flux, depuis, envoyer, hote) {
  const ecrivain = etat.socket.writable.getWriter(), lecteur = etat.socket.readable.getReader();
  const lignes = SeedLink.lecteurLignes(), attente = [];
  const ecrire = l => ecrivain.write(new TextEncoder().encode(l + '\r\n'));
  // une ligne de réponse (OK, ERROR, bannière), avec délai
  const ligne = async () => {
    while (!attente.length) {
      const r = await Promise.race([lecteur.read(), delai(DELAI_REPONSE)]);
      if (!r) throw new Error('pas de réponse');
      if (r.done) throw new Error('connexion fermée');
      attente.push(...lignes.pousser(r.value));
    }
    return attente.shift();
  };
  await ecrire('HELLO');
  const banniere = [await ligne(), await ligne()];
  const refusees = new Set();
  for (const c of SeedLink.commandes(flux, depuis)) {
    if (c.station && refusees.has(c.station)) continue;
    await ecrire(c.ligne);
    if (!c.reponse) continue;
    const r = await ligne();
    if (r !== 'OK') {
      envoyer({ type: 'etat', message: `${c.ligne} : ${r}` });
      if (c.ligne.startsWith('STATION')) refusees.add(c.station);
    }
  }
  envoyer({ type: 'etat', message: `connecté à ${hote}`, serveur: banniere.join(' · '), refusees: [...refusees] });
  const decoupe = SeedLink.decoupeur(), debut = Date.now();
  let paquets = 0;
  const battement = setInterval(() => envoyer({ type: 'etat', paquets }), BATTEMENT);
  try {
    while (!etat.ferme) {
      const reste = DUREE_MAX - (Date.now() - debut);
      if (reste <= 0) { envoyer({ type: 'fin', raison: 'durée', paquets }); break; }
      const r = await Promise.race([lecteur.read(), delai(Math.min(reste, 60000))]);
      if (!r) continue;
      if (r.done) { envoyer({ type: 'fin', raison: 'serveur', paquets }); break; }
      for (const p of decoupe.pousser(r.value)) {
        if (p.info) continue;
        ws.send(p.enregistrement.slice().buffer);
        paquets++;
      }
    }
  } finally {
    clearInterval(battement);
    try { etat.socket.close(); } catch { /* déjà fermé */ }
    try { ws.close(1000, 'fin'); } catch { /* déjà fermé */ }
  }
}

// Diagnostic : pour chaque serveur, ouverture de la connexion, bannière de HELLO, réponse à chaque commande, puis premier
// paquet (identifiant et heure du premier échantillon) ou délai dépassé. Une station au plus, 15 s par serveur.
async function diagnostiquer(flux, env) {
  const serveurs = env.SEEDLINK_SERVEUR ? [env.SEEDLINK_SERVEUR] : SERVEURS, essais = [];
  for (const adresse of serveurs) {
    const [hostname, port] = adresse.split(':'), e = { serveur: adresse, etapes: [] }, t0 = Date.now();
    let socket = null;
    try {
      socket = connect({ hostname, port: Number(port) });
      await Promise.race([socket.opened, delai(8000).then(() => { throw new Error('ouverture : délai de 8 s dépassé'); })]);
      e.etapes.push('connexion ouverte');
      const ecrivain = socket.writable.getWriter(), lecteur = socket.readable.getReader(), lignes = SeedLink.lecteurLignes(), attente = [];
      const ecrire = l => ecrivain.write(new TextEncoder().encode(l + '\r\n'));
      const ligne = async () => {
        while (!attente.length) {
          const r = await Promise.race([lecteur.read(), delai(8000)]);
          if (!r) throw new Error('pas de réponse en 8 s');
          if (r.done) throw new Error('connexion fermée par le serveur');
          attente.push(...lignes.pousser(r.value));
        }
        return attente.shift();
      };
      await ecrire('HELLO');
      e.etapes.push(`HELLO → ${await ligne()} · ${await ligne()}`);
      for (const c of SeedLink.commandes(flux, Date.now() - 5 * 60000)) {
        await ecrire(c.ligne);
        e.etapes.push(c.reponse ? `${c.ligne} → ${await ligne()}` : c.ligne);
      }
      const decoupe = SeedLink.decoupeur(), fin = Date.now() + 15000;
      while (Date.now() < fin && !e.paquet) {
        const r = await Promise.race([lecteur.read(), delai(fin - Date.now())]);
        if (!r) break;
        if (r.done) { e.etapes.push('connexion fermée par le serveur'); break; }
        for (const p of decoupe.pousser(r.value)) {
          if (p.info) continue;
          const m = MiniSeed.enregistrement(p.enregistrement);
          e.paquet = m ? { id: m.id, debut: new Date(m.debut).toISOString(), echantillons: m.echantillons.length, cadence: m.cadence } : { illisible: true };
          break;
        }
      }
      if (!e.paquet) e.etapes.push('aucun paquet en 15 s');
    } catch (err) {
      e.erreur = String((err && err.message) || err);
    } finally {
      e.duree = Date.now() - t0;
      try { socket && socket.close(); } catch { /* déjà fermé */ }
    }
    essais.push(e);
    if (e.paquet) break;
  }
  return new Response(JSON.stringify({ flux: SeedLink.versFlux(flux), essais }, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
