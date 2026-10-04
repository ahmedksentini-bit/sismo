import Globe from './globe.js';

// src/sismo/propagation.js — fronts d'onde dans le globe pour l'animation du banc « station ». Un faisceau de rais
// part du foyer dans toutes les directions (angle de départ de 0°, vers le bas, à 180°, vers le haut) ; chaque rai est
// un trajet de Globe (points [rayon, angle, temps]), et le front au temps t relie les positions des rais voisins.
//   famille P : rai descendant P s'il tourne dans le manteau, sinon PKP ou PKIKP (transmis dans le noyau) ; rai
//               montant réfléchi sous la surface (pP) puis repartant de même ; PcP, réfléchi sur le noyau, à part ;
//   famille S : S s'il tourne dans le manteau, sinon SKS (le noyau liquide ne transmet que des ondes P) ; sS en montant ;
//               ScS à part.
// Les ondes de surface (Rayleigh, Love) avancent le long de la surface à leur vitesse de groupe. Solveurs purs.
const Propagation = (() => {
  'use strict';
  const R = Globe.R, RAD = Math.PI / 180;
  const FAMILLES = {
    P: { onde: 'P', transmis: ['P', 'PKP', 'PKIKP'], reflechi: 'PcP' },
    S: { onde: 'S', transmis: ['S', 'SKS'], reflechi: 'ScS' },
  };

  // Vitesse au foyer, au-dessous (descente) ou au-dessus (montée) du foyer.
  function vitesseFoyer(onde, h, montee) {
    const c = Globe.sousCouches(h), rs = R - h, k = onde === 'S' ? 'vs' : 'vp';
    if (montee) { const a = c.find(x => Math.abs(x.rb - rs) < 1e-6); return a ? a[k][1] : c[0][k][0]; }
    return c.find(x => Math.abs(x.rh - rs) < 1e-6)[k][0];
  }
  // Montée du foyer à la surface pour le paramètre p : points [r, angle, temps], ou null si le rai tourne avant.
  function monter(p, onde, h) {
    if (h <= 0) return [[R, 0, 0]];
    const pts = [], u = Globe.traverser(p, onde, R, R - h, Globe.sousCouches(h), pts);
    if (u.impossible || u.tourne) return null;
    const out = [[R - h, 0, 0]];
    for (const [r, x, t] of [...pts].reverse()) if (r > R - h + 1e-9) out.push([r, u.dist - x, u.temps - t]);
    out.push([R, u.dist, u.temps]);
    return out;
  }
  // Premier trajet valide parmi une liste de phases, pour le paramètre p, foyer à h km.
  function premierTrajet(phases, h, p) {
    for (const ph of phases) { const t = Globe.trajet(ph, h, p); if (t) return { phase: ph, pts: t }; }
    return null;
  }
  // Trajet décalé (angle, temps) : prolongement d'un rai après sa réflexion sous la surface.
  const decaler = (pts, th, t0) => pts.map(([r, x, t]) => [r, x + th, t + t0]);

  // Faisceau d'une famille : rais répartis en angle de départ (depuis la verticale descendante), resserrés là où deux
  // rais voisins changent de phase (bord du noyau, zone d'ombre) ou émergent à plus de 1,5° l'un de l'autre.
  // Chaque rai : { depart (°), p, phase (transmise), pts, reflechi?: { phase, pts } }.
  const cache = new Map();
  function faisceau(famille, h, n = 91) {
    const cle = `${famille}|${h}|${n}`;
    if (cache.has(cle)) return cache.get(cle);
    if (cache.size > 8) cache.clear();
    const F = FAMILLES[famille];
    const rai = i => {
      const monte = i > 90, v = vitesseFoyer(F.onde, h, monte), p = ((R - h) * Math.sin(i * RAD)) / v;
      if (!monte) {
        const t = premierTrajet(F.transmis, h, p);
        if (!t) return null;
        const rf = Globe.trajet(F.reflechi, h, p);
        return { depart: i, p, phase: t.phase, pts: t.pts, reflechi: rf ? { phase: F.reflechi, pts: rf } : null };
      }
      // montée jusqu'à la surface, réflexion, puis le même rai qu'un foyer en surface (pP, sS)
      const m = monter(p, F.onde, h);
      if (!m) return null;
      const [, thS, tS] = m[m.length - 1], suite = premierTrajet(F.transmis, 0, p), nom = famille.toLowerCase();
      return suite ? { depart: i, p, phase: nom + suite.phase, pts: m.concat(decaler(suite.pts.slice(1), thS, tS)) } : { depart: i, p, phase: nom, pts: m };
    };
    const fin = r => r.pts[r.pts.length - 1][1];
    const ecarte = (a, b) => !a !== !b || (a && b && (a.phase !== b.phase || Math.abs(fin(a) - fin(b)) > 1.5 * RAD));
    // on évite l'horizontale exacte (rai rasant au foyer) et les verticales
    const angles = Array.from({ length: n }, (_, k) => Math.min(179.9, Math.max(0.05, (180 * k) / (n - 1))));
    const out = [];
    const affiner = (ia, a, ib, b, prof) => {
      if (prof >= 7 || !ecarte(a, b)) return;
      const im = (ia + ib) / 2, m = rai(im);
      affiner(ia, a, im, m, prof + 1);
      if (m) out.push(m);
      affiner(im, m, ib, b, prof + 1);
    };
    let prec = null;
    angles.forEach((i, k) => {
      const r = rai(i);
      if (k) affiner(angles[k - 1], prec, i, r, 0);
      if (r) out.push(r);
      prec = r;
    });
    out.sort((x, y) => x.depart - y.depart);
    cache.set(cle, out);
    return out;
  }

  // Front d'onde au temps t : polylignes de points [rayon, angle] (angle ≥ 0, côté de la station ; l'autre côté est
  // symétrique), chacune avec sa phase (propriété `phase`). Deux rais voisins sont reliés s'ils sont de la même phase et
  // assez proches (sinon le front se coupe : zone d'ombre, bord du noyau). Option `reflechis` : fronts des ondes
  // réfléchies sur le noyau (PcP, ScS).
  function front(rais, t, { reflechis = false, ecart = 900 } = {}) {
    const lignes = [];
    let cour = [], phase = null, prec = null, precRai = null;
    const couper = () => { if (cour.length > 1) lignes.push(Object.assign(cour, { phase })); cour = []; };
    // point où le front rejoint la surface entre un rai déjà arrivé (a) et un rai voisin encore en route (b) : on
    // interpole leurs arrivées (angle, temps) pour que le front touche la surface au lieu de s'arrêter sous elle
    const jonction = (a, b) => {
      const fa = a.pts[a.pts.length - 1], fb = b.pts[b.pts.length - 1];
      if (fa[0] !== R || fb[0] !== R || fa[2] > t || fb[2] <= t || Math.abs(fb[1] - fa[1]) > 5 * RAD) return null;
      return [R, fa[1] + ((t - fa[2]) / (fb[2] - fa[2])) * (fb[1] - fa[1])];
    };
    for (const r of rais) {
      const src = reflechis ? r.reflechi : r;
      const q = src ? Globe.position(src.pts, t) : null, ph = src ? src.phase : null;
      if (!q) {
        if (src && precRai && precRai.phase === ph && cour.length) { const j = jonction(src, precRai); if (j) cour.push(j); }
        couper(); prec = null; phase = ph; precRai = src;
        continue;
      }
      if (prec && (ph !== phase || corde(prec, q) > ecart)) couper();
      if (!cour.length && precRai && precRai.phase === ph && !Globe.position(precRai.pts, t)) { const j = jonction(precRai, src); if (j) cour.push(j); }
      cour.push(q); prec = q; phase = ph; precRai = src;
    }
    couper();
    return lignes;
  }
  const corde = ([r1, a1], [r2, a2]) => Math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(a1 - a2));

  // Arrivées en surface d'un faisceau : [angle (°), temps (s), phase] de chaque rai, pour vérifier la cohérence avec
  // les tables de temps de trajet.
  const arrivees = rais => rais.map(r => { const f = r.pts[r.pts.length - 1]; return f[0] === R ? { distance: f[1] / RAD, temps: f[2], phase: r.phase } : null; }).filter(Boolean);

  // Rais vers la station : trajet de chaque arrivée des phases demandées.
  function raisStation(h, distance, phases) {
    const out = [];
    for (const ph of phases) for (const a of Globe.arrivees(ph, h, distance)) out.push({ phase: ph, temps: a.temps, p: a.p, pts: Globe.trajet(ph, h, a.p) });
    return out.sort((x, y) => x.temps - y.temps);
  }

  return { FAMILLES, faisceau, front, arrivees, raisStation, monter };
})();
export default Propagation;
