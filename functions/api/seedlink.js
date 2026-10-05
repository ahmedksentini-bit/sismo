// functions/api/seedlink.js — fonction Cloudflare Pages : relais SeedLink → WebSocket pour la page « En direct ». Un
// navigateur ne peut pas ouvrir de connexion TCP ; la fonction se connecte au serveur SeedLink demandé (?serveur=hôte:port,
// liste blanche de src/sismo/centres.js, GEOFON par défaut), mène la poignée de main pour les flux demandés (au plus 25,
// validés par src/sismo/seedlink.js), puis transmet chaque enregistrement miniSEED des voies demandées (512 octets) en
// message binaire. Messages texte (JSON) : { type: 'etat' | 'erreur' | 'fin' } ; l'état qui suit la poignée de main
// nomme les stations refusées (STATION ou SELECT en erreur), que la page essaie ailleurs. La connexion se ferme d'elle-même
// après 10 minutes : la page se reconnecte en demandant la reprise (TIME) à partir de son dernier échantillon, ce qui garde
// chaque invocation courte. SEEDLINK_SERVEUR (hôte:port) remplace le serveur pour les essais.
// Requêtes HTTP ordinaires : ?diagnostic=1&serveur=…&flux=… (chaque étape de l'échange jusqu'au premier paquet, 15 s au
// plus) et ?sonde=1 (réponse de chaque serveur de la liste blanche à HELLO), en JSON, pour comprendre un relais qui ne
// livre rien.
import { connect } from 'cloudflare:sockets';
import SeedLink from '../../src/sismo/seedlink.js';
import MiniSeed from '../../src/sismo/miniseed.js';
import Centres from '../../src/sismo/centres.js';

const DUREE_MAX = 10 * 60 * 1000, DELAI_REPONSE = 15000, DELAI_OUVERTURE = 10000, BATTEMENT = 25000;
const json = o => new Response(JSON.stringify(o, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequest(context) {
  const { request } = context, env = context.env || {};
  const url = new URL(request.url), p = url.searchParams;
  if (p.has('sonde')) return sonder(env);
  const serveur = p.get('serveur') || Centres.GEOFON;
  if (!Centres.serveurPermis(serveur)) return new Response('Serveur SeedLink non permis', { status: 400 });
  const cible = env.SEEDLINK_SERVEUR || serveur, flux = SeedLink.lireFlux(p.get('flux'));
  if (p.has('diagnostic')) return diagnostiquer(serveur, cible, flux ? flux.slice(0, 1) : SeedLink.lireFlux('GE.MTE..BHZ'));
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Connexion WebSocket attendue', { status: 426 });
  if (!flux) return new Response(`Flux invalides : RESEAU.STATION.EMPLACEMENT.VOIE, ${SeedLink.MAX_FLUX} au plus`, { status: 400 });
  const depuis = SeedLink.lireDepuis(p.get('depuis'));
  const [client, ws] = Object.values(new WebSocketPair());
  ws.accept();
  context.waitUntil(relayer(ws, serveur, cible, flux, depuis));
  return new Response(null, { status: 101, webSocket: client });
}

const delai = ms => new Promise(r => setTimeout(() => r(null), ms));
const message = e => String((e && e.message) || e);
// Ouverture d'une connexion TCP, bornée dans le temps.
async function ouvrir(adresse, ms) {
  const [hostname, port] = adresse.split(':'), socket = connect({ hostname, port: Number(port) });
  try {
    await Promise.race([socket.opened, delai(ms).then(() => { throw new Error(`ouverture : délai de ${ms / 1000} s dépassé`); })]);
  } catch (e) { try { socket.close(); } catch { /* déjà fermé */ } throw e; }
  return socket;
}
// Écriture de commandes et lecture des lignes de réponse (OK, ERROR, bannière), avec délai.
function dialogue(socket, ms) {
  const ecrivain = socket.writable.getWriter(), lecteur = socket.readable.getReader(), lignes = SeedLink.lecteurLignes(), attente = [];
  return {
    lecteur,
    ecrire: l => ecrivain.write(new TextEncoder().encode(l + '\r\n')),
    async ligne() {
      while (!attente.length) {
        const r = await Promise.race([lecteur.read(), delai(ms)]);
        if (!r) throw new Error(`pas de réponse en ${ms / 1000} s`);
        if (r.done) throw new Error('connexion fermée par le serveur');
        attente.push(...lignes.pousser(r.value));
      }
      return attente.shift();
    },
  };
}

async function relayer(ws, serveur, cible, flux, depuis) {
  const etat = { ferme: false, socket: null };
  const envoyer = o => { try { ws.send(JSON.stringify(o)); } catch { etat.ferme = true; } };
  ws.addEventListener('close', () => { etat.ferme = true; try { etat.socket && etat.socket.close(); } catch { /* déjà fermé */ } });
  try {
    etat.socket = await ouvrir(cible, DELAI_OUVERTURE);
    await transmettre(etat, ws, serveur, flux, depuis, envoyer);
  } catch (e) {
    envoyer({ type: 'erreur', message: `${serveur} : ${message(e)}` });
    try { etat.socket && etat.socket.close(); } catch { /* déjà fermé */ }
    try { ws.close(1011, 'SeedLink indisponible'); } catch { /* déjà fermé */ }
  }
}

async function transmettre(etat, ws, serveur, flux, depuis, envoyer) {
  const d = dialogue(etat.socket, DELAI_REPONSE);
  await d.ecrire('HELLO');
  const banniere = [await d.ligne(), await d.ligne()];
  // une station refusée (STATION), ou dont la voie demandée est refusée (SELECT), ne livrera rien ici ; après un refus
  // de STATION, ses autres commandes ne sont pas envoyées
  const refusees = new Set(), sansStation = new Set();
  for (const c of SeedLink.commandes(flux, depuis)) {
    if (c.station && sansStation.has(c.station)) continue;
    await d.ecrire(c.ligne);
    if (!c.reponse) continue;
    const r = await d.ligne();
    if (r !== 'OK') {
      envoyer({ type: 'etat', message: `${serveur} : ${c.ligne} → ${r}` });
      if (c.ligne.startsWith('STATION')) { sansStation.add(c.station); refusees.add(c.station); }
      else if (c.ligne.startsWith('SELECT')) refusees.add(c.station);
    }
  }
  const voulues = new Set(flux.filter(f => !refusees.has(`${f.reseau}.${f.station}`)).map(f => `${f.reseau}.${f.station}.${f.emplacement || ''}.${f.voie}`));
  envoyer({ type: 'etat', message: `connecté à ${serveur}`, serveur: banniere.join(' · '), refusees: [...refusees] });
  if (!voulues.size) { envoyer({ type: 'fin', raison: 'refus', paquets: 0 }); try { ws.close(1000, 'aucune station'); } catch { /* déjà fermé */ } return; }
  const decoupe = SeedLink.decoupeur(), debut = Date.now();
  let paquets = 0;
  const battement = setInterval(() => envoyer({ type: 'etat', paquets }), BATTEMENT);
  try {
    while (!etat.ferme) {
      const reste = DUREE_MAX - (Date.now() - debut);
      if (reste <= 0) { envoyer({ type: 'fin', raison: 'durée', paquets }); break; }
      const r = await Promise.race([d.lecteur.read(), delai(Math.min(reste, 60000))]);
      if (!r) continue;
      if (r.done) { envoyer({ type: 'fin', raison: 'serveur', paquets }); break; }
      for (const p of decoupe.pousser(r.value)) {
        if (p.info || !voulues.has(SeedLink.identifiant(p.enregistrement))) continue;
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

// Diagnostic : ouverture de la connexion, bannière de HELLO, réponse à chaque commande, puis premier paquet (identifiant
// et heure du premier échantillon) ou délai dépassé. Une station, 15 s au plus pour le premier paquet.
async function diagnostiquer(serveur, cible, flux) {
  const e = { serveur, flux: SeedLink.versFlux(flux), etapes: [] }, t0 = Date.now();
  let socket = null;
  try {
    socket = await ouvrir(cible, 8000);
    e.etapes.push('connexion ouverte');
    const d = dialogue(socket, 8000);
    await d.ecrire('HELLO');
    e.etapes.push(`HELLO → ${await d.ligne()} · ${await d.ligne()}`);
    for (const c of SeedLink.commandes(flux, Date.now() - 5 * 60000)) {
      await d.ecrire(c.ligne);
      e.etapes.push(c.reponse ? `${c.ligne} → ${await d.ligne()}` : c.ligne);
    }
    const decoupe = SeedLink.decoupeur(), fin = Date.now() + 15000;
    while (Date.now() < fin && !e.paquet) {
      const r = await Promise.race([d.lecteur.read(), delai(fin - Date.now())]);
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
    e.erreur = message(err);
  } finally {
    e.duree = Date.now() - t0;
    try { socket && socket.close(); } catch { /* déjà fermé */ }
  }
  return json({ essais: [e] });
}

// Sonde : chaque serveur de la liste blanche répond-il à HELLO ? Par groupes de cinq (une invocation garde peu de
// connexions ouvertes à la fois), 6 s au plus par serveur.
async function sonder(env) {
  const essayer = async adresse => {
    const c = Centres.centreDuServeur(adresse), r = { serveur: adresse, centre: c ? c.id : null, verifie: !!(c && c.verifie) }, t0 = Date.now();
    let socket = null;
    try {
      socket = await ouvrir(env.SEEDLINK_SERVEUR || adresse, 6000);
      const d = dialogue(socket, 6000);
      await d.ecrire('HELLO');
      r.reponse = `${await d.ligne()} · ${await d.ligne()}`;
    } catch (e) { r.erreur = message(e); }
    finally { r.duree = Date.now() - t0; try { socket && socket.close(); } catch { /* déjà fermé */ } }
    return r;
  };
  const out = [];
  for (let i = 0; i < Centres.SEEDLINK.length; i += 5) out.push(...await Promise.all(Centres.SEEDLINK.slice(i, i + 5).map(essayer)));
  return json({ serveurs: out });
}
