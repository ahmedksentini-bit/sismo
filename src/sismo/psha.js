import Gmpe from './gmpe.js';

// src/sismo/psha.js — calcul probabiliste de l'aléa sismique (PSHA, Cornell-McGuire) avec arbre logique.
// Sources : zones discrétisées en points, ruptures ponctuelles (Rjb = distance épicentrale, comme la
// PointMSR d'OpenQuake), loi de Gutenberg-Richter tronquée par classes de magnitude. Écarts types
// des lois d'atténuation tronqués à ±t·σ. Arbre logique : (a, b) par zone, ΔMmax commun, loi
// d'atténuation ; énumération complète, moyenne et fractiles pondérés comme hazardlib.stats.
// Vérifié contre OpenQuake par tests/psha.test.mjs. Solveurs purs.
const Psha = (() => {
  'use strict';

  // ── Loi normale : erf précise (série en dessous de 2,5, fraction continue au-delà) ──
  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    if (x < 2.5) {
      let terme = x, somme = x, n = 0;
      while (Math.abs(terme) > 1e-17 * Math.abs(somme) && n < 200) { n++; terme *= (-x * x) / n; somme += terme / (2 * n + 1); }
      return 1 - (2 / Math.sqrt(Math.PI)) * somme;
    }
    // erfc(x) = e^(−x²)/√π · 1/(x + ½/(x + 1/(x + 3/2/(x + …)))) — évaluée de bas en haut
    let f = x;
    for (let k = 60; k >= 1; k--) f = x + (k / 2) / f;
    return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
  }
  const Phi = z => 0.5 * erfc(-z / Math.SQRT2);
  // Probabilité que ε dépasse z pour une normale tronquée à ±t (comme hazardlib : _truncnorm_sf).
  function survie(z, t) {
    if (z <= -t) return 1;
    if (z >= t) return 0;
    const pt = Phi(t), pmt = Phi(-t);
    return Math.min(1, Math.max(0, (pt - Phi(z)) / (pt - pmt)));
  }
  // Table de la fonction de survie tronquée (pas 1e-3, interpolation linéaire : erreur < 1e-8).
  function tableSurvie(t) {
    const pas = 1e-3, n = Math.ceil((2 * t) / pas) + 1, v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = survie(-t + i * pas, t);
    return z => {
      if (z <= -t) return 1;
      if (z >= t) return 0;
      const u = (z + t) / pas, i = Math.floor(u), r = u - i;
      return i + 1 < n ? v[i] + (v[i + 1] - v[i]) * r : v[n - 1];
    };
  }

  // ── Gutenberg-Richter tronquée, par classes (comme TruncatedGRMFD d'hazardlib) ──
  const arrondiPython = x => { const r = Math.round(x); return Math.abs(x - Math.trunc(x)) === 0.5 ? 2 * Math.round(x / 2) : r; };
  function mfdGR({ a, b, mmin, mmax, pas = 0.1 }) {
    let m0 = arrondiPython(mmin / pas) * pas, m1 = arrondiPython(mmax / pas) * pas;
    if (m0 !== m1) { m0 += pas / 2; m1 -= pas / 2; }
    const n = arrondiPython((m1 - m0) / pas) + 1, out = [];
    let m = m0;
    for (let i = 0; i < n; i++) {
      out.push({ M: m, taux: Math.pow(10, a - b * (m - pas / 2)) - Math.pow(10, a - b * (m + pas / 2)) });
      m += pas;
    }
    return out;
  }

  // ── Zones : discrétisation d'un polygone (km) en mailles carrées de côté `pas` ──
  function dansPolygone(x, y, poly) {
    let dedans = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }
  function discretiser(poly, pas) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), pts = [];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let y = y0 + pas / 2; y < y1; y += pas) for (let x = x0 + pas / 2; x < x1; x += pas) if (dansPolygone(x, y, poly)) pts.push({ x, y });
    return pts;
  }

  // ── Branches (a, b) d'une zone à partir d'une loi ajustée : b ± 1,645σ, poids 0,185 / 0,63 / 0,185
  // (approximation en trois points de Keefer et Bodily) ; a recalé pour garder λ(≥ mPivot).
  function branchesAB({ b, sigmaB, lamPivot, mPivot }) {
    return [[-1.645, 0.185], [0, 0.63], [1.645, 0.185]].map(([k, poids]) => {
      const bb = b + k * sigmaB;
      return { a: Math.log10(lamPivot) + bb * mPivot, b: bb, poids };
    });
  }

  // Probabilité moyenne (sur les points de la zone) de dépasser chaque niveau, par classe de magnitude :
  // S[m][imt][niveau]. Ne dépend ni de (a, b) ni de Mmax : les réalisations ne font que repondérer.
  function probabilitesZone(zone, site, loi, imts, niveaux, mags, opts) {
    const sf = opts.sf, lnNiv = niveaux.map(Math.log), pts = zone.points, n = pts.length;
    const S = mags.map(() => imts.map(() => new Float64Array(niveaux.length)));
    for (const p of pts) {
      const R = Math.hypot(p.x - site.x, p.y - site.y);
      if (R > opts.distanceMax) continue;
      mags.forEach((M, m) => imts.forEach((imt, k) => {
        const { ln, sigma } = loi.calculer({ M, Rjb: R, vs30: site.vs30, rake: zone.rake }, imt), s = S[m][k];
        for (let l = 0; l < lnNiv.length; l++) s[l] += sf((lnNiv[l] - ln) / sigma) / n;
      }));
    }
    return S;
  }

  // Énumération complète de l'arbre : (a, b) de chaque zone × ΔMmax × loi d'atténuation.
  function realisations(modele) {
    const ensembles = [...modele.zones.map(z => z.ab.map((br, i) => ({ i, poids: br.poids }))),
      modele.dMmax.map((br, i) => ({ i, poids: br.poids })), modele.gmpe.map((br, i) => ({ i, poids: br.poids }))];
    let liste = [{ chemin: [], poids: 1 }];
    for (const ens of ensembles) liste = liste.flatMap(r => ens.map(br => ({ chemin: [...r.chemin, br.i], poids: r.poids * br.poids })));
    return liste;
  }

  // Calcul complet. Renvoie, pour chaque grandeur, les courbes de probabilité de dépassement en
  // `dureeVie` années de chaque réalisation, la moyenne et les fractiles demandés.
  function calculer(modele, { fractiles = [0.16, 0.5, 0.84] } = {}) {
    const { site, imts, niveaux, dureeVie } = modele, Z = modele.zones.length;
    const opts = { sf: tableSurvie(modele.troncature), distanceMax: modele.distanceMax };
    const dmMax = Math.max(...modele.dMmax.map(d => d.d));
    // Probabilités par zone et par loi, sur toutes les classes possibles
    const parZone = modele.zones.map(z => {
      const pts = z.points || discretiser(z.polygone, modele.pasGrille), zone = { ...z, points: pts };
      const mags = mfdGR({ a: 0, b: 1, mmin: z.mmin, mmax: z.mmax + dmMax, pas: modele.pasMfd }).map(c => c.M);
      return { zone, mags, S: modele.gmpe.map(g => probabilitesZone(zone, site, Gmpe.LOIS[g.id], imts, niveaux, mags, opts)) };
    });
    // Taux par zone pour chaque (branche ab, ΔMmax, loi) : λ = Σm taux_m · S_m
    const cache = new Map();
    const tauxZone = (iz, iab, idm, ig) => {
      const cle = `${iz}|${iab}|${idm}|${ig}`;
      if (cache.has(cle)) return cache.get(cle);
      const { zone, mags, S } = parZone[iz], br = zone.ab[iab];
      const mfd = mfdGR({ a: br.a, b: br.b, mmin: zone.mmin, mmax: zone.mmax + modele.dMmax[idm].d, pas: modele.pasMfd });
      const lam = imts.map(() => new Float64Array(niveaux.length));
      mfd.forEach((c, m) => {
        if (Math.abs(mags[m] - c.M) > 1e-9) throw new Error('classes de magnitude incohérentes');
        imts.forEach((_, k) => { const s = S[ig][m][k], o = lam[k]; for (let l = 0; l < o.length; l++) o[l] += c.taux * s[l]; });
      });
      cache.set(cle, lam);
      return lam;
    };
    const rlz = realisations(modele).map(r => {
      const idm = r.chemin[Z], ig = r.chemin[Z + 1];
      const lam = imts.map(() => new Float64Array(niveaux.length));
      for (let iz = 0; iz < Z; iz++) {
        const lz = tauxZone(iz, r.chemin[iz], idm, ig);
        lam.forEach((o, k) => { for (let l = 0; l < o.length; l++) o[l] += lz[k][l]; });
      }
      return { ...r, lam, poe: lam.map(v => Float64Array.from(v, x => 1 - Math.exp(-x * dureeVie))) };
    });
    const poids = rlz.map(r => r.poids);
    const stat = f => imts.map((_, k) => Float64Array.from(niveaux, (_, l) => f(rlz.map(r => r.poe[k][l]))));
    return {
      imts, niveaux, dureeVie, realisations: rlz, parZone,
      moyenne: stat(v => v.reduce((s, x, i) => s + x * poids[i], 0) / poids.reduce((a, b) => a + b, 0)),
      fractiles: Object.fromEntries(fractiles.map(q => [q, stat(v => quantile(q, v, poids))])),
    };
  }

  // Fractile pondéré (hazardlib.stats.quantile_curve) : tri, poids cumulés, interpolation linéaire.
  function quantile(q, valeurs, poids) {
    const ordre = valeurs.map((v, i) => [v, poids[i]]).sort((a, b) => a[0] - b[0]);
    let cum = 0;
    const xs = ordre.map(([, w]) => (cum += w)), ys = ordre.map(([v]) => v);
    if (q <= xs[0]) return ys[0];
    if (q >= xs[xs.length - 1]) return ys[ys.length - 1];
    let i = 1;
    while (xs[i] < q) i++;
    return ys[i - 1] + ((ys[i] - ys[i - 1]) * (q - xs[i - 1])) / (xs[i] - xs[i - 1]);
  }

  // Niveau atteint avec une probabilité donnée (carte d'aléa, UHS) : interpolation log-log de la courbe,
  // comme OpenQuake (compute_hazard_maps, probabilités plancher 1e-30). Renvoie 0 si la probabilité
  // n'est pas atteinte au premier niveau, le dernier niveau si la courbe ne descend pas jusqu'à P.
  function niveauPourProba(niveaux, poe, P) {
    const lp = Math.log(P), lpoe = l => Math.log(Math.max(poe[l], 1e-30));
    if (lp > lpoe(0)) return 0;
    for (let l = 1; l < niveaux.length; l++) {
      if (lpoe(l) <= lp) {
        const x0 = lpoe(l - 1), x1 = lpoe(l);
        if (x0 === x1) return niveaux[l - 1];
        return Math.exp(Math.log(niveaux[l]) + ((lp - x1) * (Math.log(niveaux[l - 1]) - Math.log(niveaux[l]))) / (x0 - x1));
      }
    }
    return niveaux[niveaux.length - 1];
  }
  // Probabilité en t années ↔ période de retour.
  const periodeRetour = (P, t) => -t / Math.log(1 - P);

  // Distance hypocentrale en ligne droite sur la Terre sphérique (rayon 6371 km), comme le Rrup des
  // ruptures ponctuelles d'OpenQuake : à 150 km pour 10 km de profondeur, 150,21 km au lieu de √(R² + h²) = 150,33.
  const RT = 6371;
  function distanceHypocentrale(R, h) {
    const th = R / RT, demi = Math.sin(th / 2);
    return Math.sqrt(h * h + 4 * RT * (RT - h) * demi * demi);
  }

  // Désagrégation magnitude-distance du taux de dépassement d'un niveau x (classes de `largeurM` en
  // magnitude, de `largeurR` km en distance). Sans `chemin`, chaque case est le taux moyen pondéré sur
  // l'arbre (comme la moyenne d'OpenQuake) ; avec `chemin`, celui d'une seule réalisation. Distance des
  // classes : épicentrale (Rjb des ruptures ponctuelles) ou hypocentrale (`distance: 'rrup'`, celle
  // d'OpenQuake, voir distanceHypocentrale). Renvoie aussi les parts (somme 1), M̄, R̄ et la part de chaque zone.
  function desagregation(modele, imt, x, { largeurM = 0.5, largeurR = 20, chemin = null, distance = 'rjb' } = {}) {
    const sf = tableSurvie(modele.troncature), lnx = Math.log(x), site = modele.site, Z = modele.zones.length;
    const cases = new Map(), parZone = modele.zones.map(() => 0);
    const ajouter = (M, R, v, iz) => {
      const cle = `${Math.floor(M / largeurM + 1e-9)}|${Math.floor(R / largeurR)}`;
      cases.set(cle, (cases.get(cle) || 0) + v);
      parZone[iz] += v;
    };
    // Poids des branches retenues : toutes (poids de l'arbre) ou celles du chemin (poids 1)
    const sel = (ens, e) => ens.map((br, i) => (chemin ? (chemin[e] === i ? 1 : 0) : br.poids));
    const wDm = sel(modele.dMmax, Z), wG = sel(modele.gmpe, Z + 1);
    modele.zones.forEach((z, iz) => {
      const pts = z.points || discretiser(z.polygone, modele.pasGrille), wAb = sel(z.ab, iz);
      // Taux moyen par classe de magnitude sur les branches (a, b) × ΔMmax
      const taux = new Map();
      z.ab.forEach((br, iab) => modele.dMmax.forEach((dm, idm) => {
        const w = wAb[iab] * wDm[idm];
        if (!w) return;
        for (const c of mfdGR({ a: br.a, b: br.b, mmin: z.mmin, mmax: z.mmax + dm.d, pas: modele.pasMfd })) {
          const cle = c.M.toFixed(6);
          taux.set(cle, { M: c.M, t: (taux.has(cle) ? taux.get(cle).t : 0) + w * c.taux });
        }
      }));
      modele.gmpe.forEach((g, ig) => {
        if (!wG[ig]) return;
        const loi = Gmpe.LOIS[g.id];
        for (const p of pts) {
          const R = Math.hypot(p.x - site.x, p.y - site.y), Rc = distance === 'rrup' ? distanceHypocentrale(R, z.profondeur) : R;
          if (R > modele.distanceMax) continue;
          for (const { M, t } of taux.values()) {
            const { ln, sigma } = loi.calculer({ M, Rjb: R, vs30: site.vs30, rake: z.rake }, imt);
            const v = (wG[ig] * t * sf((lnx - ln) / sigma)) / pts.length;
            if (v) ajouter(M, Rc, v, iz);
          }
        }
      });
    });
    let total = 0;
    for (const v of cases.values()) total += v;
    const out = [];
    for (const [cle, v] of cases) {
      const [im, ir] = cle.split('|').map(Number);
      out.push({ m0: im * largeurM, m1: (im + 1) * largeurM, r0: ir * largeurR, r1: (ir + 1) * largeurR, taux: v, part: v / total });
    }
    out.sort((p, q) => p.m0 - q.m0 || p.r0 - q.r0);
    const mMoy = out.reduce((s, c) => s + c.part * (c.m0 + c.m1) / 2, 0), rMoy = out.reduce((s, c) => s + c.part * (c.r0 + c.r1) / 2, 0);
    return { cases: out, total, mMoy, rMoy, zones: parZone.map(v => v / total) };
  }

  // Sensibilité : pour chaque ensemble de branches, niveau moyen à la probabilité P quand on impose
  // chacune de ses branches (les autres gardent leurs poids). Base du graphique « en tornade ».
  function sensibilite(resultat, modele, k, P) {
    const virg = (x, d) => x.toFixed(d).replace('.', ',').replace(/^-/, '−');
    const noms = [...modele.zones.map(z => `(a, b) ${z.nom}`), 'Mmax', 'Loi d\'atténuation'];
    const branches = [...modele.zones.map(z => z.ab.map(br => `b = ${virg(br.b, 2)}`)),
      modele.dMmax.map(d => `ΔMmax = ${d.d >= 0 ? '+' : ''}${virg(d.d, 1)}`), modele.gmpe.map(g => Gmpe.LOIS[g.id].nom)];
    return noms.map((nom, e) => ({
      nom,
      branches: branches[e].map((lib, i) => {
        const sel = resultat.realisations.filter(r => r.chemin[e] === i), w = sel.reduce((s, r) => s + r.poids, 0);
        const poe = Float64Array.from(resultat.niveaux, (_, l) => sel.reduce((s, r) => s + r.poids * r.poe[k][l], 0) / w);
        return { libelle: lib, niveau: niveauPourProba(resultat.niveaux, poe, P) };
      }),
    }));
  }

  // Modèle d'école (aucune donnée régionale) : un site au rocher, une zone proche peu active et une
  // zone lointaine plus active, en km autour du site ; foyers à 10 km de profondeur (sans effet sur les
  // lois en Rjb, seulement sur la distance hypocentrale). Les lois (a, b) viennent d'un ajustement de
  // Weichert : b, σ(b) et le taux au-dessus de 4.
  const niveauxDefaut = (n = 30, x0 = 1e-3, x1 = 3) => Array.from({ length: n }, (_, i) => x0 * Math.pow(x1 / x0, i / (n - 1)));
  function modeleDefaut() {
    return {
      site: { x: 0, y: 0, vs30: 800 },
      imts: ['PGA', 0.04, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3],
      niveaux: niveauxDefaut(),
      dureeVie: 50, troncature: 3, distanceMax: 300, pasGrille: 10, pasMfd: 0.1,
      zones: [
        { id: 'z1', nom: 'Zone A (proche)', rake: 0, profondeur: 10, mmin: 4, mmax: 6.5,
          polygone: [[-60, -40], [50, -55], [70, 35], [-15, 60], [-70, 20]],
          ajustement: { b: 1.0, sigmaB: 0.08, lamPivot: 0.25, mPivot: 4 } },
        { id: 'z2', nom: 'Zone B (lointaine)', rake: 90, profondeur: 10, mmin: 4, mmax: 7.3,
          polygone: [[95, -90], [190, -70], [215, 50], [150, 120], [100, 80]],
          ajustement: { b: 0.9, sigmaB: 0.06, lamPivot: 1.2, mPivot: 4 } },
      ].map(z => ({ ...z, ab: branchesAB(z.ajustement) })),
      dMmax: [{ d: -0.3, poids: 0.3 }, { d: 0, poids: 0.5 }, { d: 0.3, poids: 0.2 }],
      gmpe: [{ id: 'akkar2014', poids: 0.5 }, { id: 'bindi2014', poids: 0.5 }],
    };
  }

  return { erfc, Phi, survie, tableSurvie, mfdGR, niveauxDefaut, modeleDefaut, distanceHypocentrale, dansPolygone, discretiser, branchesAB, realisations, calculer, quantile, niveauPourProba, periodeRetour, desagregation, sensibilite };
})();
export default Psha;
