import Gmpe from './gmpe.js';
import Geodesie from './geodesie.js';
import Faille from './faille.js';

// src/sismo/psha.js — calcul probabiliste de l'aléa sismique (PSHA, Cornell-McGuire) avec arbre logique.
// Sources : zones discrétisées en points, ruptures ponctuelles (Rjb = distance épicentrale, comme la
// PointMSR d'OpenQuake) ; failles à ruptures flottantes (comme SimpleFaultSource, src/sismo/faille.js),
// qui portent les séismes au-delà du Mmax de leur zone. Loi de Gutenberg-Richter tronquée par classes. Écarts types
// des lois d'atténuation tronqués à ±t·σ. Arbre logique : modèle de taux (catalogue : (a, b) par
// zone ; géodésie : couplage χ commun, loi équilibrée en moment), ΔMmax commun, loi d'atténuation ;
// énumération complète, moyenne et fractiles pondérés comme hazardlib.stats.
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

  // Variantes du modèle de sources. Catalogue : produit des branches (a, b) de chaque zone, taux
  // conservés quand Mmax change. Géodésie : une variante par couplage χ, même χ pour toutes les zones,
  // taux de moment χ·Ṁ0 conservé quand Mmax change (a recalculé comme TruncatedGRMFD._set_a).
  // Failles : moment μ·L·W·s (glissement géologique). Catalogue : la faille libère tout ce moment.
  // Géodésie : la faille et le fond de sa zone se partagent χ·Ṁ0 de la zone (fond = χ·(Ṁ0 − Ṁfailles)).
  const geomFaille = (modele, f) => Faille.geometrie(f, modele.pasFaille || 1);
  const momentFaille = (modele, f) => Faille.moment(geomFaille(modele, f), f.glissement, f.mu || 3e10);
  function variantes(modele) {
    const out = [], failles = modele.failles || [];
    const mF = failles.map(f => momentFaille(modele, f));
    for (const t of modele.taux || [{ id: 'catalogue', poids: 1 }]) {
      if (t.id === 'catalogue') {
        let l = [{ cle: [], poids: t.poids, zones: [], etiquettes: { modele: 'catalogue' } }];
        modele.zones.forEach((z, iz) => {
          l = l.flatMap(v => z.ab.map((br, i) => ({ cle: [...v.cle, i], poids: v.poids * br.poids,
            zones: [...v.zones, { a: br.a, b: br.b }], etiquettes: { ...v.etiquettes, ['ab' + iz]: i } })));
        });
        out.push(...l.map(v => ({ id: 'c' + v.cle.join(''), poids: v.poids, zones: v.zones, failles: mF.map(m => ({ moment: m })), etiquettes: v.etiquettes })));
      } else if (t.id === 'geodesie') {
        t.couplage.forEach((c, i) => out.push({ id: 'g' + i, poids: t.poids * c.poids,
          zones: modele.zones.map((z, iz) => ({
            moment: c.chi * Math.max(t.moments[iz] - failles.reduce((s, f, jf) => s + (f.zone === iz ? mF[jf] : 0), 0), 0), b: z.ajustement.b })),
          failles: mF.map(m => ({ moment: c.chi * m })), etiquettes: { modele: 'geodesie', chi: i } }));
      }
    }
    return out.filter(v => v.poids > 0);
  }
  // Loi de la faille jf : b de sa zone, de Mmax de la zone (branche ΔMmax comprise) à Mmax de la faille,
  // équilibrée en moment. null si la zone va déjà au-delà de la faille.
  function loiFaille(modele, v, jf, d) {
    const f = modele.failles[jf], z = modele.zones[f.zone], mmin = z.mmax + d;
    if (mmin >= f.mmax - 1e-9) return null;
    const b = z.ajustement.b;
    return { a: Geodesie.aDepuisMoment({ moment: v.failles[jf].moment, b, mmin, mmax: f.mmax }), b, mmin, mmax: f.mmax };
  }
  // Loi de la zone iz pour une variante et un ΔMmax : { a, b, mmin, mmax }.
  function loiZone(modele, v, iz, d) {
    const z = modele.zones[iz], p = v.zones[iz], mmax = z.mmax + d;
    const a = p.moment !== undefined ? (p.moment > 0 ? Geodesie.aDepuisMoment({ moment: p.moment, b: p.b, mmin: z.mmin, mmax }) : -Infinity) : p.a;
    return { a, b: p.b, mmin: z.mmin, mmax };
  }
  // Énumération complète de l'arbre : variante de taux × ΔMmax × loi d'atténuation. Chaque réalisation a
  // une clé « variante|ΔMmax|loi » et ses étiquettes (branche retenue dans chaque ensemble).
  function realisations(modele) {
    const out = [];
    variantes(modele).forEach((v, iv) => modele.dMmax.forEach((dm, idm) => modele.gmpe.forEach((g, ig) => {
      if (dm.poids * g.poids > 0) out.push({ cle: `${v.id}|${idm}|${ig}`, iv, idm, ig, poids: v.poids * dm.poids * g.poids, etiquettes: { ...v.etiquettes, dm: idm, gmpe: ig } });
    })));
    return out;
  }

  // Calcul complet. Renvoie, pour chaque grandeur, les courbes de probabilité de dépassement en
  // `dureeVie` années de chaque réalisation, la moyenne et les fractiles demandés.
  function calculer(modele, { fractiles = [0.16, 0.5, 0.84] } = {}) {
    const { site, imts, niveaux, dureeVie } = modele, Z = modele.zones.length;
    const opts = { sf: tableSurvie(modele.troncature), distanceMax: modele.distanceMax };
    const dmMax = Math.max(...modele.dMmax.map(d => d.d)), vars = variantes(modele);
    // Probabilités par zone et par loi, sur toutes les classes possibles
    const parZone = modele.zones.map(z => {
      const pts = z.points || discretiser(z.polygone, modele.pasGrille), zone = { ...z, points: pts };
      const mags = mfdGR({ a: 0, b: 1, mmin: z.mmin, mmax: z.mmax + dmMax, pas: modele.pasMfd }).map(c => c.M);
      return { zone, mags, S: modele.gmpe.map(g => probabilitesZone(zone, site, Gmpe.LOIS[g.id], imts, niveaux, mags, opts)) };
    });
    // Failles : probabilité moyenne sur les ruptures flottantes d'une magnitude, mise en cache par classe
    const parFaille = (modele.failles || []).map(f => ({ f, g: geomFaille(modele, f), S: modele.gmpe.map(() => new Map()) }));
    const probaFaille = (jf, ig, M) => {
      const pf = parFaille[jf], cle = M.toFixed(4);
      if (!pf.S[ig].has(cle)) {
        const rups = Faille.ruptures(pf.g, M, pf.f.rake, pf.f.rapport || 1), loi = Gmpe.LOIS[modele.gmpe[ig].id], lnNiv = niveaux.map(Math.log);
        const S = imts.map(() => new Float64Array(niveaux.length));
        for (const rup of rups) {
          const R = Faille.rjb(pf.g, rup, site);
          if (R > modele.distanceMax) continue;
          imts.forEach((imt, k) => {
            const { ln, sigma } = loi.calculer({ M, Rjb: R, vs30: site.vs30, rake: pf.f.rake }, imt);
            for (let l = 0; l < lnNiv.length; l++) S[k][l] += opts.sf((lnNiv[l] - ln) / sigma) / rups.length;
          });
        }
        pf.S[ig].set(cle, S);
      }
      return pf.S[ig].get(cle);
    };
    // Taux par zone pour chaque (variante, ΔMmax, loi) : λ = Σm taux_m · S_m
    const cache = new Map();
    const tauxZone = (iz, iv, idm, ig) => {
      const cle = `${iz}|${iv}|${idm}|${ig}`;
      if (cache.has(cle)) return cache.get(cle);
      const { mags, S } = parZone[iz];
      const mfd = mfdGR({ ...loiZone(modele, vars[iv], iz, modele.dMmax[idm].d), pas: modele.pasMfd });
      const lam = imts.map(() => new Float64Array(niveaux.length));
      mfd.forEach((c, m) => {
        if (Math.abs(mags[m] - c.M) > 1e-9) throw new Error('classes de magnitude incohérentes');
        imts.forEach((_, k) => { const s = S[ig][m][k], o = lam[k]; for (let l = 0; l < o.length; l++) o[l] += c.taux * s[l]; });
      });
      cache.set(cle, lam);
      return lam;
    };
    const tauxFaille = (jf, iv, idm, ig) => {
      const cle = `f${jf}|${iv}|${idm}|${ig}`;
      if (cache.has(cle)) return cache.get(cle);
      const lam = imts.map(() => new Float64Array(niveaux.length)), loi = loiFaille(modele, vars[iv], jf, modele.dMmax[idm].d);
      if (loi) for (const c of mfdGR({ ...loi, pas: modele.pasMfd })) {
        const S = probaFaille(jf, ig, c.M);
        imts.forEach((_, k) => { const o = lam[k]; for (let l = 0; l < o.length; l++) o[l] += c.taux * S[k][l]; });
      }
      cache.set(cle, lam);
      return lam;
    };
    const rlz = realisations(modele).map(r => {
      const lam = imts.map(() => new Float64Array(niveaux.length));
      const ajouter = lz => lam.forEach((o, k) => { for (let l = 0; l < o.length; l++) o[l] += lz[k][l]; });
      for (let iz = 0; iz < Z; iz++) ajouter(tauxZone(iz, r.iv, r.idm, r.ig));
      parFaille.forEach((_, jf) => ajouter(tauxFaille(jf, r.iv, r.idm, r.ig)));
      return { ...r, lam, poe: lam.map(v => Float64Array.from(v, x => 1 - Math.exp(-x * dureeVie))) };
    });
    const poids = rlz.map(r => r.poids);
    const stat = f => imts.map((_, k) => Float64Array.from(niveaux, (_, l) => f(rlz.map(r => r.poe[k][l]))));
    return {
      imts, niveaux, dureeVie, realisations: rlz, variantes: vars, parZone,
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
  // magnitude, de `largeurR` km en distance). Sans `cle`, chaque case est le taux moyen pondéré sur
  // l'arbre (comme la moyenne d'OpenQuake) ; avec `cle`, celui d'une seule réalisation. Distance des
  // classes : Rjb (épicentrale pour les ruptures ponctuelles) ou Rrup d'OpenQuake (`distance: 'rrup'`,
  // voir distanceHypocentrale et Faille.rrupSphere). Renvoie aussi les parts (somme 1), M̄, R̄ et la part
  // de chaque zone (fond) et de chaque faille.
  function desagregation(modele, imt, x, { largeurM = 0.5, largeurR = 20, cle = null, distance = 'rjb' } = {}) {
    const sf = tableSurvie(modele.troncature), lnx = Math.log(x), site = modele.site, vars = variantes(modele);
    const cases = new Map(), parZone = modele.zones.map(() => 0), parFaille = (modele.failles || []).map(() => 0);
    const ajouter = (M, R, v, iz, jf = -1) => {
      const k = `${Math.floor(M / largeurM + 1e-9)}|${Math.floor(R / largeurR)}`;
      cases.set(k, (cases.get(k) || 0) + v);
      if (jf >= 0) parFaille[jf] += v; else parZone[iz] += v;
    };
    // Poids retenus : ceux de l'arbre, ou 1 pour la seule réalisation demandée
    const [vSel, dmSel, gSel] = cle ? cle.split('|') : [];
    const wV = vars.map(v => (cle ? (v.id === vSel ? 1 : 0) : v.poids));
    const wDm = modele.dMmax.map((d, i) => (cle ? (i === +dmSel ? 1 : 0) : d.poids));
    const wG = modele.gmpe.map((g, i) => (cle ? (i === +gSel ? 1 : 0) : g.poids));
    modele.zones.forEach((z, iz) => {
      const pts = z.points || discretiser(z.polygone, modele.pasGrille);
      // Taux moyen par classe de magnitude sur les variantes de taux × ΔMmax
      const taux = new Map();
      vars.forEach((v, iv) => modele.dMmax.forEach((dm, idm) => {
        const w = wV[iv] * wDm[idm];
        if (!w) return;
        for (const c of mfdGR({ ...loiZone(modele, v, iz, dm.d), pas: modele.pasMfd })) {
          const k = c.M.toFixed(6);
          taux.set(k, { M: c.M, t: (taux.has(k) ? taux.get(k).t : 0) + w * c.taux });
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
    // Failles : chaque rupture flottante à sa distance (Rjb, ou Rrup d'OpenQuake)
    (modele.failles || []).forEach((f, jf) => {
      const g = geomFaille(modele, f), taux = new Map();
      vars.forEach((v, iv) => modele.dMmax.forEach((dm, idm) => {
        const w = wV[iv] * wDm[idm], loi = w ? loiFaille(modele, v, jf, dm.d) : null;
        if (!loi) return;
        for (const c of mfdGR({ ...loi, pas: modele.pasMfd })) {
          const k = c.M.toFixed(6);
          taux.set(k, { M: c.M, t: (taux.has(k) ? taux.get(k).t : 0) + w * c.taux });
        }
      }));
      modele.gmpe.forEach((gm, ig) => {
        if (!wG[ig]) return;
        const loi = Gmpe.LOIS[gm.id];
        for (const { M, t } of taux.values()) {
          const rups = Faille.ruptures(g, M, f.rake, f.rapport || 1);
          for (const rup of rups) {
            const R = Faille.rjb(g, rup, site);
            if (R > modele.distanceMax) continue;
            const { ln, sigma } = loi.calculer({ M, Rjb: R, vs30: site.vs30, rake: f.rake }, imt);
            const v = (wG[ig] * t * sf((lnx - ln) / sigma)) / rups.length;
            if (v) ajouter(M, distance === 'rrup' ? Faille.rrupSphere(g, rup, site) : R, v, f.zone, jf);
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
    return { cases: out, total, mMoy, rMoy, zones: parZone.map(v => v / total), failles: parFaille.map(v => v / total) };
  }

  // Sensibilité : pour chaque ensemble de branches, niveau moyen à la probabilité P quand on impose
  // chacune de ses branches, les autres gardant leurs poids. Un ensemble emboîté (les (a, b) d'une zone
  // sous « catalogue », χ sous « géodésie ») est évalué dans son sous-arbre. Base du graphique en tornade.
  function sensibilite(resultat, modele, k, P) {
    const virg = (x, d) => x.toFixed(d).replace('.', ',').replace(/^-/, '−');
    const geo = (modele.taux || []).find(t => t.id === 'geodesie');
    const ensembles = [
      ['modele', 'Modèle de taux', i => (modele.taux || []).find(t => t.id === i)?.nom || i],
      ...modele.zones.map((z, iz) => ['ab' + iz, `(a, b) ${z.nom}`, i => `b = ${virg(z.ab[i].b, 2)}`]),
      ['chi', 'Couplage χ', i => `χ = ${virg(geo.couplage[i].chi, 2)}`],
      ['dm', 'Mmax', i => `ΔMmax = ${modele.dMmax[i].d >= 0 ? '+' : ''}${virg(modele.dMmax[i].d, 1)}`],
      ['gmpe', 'Loi d\'atténuation', i => Gmpe.LOIS[modele.gmpe[i].id].nom],
    ];
    const out = [];
    for (const [cle, nom, libelle] of ensembles) {
      const dans = resultat.realisations.filter(r => r.etiquettes[cle] !== undefined);
      if (!dans.length) continue;
      const valeurs = [...new Set(dans.map(r => r.etiquettes[cle]))];
      out.push({ nom, cle, branches: valeurs.map(val => {
        const sel = dans.filter(r => r.etiquettes[cle] === val), w = sel.reduce((s, r) => s + r.poids, 0);
        const poe = Float64Array.from(resultat.niveaux, (_, l) => sel.reduce((s, r) => s + r.poids * r.poe[k][l], 0) / w);
        return { libelle: libelle(val), niveau: niveauPourProba(resultat.niveaux, poe, P) };
      }) });
    }
    return out;
  }

  // Modèle d'école (aucune donnée régionale) : un site au rocher, une zone proche peu active et une
  // zone lointaine plus active, en km autour du site ; foyers à 10 km de profondeur (sans effet sur les
  // lois en Rjb, seulement sur la distance hypocentrale), et la faille F dans la zone A, qui porte les
  // séismes de M > Mmax de la zone. Deux modèles de taux à poids égaux : le
  // catalogue (ajustement de Weichert : b, σ(b), taux au-dessus de 4) et la géodésie (taux de moment de
  // Kostrov du champ GNSS d'école, μ = 30 GPa, H = 15 km ; couplage χ de 0,3 à 0,9).
  const niveauxDefaut = (n = 30, x0 = 1e-3, x1 = 3) => Array.from({ length: n }, (_, i) => x0 * Math.pow(x1 / x0, i / (n - 1)));
  const COUPLAGE = [{ chi: 0.3, poids: 0.25 }, { chi: 0.6, poids: 0.5 }, { chi: 0.9, poids: 0.25 }];
  function modeleDefaut() {
    const m = {
      site: { x: 0, y: 0, vs30: 800 },
      imts: ['PGA', 0.04, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3],
      niveaux: niveauxDefaut(),
      dureeVie: 50, troncature: 3, distanceMax: 300, pasGrille: 10, pasMfd: 0.1, pasFaille: 1,
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
      // Faille F : la faille cartographiée de la zone A (banc « géodésie »), décrochement vertical bloqué
      // jusqu'à 12 km, 80 km de long ; glissement géologique 0,8 mm/an ; Mmax : rupture de toute la faille.
      failles: [{ id: 'f1', nom: 'Faille F', zone: 0, trace: [[-10, -40], [-10, 40]], pendage: 90, zHaut: 0, zBas: 12, rake: 0,
        glissement: 0.8, mu: 3e10, mmax: 7.1, rapport: 1 }],
    };
    m.taux = [
      { id: 'catalogue', nom: 'Catalogue', poids: 0.5 },
      { id: 'geodesie', nom: 'Géodésie', poids: 0.5, couplage: COUPLAGE, moments: Geodesie.momentsVrais(m.zones.map(z => z.polygone)) },
    ];
    return m;
  }

  return { erfc, Phi, survie, tableSurvie, mfdGR, niveauxDefaut, modeleDefaut, COUPLAGE, distanceHypocentrale, dansPolygone, discretiser, branchesAB, variantes, loiZone, loiFaille, momentFaille, realisations, calculer, quantile, niveauPourProba, periodeRetour, desagregation, sensibilite };
})();
export default Psha;
