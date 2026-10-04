// functions/api/geofon.js — fonction Cloudflare Pages : relais des services web FDSN de GEOFON (station, dataselect,
// event) pour la page « En direct ». Le navigateur interroge le site lui-même (même origine) ; la requête n'est
// transmise qu'à GEOFON, avec les seuls paramètres autorisés (src/sismo/fdsn.js : durée ≤ 2 h, 12 stations au plus,
// format texte), et mise en cache brièvement. GEOFON_FDSN (variable d'environnement) remplace l'hôte pour les essais.
import Fdsn from '../../src/sismo/fdsn.js';

const HOTE = 'https://geofon.gfz.de';
const CACHE = { station: 3600, event: 60, dataselect: 5 };

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), service = url.searchParams.get('service');
  const entree = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'service'));
  const r = Fdsn.requete(service, entree);
  if (r.erreur) return new Response(r.erreur, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const cible = new URL(r.chemin, (env && env.GEOFON_FDSN) || HOTE);
  for (const [k, v] of Object.entries(r.params)) cible.searchParams.set(k, v);
  let rep;
  try {
    rep = await fetch(cible.toString(), { headers: { 'User-Agent': 'sismo-ksr-infra (cours de sismologie)' }, cf: { cacheTtl: CACHE[service], cacheEverything: true } });
  } catch {
    return new Response('GEOFON injoignable', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  // 204 : aucune donnée pour la requête (FDSN) ; on la transmet telle quelle
  if (rep.status === 204) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  return new Response(rep.body, {
    status: rep.status,
    headers: { 'Content-Type': rep.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': `public, max-age=${CACHE[service]}` },
  });
}
