import AK135 from './coefficients/ak135.js';

// src/sismo/globe.js — rais sismiques dans une Terre à symétrie sphérique (modèle ak135, exporté d'ObsPy) : couches
// de croûte, manteau, noyau externe liquide (Vs = 0) et graine. Chaque intervalle du modèle est découpé en
// sous-couches de 10 km au plus où la vitesse suit la loi de Bullen v = A·r^B ; avec η = r/v (s/rad) et le paramètre
// de rai p, la distance et le temps à travers une sous-couche ont une forme close :
//   Δ = [arccos(p/η)]/k et T = [√(η² − p²)]/k entre ses bornes, k = 1 − B = dln η/dln r.
// Phases : P, S (retour dans le manteau), PcP, ScS (réflexion sur le noyau), PKP (retour dans le noyau externe),
// PKiKP (réflexion sur la graine), PKIKP (retour dans la graine), SKS. Arrivées par balayage de p et dichotomie,
// comme TauP. Vérifié contre TauP (tests/references/phases.json, tools/obspy/globe.py). Solveurs purs.
const Globe = (() => {
  'use strict';
  const R = 6371, DEG = 180 / Math.PI, PAS = 10;
  // Discontinuités principales : Moho (première discontinuité où Vp passe à plus de 7,6 km/s), 410 et 660 km
  // (zone de transition du manteau), noyau (CMB, Vs nulle dessous), graine (ICB, Vs de nouveau positive).
  const saut = test => AK135.find((l, i) => i && l[0] === AK135[i - 1][0] && test(AK135[i - 1], l))[0];
  const zMoho = saut((a, b) => a[1] < 7.6 && b[1] >= 7.6), zNoyau = AK135.find(l => l[2] === 0)[0];
  const zGraine = AK135[AK135.map(l => l[2] === 0).lastIndexOf(true)][0];
  const z410 = saut((a, b) => a[0] > 300 && a[0] < 500), z660 = saut((a, b) => a[0] > 600 && a[0] < 700);
  const RAYONS = { surface: R, moho: R - zMoho, d410: R - z410, d660: R - z660, noyau: R - zNoyau, graine: R - zGraine };

  // Sous-couches (de la surface vers le centre) pour un foyer à la profondeur h : on ajoute un nœud au foyer.
  // Chaque sous-couche : rayons haut et bas, vitesses P et S interpolées linéairement en profondeur aux nœuds.
  const cache = new Map();
  function sousCouches(h) {
    const cle = h.toFixed(6);
    if (cache.has(cle)) return cache.get(cle);
    const out = [];
    for (let i = 0; i + 1 < AK135.length; i++) {
      const [z1, p1, s1] = AK135[i], [z2, p2, s2] = AK135[i + 1];
      if (z2 <= z1) continue;
      const noeuds = [], n = Math.max(1, Math.ceil((z2 - z1) / PAS));
      for (let j = 0; j <= n; j++) noeuds.push(z1 + ((z2 - z1) * j) / n);
      if (h > z1 && h < z2 && !noeuds.some(z => Math.abs(z - h) < 1e-9)) { noeuds.push(h); noeuds.sort((a, b) => a - b); }
      const v = (z, a, b) => a + ((b - a) * (z - z1)) / (z2 - z1);
      for (let j = 0; j + 1 < noeuds.length; j++) {
        const za = noeuds[j], zb = noeuds[j + 1];
        out.push({ rh: R - za, rb: R - zb, vp: [v(za, p1, p2), v(zb, p1, p2)], vs: [v(za, s1, s2), v(zb, s1, s2)] });
      }
    }
    cache.set(cle, out);
    return out;
  }
  // Vitesse d'une onde dans une sous-couche : P et S du manteau, K (P du noyau externe), I (P de la graine).
  const vitesse = (c, onde) => (onde === 'S' ? c.vs : c.vp);

  // Traversée descendante de rHaut à rBas, ou jusqu'au point de retour : distance (rad), temps (s), point de retour.
  // Option `points` : renvoie aussi les points (r, Δ cumulée) de chaque frontière de sous-couche, pour les tracés.
  function traverser(p, onde, rHaut, rBas, couches, points = null) {
    let dist = 0, temps = 0;
    for (const c of couches) {
      if (c.rb >= rHaut - 1e-9) continue;
      if (c.rh <= rBas + 1e-9) break;
      const [va, vb] = vitesse(c, onde);
      if (!(va > 0 && vb > 0)) return { dist, temps, impossible: true };
      const rh = Math.min(c.rh, rHaut), rb = Math.max(c.rb, rBas);
      // vitesses aux bornes effectives (loi de Bullen entre les nœuds de la sous-couche)
      const B = Math.log(va / vb) / Math.log(c.rh / c.rb), A = va / Math.pow(c.rh, B);
      const eh = rh / (A * Math.pow(rh, B)), eb = rb / (A * Math.pow(rb, B)), k = 1 - B;
      if (p > eh + 1e-12) return { dist, temps, tourne: true, rTour: rh };            // ne pénètre pas : retour au sommet
      let eBas = eb, tourne = false, rTour = null;
      if (k > 0 && p > eb) { eBas = p; tourne = true; rTour = Math.pow(p * A, 1 / k); } // retour dans la sous-couche
      if (Math.abs(k) < 1e-10) {
        const l = Math.log(rh / rb), s = Math.sqrt(eh * eh - p * p);
        dist += (p * l) / s; temps += (eh * eh * l) / s;
      } else {
        dist += (Math.acos(Math.min(1, p / eh)) - Math.acos(Math.min(1, p / eBas))) / k;
        temps += (Math.sqrt(Math.max(eh * eh - p * p, 0)) - Math.sqrt(Math.max(eBas * eBas - p * p, 0))) / k;
      }
      if (points) points.push([tourne ? rTour : rb, dist]);
      if (tourne) return { dist, temps, tourne: true, rTour };
    }
    return { dist, temps, tourne: false };
  }

  // Phases : segments descendants successifs { onde, bas } ; le dernier retourne (« tourne ») ou se réfléchit.
  const PHASES = {
    P: [{ onde: 'P', bas: 'noyau', fin: 'tourne' }],
    S: [{ onde: 'S', bas: 'noyau', fin: 'tourne' }],
    PcP: [{ onde: 'P', bas: 'noyau', fin: 'reflexion' }],
    ScS: [{ onde: 'S', bas: 'noyau', fin: 'reflexion' }],
    PKP: [{ onde: 'P', bas: 'noyau' }, { onde: 'K', bas: 'graine', fin: 'tourne' }],
    PKiKP: [{ onde: 'P', bas: 'noyau' }, { onde: 'K', bas: 'graine', fin: 'reflexion' }],
    PKIKP: [{ onde: 'P', bas: 'noyau' }, { onde: 'K', bas: 'graine' }, { onde: 'I', bas: 'centre', fin: 'tourne' }],
    SKS: [{ onde: 'S', bas: 'noyau' }, { onde: 'K', bas: 'graine', fin: 'tourne' }],
  };
  const rayonDe = nom => (nom === 'centre' ? 0 : RAYONS[nom]);

  // Distance (rad) et temps (s) d'une phase pour le paramètre p, foyer à h km ; null si p n'appartient pas à la phase.
  function evaluer(phase, p, h, avecPoints = false) {
    const segs = PHASES[phase], couches = sousCouches(h), rs = R - h;
    let dist = 0, temps = 0, haut = rs, dDesc = 0, dMont = 0;
    const descente = avecPoints ? [] : null, montee = avecPoints ? [] : null;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], bas = rayonDe(s.bas), dernier = i === segs.length - 1;
      // descente depuis le foyer, puis montée vers la surface : mêmes couches sauf le premier segment (foyer ↔ surface)
      const pd = avecPoints ? [] : null, pm = avecPoints ? [] : null;
      const d = traverser(p, s.onde, haut, bas, couches, pd), m = traverser(p, s.onde, i === 0 ? R : haut, bas, couches, pm);
      if (d.impossible || m.impossible) return null;
      if (dernier && s.fin === 'tourne' ? !(d.tourne && m.tourne) : d.tourne || m.tourne) return null;
      // un rai qui ne pénètre pas dans la région du segment s'y réfléchit totalement : ce n'est pas cette phase
      if (d.tourne && d.rTour >= haut - 1e-9) return null;
      dist += d.dist + m.dist; temps += d.temps + m.temps; haut = bas;
      // points cumulés depuis le foyer (descente) et depuis la station (montée)
      if (avecPoints) { pd.forEach(([r, x]) => descente.push([r, dDesc + x])); pm.forEach(([r, x]) => montee.push([r, dMont + x])); }
      dDesc += d.dist; dMont += m.dist;
    }
    return avecPoints ? { dist, temps, descente, montee } : { dist, temps };
  }

  // Branches d'une phase : balayage de p de 0 au maximum admis au foyer (η du foyer pour l'onde de départ).
  // Vitesse de l'onde de départ au foyer : au sommet de la sous-couche qui commence au foyer.
  const vitesseFoyer = (phase, h) => vitesse(sousCouches(h).find(c => Math.abs(c.rh - (R - h)) < 1e-6), PHASES[phase][0].onde)[0];

  // Aux bords d'une branche (rai rasant le noyau ou la graine), Δ(p) varie très vite : on cherche le bord par
  // dichotomie et l'on resserre l'échantillonnage vers lui, en progression géométrique.
  const brCache = new Map();
  function branche(phase, h, n = 600) {
    const cle = `${phase}|${h}`;
    if (brCache.has(cle)) return brCache.get(cle);
    const pMax = (R - h) / vitesseFoyer(phase, h);
    const point = p => { const e = evaluer(phase, p, h); return e ? { p, dist: e.dist, temps: e.temps } : null; };
    const brut = [];
    for (let i = 0; i <= n; i++) brut.push({ p: pMax * (1 - Math.pow(1 - i / n, 1.5)) * (1 - 1e-9) });
    brut.forEach(b => { b.e = point(b.p); });
    const pts = [];
    for (let i = 0; i < brut.length; i++) {
      pts.push(brut[i].e);
      if (i + 1 === brut.length || !brut[i].e === !brut[i + 1].e) continue;
      // bord entre un échantillon valide et un échantillon hors de la phase
      let pv = brut[i].e ? brut[i].p : brut[i + 1].p, pi = brut[i].e ? brut[i + 1].p : brut[i].p;
      for (let it = 0; it < 50; it++) { const pm = (pv + pi) / 2; if (point(pm)) pv = pm; else pi = pm; }
      const pBord = pv, pDepart = brut[i].e ? brut[i].p : brut[i + 1].p, extra = [];
      for (let j = 1; j <= 40; j++) extra.push(point(pBord + (pDepart - pBord) * Math.pow(0.7, j)));
      extra.push(point(pBord));
      const ordonnes = extra.filter(Boolean).sort((a, b) => a.p - b.p);
      if (brut[i].e) pts.push(...ordonnes, null); else { pts.push(null, ...ordonnes); }
    }
    brCache.set(cle, pts);
    return pts;
  }
  // Arrivées d'une phase à la distance Δ (degrés) : toutes les solutions de Δ(p) = Δ (rais directs, sans passage par
  // l'antipode), triées par temps. Chaque arrivée : temps (s), p (s/rad), angles au départ et à l'arrivée (degrés).
  function arrivees(phase, h, distance) {
    const cible = distance / DEG, pts = branche(phase, h), out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b || a.p === b.p || (a.dist - cible) * (b.dist - cible) > 0) continue;
      let pa = a.p, pb = b.p, da = a.dist - cible;
      for (let it = 0; it < 60; it++) {
        const pm = (pa + pb) / 2, e = evaluer(phase, pm, h);
        if (!e) break;
        if ((e.dist - cible) * da <= 0) pb = pm; else { pa = pm; da = e.dist - cible; }
      }
      const p = (pa + pb) / 2, e = evaluer(phase, p, h);
      if (!e) continue;
      const v0 = vitesseFoyer(phase, h), vs = vitesse(sousCouches(0)[0], PHASES[phase][0].onde)[0];
      out.push({ phase, temps: e.temps, p, depart: Math.asin(Math.min(1, (p * v0) / (R - h))) * DEG, incidence: Math.asin(Math.min(1, (p * vs) / R)) * DEG });
    }
    out.sort((x, y) => x.temps - y.temps);
    return out.filter((x, i) => !i || Math.abs(x.temps - out[i - 1].temps) > 1e-6);
  }

  // Tracé d'un rai : points [rayon (km), angle (rad)] du foyer (angle 0) jusqu'à la station.
  function trajet(phase, h, p) {
    const e = evaluer(phase, p, h, true);
    if (!e) return null;
    const desc = [[R - h, 0], ...e.descente];
    // montée : points comptés depuis la station, parcourus à l'envers à partir du point bas
    const mont = e.montee, totalMontee = mont.length ? mont[mont.length - 1][1] : 0;
    const bas = desc[desc.length - 1][1];
    const up = [...mont].reverse().map(([r, d]) => [r, bas + totalMontee - d]).concat([[R, bas + totalMontee]]);
    return [...desc, ...up];
  }

  return { R, RAYONS, PHASES, sousCouches, traverser, evaluer, branche, arrivees, trajet, modele: AK135 };
})();
export default Globe;
