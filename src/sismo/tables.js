// src/sismo/tables.js — tables de temps de trajet et leur lecture. Table régionale de la croûte du cours (Pg, Pn, Sg,
// Sn : Sismo.temps), tables télésismiques ak135 (première arrivée de chaque phase : Globe, vérifié contre TauP),
// lecture par interpolation linéaire entre deux lignes, et inversion exacte par dichotomie pour contrôle.
// Solveurs purs : aucun accès au DOM.
import Sismo from './signal.js';
import Globe from './globe.js';

const Tables = (() => {
  'use strict';

  const PHASES_TELE = ['P', 'PcP', 'PKIKP', 'PKiKP', 'PKP', 'S', 'ScS', 'SKS'];

  // Table régionale : temps depuis l'origine (s), foyer à h km dans la croûte du cours ; S − P = Sg − première P
  // (la S pointée est Sg, comme au banc « réseau »).
  function regionale({ h = 10, distances, modele = Sismo.MODELE }) {
    return distances.map((d) => {
      const t = Sismo.temps(d, h, modele);
      return { d, Pg: t.tPg, Pn: t.tPn, Sg: t.tSg, Sn: t.tSn, P: t.tP, premiere: t.tPn !== null && t.tPn < t.tPg ? 'Pn' : 'Pg', SP: t.tSg - t.tP };
    });
  }

  // Première arrivée d'une phase (s), null si la phase n'atteint pas la distance (zone d'ombre, réflexion totale…).
  function premiere(phase, h, d) {
    const a = Globe.arrivees(phase, h, d);
    return a.length ? Math.min(...a.map((x) => x.temps)) : null;
  }

  // Table télésismique : une ligne par distance (°), la première arrivée de chaque phase, S − P et la première onde.
  function telesismique({ h = 10, distances, phases = PHASES_TELE }) {
    return distances.map((d) => {
      const r = { d };
      for (const ph of phases) r[ph] = premiere(ph, h, d);
      r.SP = r.P !== null && r.S !== null ? r.S - r.P : null;
      const pres = phases.filter((ph) => r[ph] !== null);
      r.premiere = pres.length ? pres.reduce((a, b) => (r[b] < r[a] ? b : a)) : null;
      return r;
    });
  }

  // Effet de la profondeur : temps de P et retards de pP et sP, pour chaque distance et chaque profondeur.
  function profondeurs({ profondeurs: hs, distances }) {
    return distances.map((d) => {
      const r = { d };
      for (const h of hs) {
        const P = premiere('P', h, d), pP = premiere('pP', h, d), sP = premiere('sP', h, d);
        r[h] = { P, pPP: P !== null && pP !== null ? pP - P : null, sPP: P !== null && sP !== null ? sP - P : null };
      }
      return r;
    });
  }

  // Lecture d'une table : y à l'abscisse x, par interpolation linéaire entre les deux lignes qui l'encadrent.
  // lignes triées par x croissant ; fx et fy extraient x et y d'une ligne (y null : ligne ignorée).
  function interpoler(lignes, x, fx, fy) {
    const ok = lignes.filter((l) => fy(l) !== null && Number.isFinite(fy(l)));
    for (let i = 1; i < ok.length; i++) {
      const a = ok[i - 1], b = ok[i];
      if (x >= fx(a) && x <= fx(b)) {
        const r = (x - fx(a)) / (fx(b) - fx(a));
        return { y: fy(a) + r * (fy(b) - fy(a)), a, b, r };
      }
    }
    return null;
  }

  // Lecture inverse : x tel que y(x) = valeur, y croissant entre les deux lignes qui encadrent la valeur.
  function inverser(lignes, valeur, fx, fy) {
    const ok = lignes.filter((l) => fy(l) !== null && Number.isFinite(fy(l)));
    for (let i = 1; i < ok.length; i++) {
      const a = ok[i - 1], b = ok[i];
      if (fy(b) > fy(a) && valeur >= fy(a) && valeur <= fy(b)) {
        const r = (valeur - fy(a)) / (fy(b) - fy(a));
        return { x: fx(a) + r * (fx(b) - fx(a)), a, b, r };
      }
    }
    return null;
  }

  // Racine d'une fonction croissante sur [a, b] par dichotomie (n itérations).
  function dichotomie(fn, valeur, a, b, n = 30) {
    if (!(fn(a) <= valeur && fn(b) >= valeur)) return NaN;
    for (let i = 0; i < n; i++) { const m = (a + b) / 2; if (fn(m) < valeur) a = m; else b = m; }
    return (a + b) / 2;
  }

  // Distance exacte (°) d'un séisme lointain d'après S − P (s), foyer à h km : rais dans ak135, entre a et b degrés.
  const spTele = (h, d) => { const P = premiere('P', h, d), S = premiere('S', h, d); return P !== null && S !== null ? S - P : NaN; };
  const distanceSP = (sp, h, a = 10, b = 95) => dichotomie((d) => spTele(h, d), sp, a, b, 18);

  // Distance exacte (km) d'un séisme régional d'après Sg − P (s), foyer à h km dans la croûte du cours.
  const distanceSPRegionale = (sp, h, a = 0, b = 600) => dichotomie((d) => { const t = Sismo.temps(d, h); return t.tSg - t.tP; }, sp, a, b, 40);

  // Profondeur (km) d'après pP − P (s) à la distance d, lue dans une table de profondeurs (interpolation linéaire en h).
  function lireProfondeur(ligne, retardLu, hs) {
    const pts = hs.map((h) => ({ h, r: ligne[h].pPP })).filter((q) => q.r !== null);
    return inverser(pts, retardLu, (q) => q.h, (q) => q.r);
  }

  return { PHASES_TELE, regionale, premiere, telesismique, profondeurs, interpoler, inverser, dichotomie, spTele, distanceSP, distanceSPRegionale, lireProfondeur };
})();
export default Tables;
