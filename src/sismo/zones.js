import Psha from './psha.js';
import Sismicite from './sismicite.js';

// src/sismo/zones.js — zones sismogènes tracées sur un catalogue réel (banc « sismicité », mode « Catalogue réel ») et
// reprises par le banc « aléa » : statistiques d'une zone (séismes déclusterés du polygone, au-dessus de Mc, sur la période
// analysée : b d'Aki-Utsu et σ de Shi et Bolt, ou b régional si la zone a trop peu de séismes ; taux annuel ; Mmax
// observée ; profondeur médiane), format « sismo-zones » v1 (fichier et état partagé entre les bancs), projection locale
// en km autour d'un point de référence et modèle PSHA (Psha.calculer : zones en km, branches (a, b), ΔMmax, lois
// d'atténuation ; ni faille ni géodésie). Solveurs purs.
const Zones = (() => {
  'use strict';
  const FORMAT = 'sismo-zones', VERSION = 1, RAD = Math.PI / 180, KM = 6371 * RAD; // km par degré de grand cercle
  const MMIN_CALCUL = 4; // magnitude minimale du calcul d'aléa (domaine des lois d'atténuation)

  // Longitude ramenée à moins de 180° d'une longitude de référence.
  const pres = (lon, ref) => ref + ((((lon - ref + 180) % 360) + 360) % 360) - 180;
  // Point (lon, lat) dans un polygone [[lon, lat]…] (rayons croisés, longitudes ramenées autour du premier sommet : une
  // zone peut chevaucher l'antiméridien).
  function contient(polygone, lon, lat) {
    const ref = polygone[0][0], x = pres(lon, ref);
    let dedans = false;
    for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i++) {
      const xi = pres(polygone[i][0], ref), yi = polygone[i][1], xj = pres(polygone[j][0], ref), yj = polygone[j][1];
      if ((yi > lat) !== (yj > lat) && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }

  // Statistiques d'une zone. evts : séismes déclusterés du banc ({ t en années décimales, M ramenée à la classe de 0,1,
  // lat, lon, h }) ; période [debut, fin] (années) ; mc. b propre à la zone si elle a au moins nMin séismes au-dessus de
  // Mc, sinon b régional { b, sigma } (s'il est donné). λ = N(≥ Mc) / durée.
  function statistiques(evts, polygone, { debut, fin, mc, nMin = 30, bRegional = null }) {
    const dedans = evts.filter(e => e.t >= debut && e.t <= fin && contient(polygone, e.lon, e.lat));
    const sel = dedans.filter(e => e.M >= mc - 1e-9), duree = fin - debut;
    const vb = Sismicite.valeurB(sel.map(e => e.M), mc), propre = !!vb && vb.N >= nMin;
    const regle = propre ? vb : bRegional || vb;
    const hs = dedans.map(e => e.h).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      n: sel.length, nTotal: dedans.length, duree, b: regle ? regle.b : null, sigmaB: regle ? regle.sigma : null,
      bPropre: propre, bZone: vb ? vb.b : null, lam: duree > 0 ? sel.length / duree : 0,
      mmaxObs: dedans.length ? Math.max(...dedans.map(e => e.M)) : null, profondeur: hs.length ? hs[Math.floor(hs.length / 2)] : 10,
    };
  }
  // Mmax proposée : Mmax observée + 0,5, au moins Mc + 1 et le seuil du calcul + 1.
  const mmaxPropose = (mmaxObs, mc) => Math.round(Math.max((mmaxObs ?? mc) + 0.5, mc + 1, MMIN_CALCUL + 1) * 10) / 10;

  // ── Format « sismo-zones » v1 ───────────────────────────────────────────
  // { format, version, source: { catalogue, debut, fin, mc, b, sigmaB }, site: { lat, lon, vs30 }, zones: [{ id, nom,
  // polygone: [[lon, lat]…], mc, mmax, mmaxObs, b, sigmaB, bPropre, lam (λ(≥ mc) par an), n, rake, profondeur }] }.
  const fini = x => typeof x === 'number' && Number.isFinite(x);
  function ecrire({ source = {}, site, zones }) {
    return JSON.stringify({ format: FORMAT, version: VERSION, source, site, zones }, null, 1);
  }
  function lire(texte) {
    let j;
    try { j = typeof texte === 'string' ? JSON.parse(texte) : texte; } catch { throw new Error('ce fichier n\'est pas un fichier de zones (JSON illisible)'); }
    if (!j || j.format !== FORMAT) throw new Error('ce fichier n\'est pas un fichier de zones sismogènes du banc « sismicité »');
    if (j.version !== VERSION) throw new Error(`version ${j.version} du fichier de zones non prise en charge (attendue : ${VERSION})`);
    const s = j.site || {};
    if (!fini(s.lat) || !fini(s.lon) || Math.abs(s.lat) > 90) throw new Error('site sans latitude ni longitude valables');
    if (!Array.isArray(j.zones) || !j.zones.length) throw new Error('le fichier ne contient aucune zone');
    const zones = j.zones.map((z, i) => {
      const nom = String(z.nom || `Zone ${i + 1}`), err = m => { throw new Error(`${nom} : ${m}`); };
      if (!Array.isArray(z.polygone) || z.polygone.length < 3 || !z.polygone.every(p => Array.isArray(p) && fini(p[0]) && fini(p[1]) && Math.abs(p[1]) <= 90)) err('polygone de trois sommets au moins');
      if (!fini(z.mc) || !fini(z.mmax) || z.mmax <= Math.max(z.mc, MMIN_CALCUL)) err(`Mmax au-dessus de Mc et de ${MMIN_CALCUL}`);
      if (!fini(z.b) || z.b <= 0 || z.b > 3) err('b entre 0 et 3');
      if (!fini(z.lam) || z.lam <= 0) err('taux annuel nul : pas de séisme au-dessus de Mc dans la zone');
      return {
        id: String(z.id || `z${i + 1}`), nom, polygone: z.polygone.map(p => [p[0], p[1]]), mc: z.mc, mmax: z.mmax, mmaxObs: fini(z.mmaxObs) ? z.mmaxObs : null,
        b: z.b, sigmaB: fini(z.sigmaB) && z.sigmaB >= 0 ? z.sigmaB : 0, bPropre: !!z.bPropre, lam: z.lam, n: fini(z.n) ? z.n : null,
        rake: fini(z.rake) ? Math.max(-180, Math.min(180, z.rake)) : 0, profondeur: fini(z.profondeur) && z.profondeur >= 0 ? z.profondeur : 10,
      };
    });
    return { source: j.source || {}, site: { lat: s.lat, lon: s.lon, vs30: fini(s.vs30) && s.vs30 > 0 ? s.vs30 : 800 }, zones };
  }

  // ── Projection locale (équirectangulaire autour de la référence) ─────────
  // x vers l'est, y vers le nord, en km ; à quelques centaines de km de la référence, l'écart aux distances sur la sphère
  // reste de l'ordre du pour cent.
  function projection(lat0, lon0) {
    const k = Math.cos(lat0 * RAD) * KM;
    return {
      versKm: ([lon, lat]) => [(pres(lon, lon0) - lon0) * k, (lat - lat0) * KM],
      versGeo: ([x, y]) => [pres(lon0 + x / k, 0), lat0 + y / KM],
    };
  }
  // Centre (lon, lat) des sommets de toutes les zones.
  function centre(zones) {
    const pts = zones.flatMap(z => z.polygone), ref = pts[0][0];
    return { lon: pres(pts.reduce((s, p) => s + pres(p[0], ref), 0) / pts.length, 0), lat: pts.reduce((s, p) => s + p[1], 0) / pts.length };
  }

  // Modèle PSHA (Psha.calculer) d'un modèle de zones : repère en km autour de `reference` (le site par défaut), site à sa
  // place dans ce repère ; loi de chaque zone : λ(≥ Mc) et b (branches b ± 1,645σ si incAB et σ > 0), tronquée de
  // max(Mc, 4) à Mmax ; ΔMmax du modèle d'école si incMmax ; lois d'atténuation à poids égaux ; catalogue seul.
  function modelePsha(m, { reference = m.site, site = m.site, gmpe = ['akkar2014', 'bindi2014', 'boore2014'], incAB = true, incMmax = true, pasGrille = 10 } = {}) {
    const base = Psha.modeleDefaut(), pr = projection(reference.lat, reference.lon), [xs, ys] = pr.versKm([site.lon, site.lat]);
    const zones = m.zones.map(z => {
      const ajustement = { b: z.b, sigmaB: z.sigmaB || 0, lamPivot: z.lam, mPivot: z.mc };
      return {
        id: z.id, nom: z.nom, rake: z.rake, profondeur: z.profondeur, mmin: Math.max(z.mc, MMIN_CALCUL), mmax: z.mmax,
        polygone: z.polygone.map(pr.versKm), ajustement,
        ab: incAB && ajustement.sigmaB > 0 ? Psha.branchesAB(ajustement) : [{ a: Math.log10(z.lam) + z.b * z.mc, b: z.b, poids: 1 }],
      };
    });
    return {
      ...base, site: { x: xs, y: ys, vs30: site.vs30 ?? m.site.vs30 ?? 800 }, pasGrille, zones, failles: [],
      dMmax: incMmax ? base.dMmax : [{ d: 0, poids: 1 }], gmpe: gmpe.map(id => ({ id, poids: 1 / gmpe.length })), taux: [{ id: 'catalogue', nom: 'Catalogue', poids: 1 }],
    };
  }

  return { FORMAT, VERSION, MMIN_CALCUL, contient, statistiques, mmaxPropose, ecrire, lire, projection, centre, modelePsha };
})();
export default Zones;
