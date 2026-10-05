// functions/api/fdsn.js — fonction Cloudflare Pages : relais des services web FDSN (station, dataselect, event) des
// centres de données de la page « En direct », et service event des catalogues (EMSC). Le navigateur interroge le site
// lui-même (même origine) ; la requête n'est transmise qu'au centre nommé (?centre=, liste blanche de src/sismo/centres.js,
// GEOFON par défaut), avec les seuls paramètres autorisés (src/sismo/fdsn.js : durée ≤ 2 h, 12 stations au plus, format
// texte), et mise en cache brièvement. Avec resume=1, une réponse dataselect n'est pas transmise : le relais n'en renvoie que le résumé (JSON :
// début, fin et nombre d'échantillons de chaque voie, en-têtes miniSEED seuls), qui dit à la page si une station a des
// données récentes sans les télécharger. FDSN_ESSAI (variable d'environnement, « {centre} » y est remplacé par
// l'identifiant du centre) remplace l'adresse de tous les centres pour les essais.
import Fdsn from '../../src/sismo/fdsn.js';
import Centres from '../../src/sismo/centres.js';
import MiniSeed from '../../src/sismo/miniseed.js';

const CACHE = { station: 3600, event: 60, dataselect: 5 };
const texte = (msg, status) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), service = url.searchParams.get('service'), centre = url.searchParams.get('centre') || 'geofon';
  if (!Centres.servicePermis(centre, service)) return texte('centre inconnu, ou service non permis pour ce catalogue', 400);
  const resume = url.searchParams.get('resume') === '1' && service === 'dataselect';
  const entree = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'service' && k !== 'centre' && k !== 'resume'));
  const r = Fdsn.requete(service, entree);
  if (r.erreur) return texte(r.erreur, 400);
  const base = env && env.FDSN_ESSAI ? env.FDSN_ESSAI.replace('{centre}', centre) : Centres.adresseFdsn(centre);
  const cible = new URL(base.replace(/\/$/, '') + r.chemin);
  for (const [k, v] of Object.entries(r.params)) cible.searchParams.set(k, v);
  let rep;
  try {
    rep = await fetch(cible.toString(), { headers: { 'User-Agent': 'sismo-ksr-infra (cours de sismologie)' }, cf: { cacheTtl: CACHE[service], cacheEverything: true } });
  } catch {
    return texte(`${(Centres.CENTRES[centre] || Centres.catalogue(centre)).nom} injoignable`, 502);
  }
  // 204 : aucune donnée pour la requête (FDSN) ; on la transmet telle quelle
  if (rep.status === 204) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (resume && rep.ok) {
    const r = MiniSeed.resumer(await rep.arrayBuffer());
    return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
  }
  return new Response(rep.body, {
    status: rep.status,
    headers: { 'Content-Type': rep.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': `public, max-age=${CACHE[service]}` },
  });
}
