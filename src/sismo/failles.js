import Faille from './faille.js';
import Zones from './zones.js';

// src/sismo/failles.js — failles actives réelles pour l'aléa (banc « aléa », mode « Zones du catalogue ») : lecture de la
// base GEM des failles actives (GEM Global Active Faults Database, Styron et Pagani 2020, GeoJSON « harmonisé » : attributs
// en triplets « (préférée, min, max) ») et de son extrait compact « sismo-failles » (data/failles-mediterranee.json, produit
// par tools/failles/gem.mjs) ; valeurs par défaut par type de glissement ; vitesse de glissement nette, ou recomposée de ses
// composantes ; failles retenues par zone (milieu de la trace dans la zone), trace ramenée à la droite qui joint ses
// extrémités, orientée selon la règle de la main droite d'après le sens du pendage ; Mmax = rupture de toute la faille
// (Wells et Coppersmith 1994) ; pas du maillage adapté au temps de calcul. Solveurs purs.
const Failles = (() => {
  'use strict';
  const FORMAT = 'sismo-failles', VERSION = 1, RAD = Math.PI / 180, R = 6371;
  const fini = x => typeof x === 'number' && Number.isFinite(x);

  // ── Types de glissement de la base GEM ──────────────────────────────────
  // Rake (Aki et Richards) : normale −90, inverse 90, dextre 180, senestre 0 ; obliques à 45° des deux mécanismes purs.
  // Pendage par défaut proche des médianes de la base : décrochement 90°, normale 55°, inverse 45°, oblique 70° ; nom français.
  // Écartés : frontières de plaques (subduction, dorsale, transformante), plis, type absent.
  const TYPES = {
    Normal: { rake: -90, pendage: 55, nom: 'normale' }, Reverse: { rake: 90, pendage: 45, nom: 'inverse' },
    'Blind Thrust': { rake: 90, pendage: 45, nom: 'chevauchement aveugle' }, Thrust: { rake: 90, pendage: 45, nom: 'chevauchement' },
    Dextral: { rake: 180, pendage: 90, nom: 'décrochement dextre' }, Sinistral: { rake: 0, pendage: 90, nom: 'décrochement senestre' },
    'Strike-Slip': { rake: 0, pendage: 90, nom: 'décrochement' },
    'Dextral-Normal': { rake: -135, pendage: 70, nom: 'dextre et normale' }, 'Normal-Dextral': { rake: -135, pendage: 70, nom: 'normale et dextre' },
    'Sinistral-Normal': { rake: -45, pendage: 70, nom: 'senestre et normale' }, 'Normal-Sinistral': { rake: -45, pendage: 70, nom: 'normale et senestre' },
    'Normal-Strike-Slip': { rake: -45, pendage: 70, nom: 'normale et décrochante' },
    'Dextral-Reverse': { rake: 135, pendage: 70, nom: 'dextre et inverse' }, 'Reverse-Dextral': { rake: 135, pendage: 70, nom: 'inverse et dextre' },
    'Sinistral-Reverse': { rake: 45, pendage: 70, nom: 'senestre et inverse' }, 'Reverse-Sinistral': { rake: 45, pendage: 70, nom: 'inverse et senestre' },
    'Reverse-Strike-Slip': { rake: 45, pendage: 70, nom: 'inverse et décrochante' }, 'Dextral-Oblique': { rake: 180, pendage: 70, nom: 'dextre oblique' },
  };
  const ECARTES = /^(Subduction|Spreading|Anticline|Syncline|.*Transform)/;
  const CATALOGUES_ECARTES = ['Bird 2003']; // modèle de frontières de plaques, qui double les catalogues de failles
  const Z_HAUT = 0, Z_BAS = 15;
  // Sens du pendage : points cardinaux (N, NNE…) ou azimut en degrés.
  const CARDINAUX = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function azimutSens(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).trim().toUpperCase().replace(/^([NESW]{1,3})\b.*$/, '$1');
    const i = CARDINAUX.indexOf(t);
    if (i >= 0) return i * 22.5;
    const x = Number(t);
    return t !== '' && Number.isFinite(x) ? ((x % 360) + 360) % 360 : null;
  }

  // Triplet « (préférée, min, max) » : { pref, min, max } (pref = milieu de min et max s'il manque), null si illisible.
  function triplet(s) {
    if (fini(s)) return { pref: s, min: null, max: null };
    if (typeof s !== 'string') return null;
    const m = /^\s*\(([^)]*)\)\s*$/.exec(s);
    if (!m) return null;
    const v = m[1].split(',').map(x => (x.trim() === '' ? NaN : Number(x)));
    const [a, b, c] = [v[0], v[1], v[2]].map(x => (Number.isFinite(x) ? x : null));
    const pref = a !== null ? a : b !== null && c !== null ? (b + c) / 2 : null;
    return pref === null ? null : { pref, min: b, max: c };
  }

  // ── Géodésie sur la sphère ──────────────────────────────────────────────
  function distanceKm(lon1, lat1, lon2, lat2) {
    const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
    const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function azimut(lon1, lat1, lon2, lat2) {
    const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
    return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD) + 360) % 360;
  }
  // Longueur de la trace (km) et son point milieu (à mi-longueur).
  function longueurTrace(trace) {
    let L = 0;
    for (let i = 1; i < trace.length; i++) L += distanceKm(trace[i - 1][0], trace[i - 1][1], trace[i][0], trace[i][1]);
    return L;
  }
  function milieu(trace) {
    const L = longueurTrace(trace);
    let s = 0;
    for (let i = 1; i < trace.length; i++) {
      const d = distanceKm(trace[i - 1][0], trace[i - 1][1], trace[i][0], trace[i][1]);
      if (s + d >= L / 2 && d > 0) {
        const t = (L / 2 - s) / d;
        return [trace[i - 1][0] + t * (trace[i][0] - trace[i - 1][0]), trace[i - 1][1] + t * (trace[i][1] - trace[i - 1][1])];
      }
      s += d;
    }
    return trace[0].slice();
  }

  // ── Lecture ─────────────────────────────────────────────────────────────
  // Faille normalisée : { id, nom, catalogue, type, pendage, rake, glissement ({ pref, min, max } ou null : vitesse nette en
  // mm/an), zHaut, zBas (km, null si absentes), sens (azimut du pendage, null), trace [[lon, lat]…] }.
  const nombre = x => (fini(x) ? x : null);
  // Vitesse nette : net_slip_rate, sinon recomposée de la composante décrochante et de la composante pendage (déduite du
  // rejet vertical, ε/sin δ, ou du raccourcissement horizontal, |ε|/cos δ).
  function glissementGem(p, pendage) {
    const net = triplet(p.net_slip_rate);
    if (net) return net;
    const ss = triplet(p.strike_slip_rate), ds = triplet(p.dip_slip_rate), vs = triplet(p.vert_sep_rate), sh = triplet(p.shortening_rate);
    const d = (pendage ?? 90) * RAD;
    let pente = ds ? Math.abs(ds.pref) : null;
    if (pente === null && vs && Math.sin(d) > 0.1) pente = Math.abs(vs.pref) / Math.sin(d);
    if (pente === null && sh && Math.cos(d) > 0.1) pente = Math.abs(sh.pref) / Math.cos(d);
    if (!ss && pente === null) return null;
    return { pref: Math.hypot(ss ? ss.pref : 0, pente || 0), min: null, max: null, recompose: true };
  }
  // GeoJSON de la base GEM (FeatureCollection de LineString ou MultiLineString). Renvoie { failles, ecartees: { type,
  // plaques, geometrie } }.
  function lireGem(j) {
    const failles = [], ecartees = { type: 0, plaques: 0, geometrie: 0 };
    for (const ft of j.features || []) {
      const p = ft.properties || {}, g = ft.geometry || {};
      if (CATALOGUES_ECARTES.includes(p.catalog_name)) { ecartees.plaques++; continue; }
      const type = typeof p.slip_type === 'string' ? p.slip_type.trim() : '';
      if (!type || ECARTES.test(type) || !TYPES[type]) { ecartees.type++; continue; }
      const lignes = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      // MultiLineString : la plus longue partie
      const trace = lignes.map(l => (l || []).filter(q => Array.isArray(q) && fini(q[0]) && fini(q[1]) && Math.abs(q[1]) <= 90).map(q => [q[0] > 180 ? q[0] - 360 : q[0], q[1]]))
        .filter(l => l.length >= 2).sort((a, b) => longueurTrace(b) - longueurTrace(a))[0];
      if (!trace) { ecartees.geometrie++; continue; }
      const dip = triplet(p.average_dip), rake = triplet(p.average_rake), haut = triplet(p.upper_seis_depth), bas = triplet(p.lower_seis_depth);
      const pendage = dip && dip.pref > 0 && dip.pref <= 90 ? dip.pref : null;
      const nom = [p.name, p.fs_name].map(s => (typeof s === 'string' ? s.trim() : '')).find(s => s && s !== 'None') || '';
      failles.push({
        id: String(p.catalog_id ?? ''), nom, catalogue: String(p.catalog_name ?? ''), type, pendage,
        rake: rake && rake.pref >= -180 && rake.pref <= 180 ? rake.pref : null, glissement: glissementGem(p, pendage ?? TYPES[type].pendage),
        zHaut: haut && haut.pref >= 0 ? haut.pref : null, zBas: bas && bas.pref > 0 ? bas.pref : null, sens: azimutSens(p.dip_dir), trace,
      });
    }
    return { failles, ecartees };
  }
  // Extrait compact « sismo-failles » v1 : { format, version, source, failles: [{ id, nom, cat, type, pendage, rake,
  // glissement: [pref, min, max] | null, zHaut, zBas, sens, trace: [lon, lat, lon, lat…] }] }.
  function lireCompact(j) {
    if (j.version !== VERSION) throw new Error(`version ${j.version} du fichier de failles non prise en charge (attendue : ${VERSION})`);
    const failles = [];
    for (const f of j.failles || []) {
      const t = Array.isArray(f.trace) ? f.trace : [], trace = [];
      for (let i = 0; i + 1 < t.length; i += 2) if (fini(t[i]) && fini(t[i + 1])) trace.push([t[i], t[i + 1]]);
      if (trace.length < 2 || !TYPES[f.type]) continue;
      const gl = Array.isArray(f.glissement) && fini(f.glissement[0]) ? { pref: f.glissement[0], min: nombre(f.glissement[1]), max: nombre(f.glissement[2]) } : null;
      failles.push({ id: String(f.id ?? ''), nom: String(f.nom ?? ''), catalogue: String(f.cat ?? ''), type: f.type, pendage: nombre(f.pendage), rake: nombre(f.rake),
        glissement: gl, zHaut: nombre(f.zHaut), zBas: nombre(f.zBas), sens: nombre(f.sens), trace });
    }
    return { failles, ecartees: { type: 0, plaques: 0, geometrie: 0 } };
  }
  // Fichier de failles (texte ou objet) : base GEM ou extrait « sismo-failles ». { format, source, failles, ecartees }.
  function lire(entree) {
    let j;
    try { j = typeof entree === 'string' ? JSON.parse(entree.charCodeAt(0) === 0xfeff ? entree.slice(1) : entree) : entree; } catch { throw new Error('ce fichier n\'est pas un fichier GeoJSON (JSON illisible)'); }
    if (!j || typeof j !== 'object') throw new Error('fichier de failles vide');
    let r, format;
    if (j.format === FORMAT) { r = lireCompact(j); format = FORMAT; }
    else if (j.type === 'FeatureCollection' && Array.isArray(j.features)) { r = lireGem(j); format = 'gem'; }
    else throw new Error('ni GeoJSON de la base GEM des failles actives (FeatureCollection), ni extrait « sismo-failles »');
    if (!r.failles.length) throw new Error('aucune faille lisible : il faut des LineString avec l\'attribut slip_type de la base GEM');
    return { format, source: j.source || null, ...r };
  }
  // Extrait compact d'une liste de failles normalisées (coordonnées arrondies à `dec` décimales).
  function ecrire({ source = {}, failles }, { dec = 3 } = {}) {
    const k = 10 ** dec, ar = x => Math.round(x * k) / k, r2 = x => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
    return JSON.stringify({ format: FORMAT, version: VERSION, source, failles: failles.map(f => ({
      id: f.id, nom: f.nom, cat: f.catalogue, type: f.type, pendage: r2(f.pendage), rake: r2(f.rake),
      glissement: f.glissement ? [r2(f.glissement.pref), r2(f.glissement.min), r2(f.glissement.max)] : null,
      zHaut: r2(f.zHaut), zBas: r2(f.zBas), sens: r2(f.sens), trace: f.trace.flatMap(q => [ar(q[0]), ar(q[1])]),
    })) });
  }
  // Simplification d'une trace (Ramer-Douglas-Peucker, tolérance en degrés, longitudes réduites par cos φ).
  function simplifier(trace, tol) {
    if (trace.length <= 2) return trace.slice();
    const c = Math.cos(trace[0][1] * RAD), garder = new Uint8Array(trace.length);
    garder[0] = garder[trace.length - 1] = 1;
    const pile = [[0, trace.length - 1]];
    while (pile.length) {
      const [i, j] = pile.pop(), [ax, ay] = [trace[i][0] * c, trace[i][1]], [bx, by] = [trace[j][0] * c, trace[j][1]];
      let dmax = 0, kmax = -1;
      for (let k = i + 1; k < j; k++) {
        const px = trace[k][0] * c, py = trace[k][1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
        const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0, d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
        if (d > dmax) { dmax = d; kmax = k; }
      }
      if (dmax > tol) { garder[kmax] = 1; pile.push([i, kmax], [kmax, j]); }
    }
    return trace.filter((_, k) => garder[k]);
  }

  // ── Paramètres retenus et sources de l'aléa ─────────────────────────────
  // Paramètres d'une faille, défauts appliqués : { pendage, rake, zHaut, zBas, glissement (mm/an, null), defauts: [noms] }.
  function parametres(f, { glissementDefaut = 0 } = {}) {
    const t = TYPES[f.type], defauts = [];
    const val = (v, d, nom) => { if (v === null || v === undefined) { defauts.push(nom); return d; } return v; };
    const pendage = val(f.pendage, t.pendage, 'pendage'), rake = val(f.rake, t.rake, 'rake');
    let zHaut = val(f.zHaut, Z_HAUT, 'profondeurs'), zBas = f.zBas ?? null;
    if (zBas === null) { if (!defauts.includes('profondeurs')) defauts.push('profondeurs'); zBas = Z_BAS; }
    if (zBas <= zHaut + 1) { zHaut = Z_HAUT; zBas = Z_BAS; if (!defauts.includes('profondeurs')) defauts.push('profondeurs'); }
    let glissement = f.glissement ? f.glissement.pref : null;
    if (!(glissement > 0)) { glissement = glissementDefaut > 0 ? glissementDefaut : null; defauts.push('glissement'); }
    return { pendage, rake, zHaut, zBas, glissement, defauts };
  }
  // Failles retenues pour un modèle de zones { zones: [{ polygone [[lon, lat]…], mmax }] } : celles dont le milieu de la
  // trace est dans une zone, avec une vitesse de glissement (ou glissementDefaut > 0) et une longueur d'au moins
  // longueurMin km. Trace ramenée à ses extrémités, orientée pour que le pendage soit à droite (azimut + 90°) quand le sens
  // du pendage est connu ; L : distance des extrémités, W = (zBas − zHaut)/sin δ ; Mmax de la rupture de toute la faille,
  // au dixième. Renvoie { retenues, ecartees: { horsZones, sansVitesse, tropCourtes } }.
  function retenir(failles, zones, { glissementDefaut = 0, longueurMin = 5 } = {}) {
    const retenues = [], ecartees = { horsZones: 0, sansVitesse: 0, tropCourtes: 0 };
    failles.forEach((f, i) => {
      const [lon, lat] = milieu(f.trace), iz = zones.findIndex(z => Zones.contient(z.polygone, lon, lat));
      if (iz < 0) { ecartees.horsZones++; return; }
      const p = parametres(f, { glissementDefaut });
      if (!(p.glissement > 0)) { ecartees.sansVitesse++; return; }
      let a = f.trace[0], b = f.trace[f.trace.length - 1];
      const L = distanceKm(a[0], a[1], b[0], b[1]);
      if (L < longueurMin) { ecartees.tropCourtes++; return; }
      if (f.sens !== null && p.pendage < 89.5) {
        const ecart = Math.abs(((azimut(a[0], a[1], b[0], b[1]) + 90 - f.sens + 540) % 360) - 180);
        if (ecart > 90) [a, b] = [b, a];
      }
      const W = (p.zBas - p.zHaut) / Math.sin(p.pendage * RAD), mmax = Math.round(Faille.magnitudeFailleEntiere(L * W, p.rake) * 10) / 10;
      retenues.push({ indice: i, id: f.id, nom: f.nom || f.id || `Faille ${i + 1}`, type: f.type, zone: iz, extremites: [a.slice(), b.slice()], L, W, ...p, mmax });
    });
    return { retenues, ecartees };
  }
  // Nombre de ruptures flottantes à calculer (somme sur les failles et les classes de magnitude de 0,1, de Mmax de la zone
  // + dMin à Mmax de la faille) pour un pas de maillage donné : le coût du calcul en est proportionnel.
  function nombreRuptures(retenues, mmaxZones, pas, { dMin = -0.3 } = {}) {
    let n = 0;
    for (const f of retenues) {
      const g = Faille.geometrie({ trace: [[0, 0], [0, f.L]], pendage: f.pendage, zHaut: f.zHaut, zBas: f.zBas }, pas);
      if (g.L <= 0 || g.W <= 0) continue;
      const m0 = Math.round((mmaxZones[f.zone] + dMin) * 10) / 10;
      for (let M = m0 + 0.05; M < f.mmax; M += 0.1) n += Faille.ruptures(g, M, f.rake).length;
    }
    return n;
  }
  // Pas du maillage (km) : le plus petit de la liste qui garde au plus `cible` ruptures (≈ 50 µs chacune pour 13 grandeurs
  // et 3 lois : 15 000 ruptures font moins d'une seconde).
  const PAS_FAILLES = [1, 2, 3, 5, 10];
  function pasAdapte(retenues, mmaxZones, { cible = 15000, pas = PAS_FAILLES } = {}) {
    let choix = null;
    for (const p of pas) {
      choix = { pas: p, n: nombreRuptures(retenues, mmaxZones, p) };
      if (choix.n <= cible) break;
    }
    return choix;
  }
  return { FORMAT, VERSION, TYPES, Z_HAUT, Z_BAS, PAS_FAILLES, triplet, azimutSens, distanceKm, azimut, longueurTrace, milieu, lireGem, lireCompact, lire, ecrire, simplifier,
    parametres, retenir, nombreRuptures, pasAdapte };
})();
export default Failles;
