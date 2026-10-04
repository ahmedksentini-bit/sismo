// functions/api/seedlink.js — fonction Cloudflare Pages : relais SeedLink → WebSocket pour la page « En direct ». Un
// navigateur ne peut pas ouvrir de connexion TCP ; la fonction se connecte au serveur SeedLink de GEOFON (port 18000),
// mène la poignée de main pour les flux demandés (au plus 12, validés par src/sismo/seedlink.js), puis transmet chaque
// enregistrement miniSEED (512 octets) en message binaire. Messages texte (JSON) : { type: 'etat' | 'erreur' | 'fin' }.
// La connexion se ferme d'elle-même après 10 minutes : la page se reconnecte en demandant la reprise (TIME) à partir de
// son dernier échantillon, ce qui garde chaque invocation courte. SEEDLINK_SERVEUR (hôte:port) remplace le serveur pour
// les essais.
import { connect } from 'cloudflare:sockets';
import SeedLink from '../../src/sismo/seedlink.js';

const SERVEURS = ['geofon.gfz.de:18000', 'geofon.gfz-potsdam.de:18000'];
const DUREE_MAX = 10 * 60 * 1000, DELAI_REPONSE = 15000, BATTEMENT = 25000;

export async function onRequest(context) {
  const { request, env } = context;
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Connexion WebSocket attendue', { status: 426 });
  const url = new URL(request.url), flux = SeedLink.lireFlux(url.searchParams.get('flux'));
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
