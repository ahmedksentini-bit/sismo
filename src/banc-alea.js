import Sismo from './sismo/signal.js';
import Spectre from './sismo/spectre.js';
import Psha from './sismo/psha.js';

// src/banc-alea.js — banc « aléa » : calcul probabiliste de l'aléa sismique (PSHA) sur un modèle d'école,
// avec son arbre logique ; courbe d'aléa, spectre à probabilité uniforme face à l'EC8, désagrégation et
// sensibilité aux branches. Tout le calcul est dans src/sismo/psha.js (vérifié contre OpenQuake).
(() => {
  'use strict';
  const SM = Sismo, Sp = Spectre;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const puissance = n => '10' + String(n).split('').map(c => SUP[c]).join('');
  // Accélération en g : trois chiffres significatifs
  const sci = (x, d = 1) => { if (!(x > 0)) return '—'; const e = Math.floor(Math.log10(x)); return `${virg(x / Math.pow(10, e), d)}·${puissance(e)}`; };
  const g3 = x => (x >= 1 ? virg(x, 2) : x >= 0.1 ? virg(x, 3) : virg(x, 4));

  const BASE = Psha.modeleDefaut();
  const POINTS = BASE.zones.map(z => Psha.discretiser(z.polygone, BASE.pasGrille));
  const K_PGA = 0, K_SA02 = BASE.imts.indexOf(0.2), K_SA1 = BASE.imts.indexOf(1);
  const CHOIX_IMTS = ['PGA', 0.1, 0.2, 0.3, 0.5, 1, 2].map(i => BASE.imts.indexOf(i));
  const nomImt = k => (BASE.imts[k] === 'PGA' ? 'PGA' : `Sa(${String(BASE.imts[k]).replace('.', ',')} s)`);
  const periode = k => (BASE.imts[k] === 'PGA' ? 0 : BASE.imts[k]);
  const reglagesDefaut = () => ({
    site: { x: 0, y: 0, vs30: 800 },
    zones: BASE.zones.map(z => ({ lam: z.ajustement.lamPivot, b: z.ajustement.b, mmax: z.mmax })),
    incAB: true, incMmax: true, lois: Object.fromEntries(BASE.gmpe.map(g => [g.id, true])),
    geo: { actif: true, poids: 0.5, moments: BASE.taux.find(t => t.id === 'geodesie').moments.slice(), source: 'champ GNSS du modèle d\'école' },
    faille: { actif: true, glissement: BASE.failles[0].glissement },
  });
  const etat = {
    pret: false, mode: 'explorer', r: reglagesDefaut(), zone: 0, proba: [0.1, 50], k: K_PGA,
    modele: null, res: null, desag: null, sens: null, exo: null, verifie: false, dom: null,
  };

  // ── Calcul ──────────────────────────────────────────────────────────────
  function construire(r) {
    const zones = BASE.zones.map((z, i) => {
      const p = r.zones[i], aj = { ...z.ajustement, b: p.b, lamPivot: p.lam };
      return { ...z, points: POINTS[i], mmax: p.mmax, ajustement: aj,
        ab: r.incAB ? Psha.branchesAB(aj) : [{ a: Math.log10(p.lam) + p.b * aj.mPivot, b: p.b, poids: 1 }] };
    });
    // Lois retenues, à poids égaux
    const ids = BASE.gmpe.map(g => g.id).filter(id => r.lois[id]), gmpe = ids.map(id => ({ id, poids: 1 / ids.length }));
    const wGeo = r.geo.actif ? r.geo.poids : 0;
    const taux = [{ id: 'catalogue', nom: 'Catalogue', poids: 1 - wGeo }];
    if (wGeo > 0) taux.push({ id: 'geodesie', nom: 'Géodésie', poids: wGeo, couplage: Psha.COUPLAGE, moments: r.geo.moments });
    const failles = r.faille.actif && r.faille.glissement > 0 ? BASE.failles.map(f => ({ ...f, glissement: r.faille.glissement })) : [];
    return { ...BASE, site: { ...r.site }, zones, failles, dMmax: r.incMmax ? BASE.dMmax : [{ d: 0, poids: 1 }], gmpe, taux };
  }
  // Probabilité visée P en t années → probabilité en 50 ans (durée des courbes) et période de retour.
  const periodeRetour = () => Psha.periodeRetour(etat.proba[0], etat.proba[1]);
  const poeCible = () => 1 - Math.exp(-BASE.dureeVie / periodeRetour());
  const niveau = (courbe) => Psha.niveauPourProba(etat.res.niveaux, courbe, poeCible());
  const uhs = courbes => courbes.map(c => niveau(c));
  function calculer() {
    etat.modele = construire(etat.r);
    etat.res = Psha.calculer(etat.modele);
    analyser();
  }
  // Ce qui dépend de la grandeur et de la probabilité choisies
  function analyser() {
    const res = etat.res;
    etat.uhs = { moy: uhs(res.moyenne), q16: uhs(res.fractiles[0.16]), q84: uhs(res.fractiles[0.84]) };
    etat.desag = etat.uhs.moy[etat.k] > 0 ? Psha.desagregation(etat.modele, BASE.imts[etat.k], etat.uhs.moy[etat.k]) : null;
    etat.sens = Psha.sensibilite(res, etat.modele, etat.k, poeCible());
    // Spectre moyen conditionnel à la grandeur choisie, au niveau de l'UHS moyen
    const xk = etat.uhs.moy[etat.k];
    etat.cms = xk > 0 ? Psha.spectreConditionnel(etat.modele, BASE.imts[etat.k], xk, poeCible()) : null;
  }

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft', 'teal', 'line'])
      COUL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function preparer(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }
  const COUL_ZONES = ['pick-s', 'amp'];
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  // Carte : échelle isotrope autour du domaine des zones
  const DOMAINE = { x0: -120, x1: 240, y0: -120, y1: 150 };
  function geoCarte(cv) {
    const W = cv.clientWidth, H = cv.clientHeight, m = 26;
    const s = Math.min((W - 2 * m) / (DOMAINE.x1 - DOMAINE.x0), (H - 2 * m) / (DOMAINE.y1 - DOMAINE.y0));
    const cx = (W - s * (DOMAINE.x1 - DOMAINE.x0)) / 2, cy = (H - s * (DOMAINE.y1 - DOMAINE.y0)) / 2;
    return { s, X: x => cx + (x - DOMAINE.x0) * s, Y: y => H - cy - (y - DOMAINE.y0) * s, x: X => DOMAINE.x0 + (X - cx) / s, y: Y => DOMAINE.y0 + (H - cy - Y) / s };
  }
  function dessinerCarte() {
    const cv = $('#al-carte');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), g = geoCarte(cv), site = etat.r.site;
    // Quadrillage de 50 km
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let x = -100; x <= DOMAINE.x1; x += 50) { const X = Math.round(g.X(x)) + 0.5; ctx.beginPath(); ctx.moveTo(X, g.Y(DOMAINE.y1)); ctx.lineTo(X, g.Y(DOMAINE.y0)); ctx.stroke(); }
    for (let y = -100; y <= DOMAINE.y1; y += 50) { const Y = Math.round(g.Y(y)) + 0.5; ctx.beginPath(); ctx.moveTo(g.X(DOMAINE.x0), Y); ctx.lineTo(g.X(DOMAINE.x1), Y); ctx.stroke(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('quadrillage 50 km', 8, 6);
    // Zones : surface, contour, points de calcul
    etat.modele.zones.forEach((z, i) => {
      const c = COUL[COUL_ZONES[i]];
      ctx.beginPath(); z.polygone.forEach(([x, y], j) => (j ? ctx.lineTo(g.X(x), g.Y(y)) : ctx.moveTo(g.X(x), g.Y(y)))); ctx.closePath();
      ctx.globalAlpha = 0.1; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = c; ctx.globalAlpha = 0.55;
      for (const p of z.points) { ctx.beginPath(); ctx.arc(g.X(p.x), g.Y(p.y), 1.5, 0, 2 * Math.PI); ctx.fill(); }
      ctx.globalAlpha = 1;
      const p = etat.r.zones[i], ymax = Math.max(...z.polygone.map(q => q[1])), xs = z.polygone.map(q => q[0]), xm = (Math.min(...xs) + Math.max(...xs)) / 2;
      if (W >= 520) {
        texte(ctx, z.nom, g.X(xm), g.Y(ymax) - 22, c, `800 12px ${POLICE}`, 'center');
        texte(ctx, `λ(M≥4) ${virg(p.lam, 2)}/an · b ${virg(p.b, 2)} · Mmax ${virg(p.mmax, 1)}`, g.X(xm), g.Y(ymax) - 8, c, `700 10.5px ${MONO}`, 'center');
      } else texte(ctx, z.nom.split(' (')[0], g.X(xm), g.Y(ymax) - 9, c, `800 11.5px ${POLICE}`, 'center');
    });
    // Failles : trace épaisse, projection en surface si elle est pentée
    for (const f of BASE.failles) {
      const actif = etat.modele.failles.length > 0, [[x0, y0], [x1, y1]] = f.trace;
      ctx.strokeStyle = COUL.teal; ctx.globalAlpha = actif ? 1 : 0.35; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.X(x0), g.Y(y0)); ctx.lineTo(g.X(x1), g.Y(y1)); ctx.stroke(); ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
      const lib = W >= 520 ? `${f.nom} · ${virg(etat.r.faille.glissement, 1)} mm/an · M ≤ ${virg(f.mmax, 1)}` : f.nom;
      texte(ctx, lib, g.X(x0) - 6, g.Y(y0) + 4, COUL.teal, `800 11px ${POLICE}`, 'right', 'top');
    }
    // Cercles de distance et site
    ctx.save();
    for (const R of [50, 100, 200]) {
      ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(g.X(site.x), g.Y(site.y), R * g.s, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
      texte(ctx, `${R} km`, g.X(site.x), g.Y(site.y) + R * g.s + 3, COUL.muted, `10.5px ${MONO}`, 'center', 'top');
    }
    ctx.restore();
    const Xs = g.X(site.x), Ys = g.Y(site.y);
    ctx.fillStyle = COUL['pick-p']; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Xs, Ys - 9); ctx.lineTo(Xs + 8, Ys + 6); ctx.lineTo(Xs - 8, Ys + 6); ctx.closePath(); ctx.stroke(); ctx.fill();
    texte(ctx, `Site · Vs30 ${milliers(site.vs30)} m/s`, Xs + 12, Ys + 2, COUL['pick-p'], `800 12px ${POLICE}`);
  }

  // Courbe d'aléa : probabilité en 50 ans en fonction du niveau, échelles logarithmiques
  const X_MIN = -3, X_MAX = Math.log10(3), Y_MIN = -5;
  function geoCourbe(cv) {
    const W = cv.clientWidth, H = cv.clientHeight, m = { g: 52, d: 84, h: 14, b: 30 };
    return { W, H, m, X: x => m.g + ((Math.log10(x) - X_MIN) / (X_MAX - X_MIN)) * (W - m.g - m.d), x: X => Math.pow(10, X_MIN + ((X - m.g) / (W - m.g - m.d)) * (X_MAX - X_MIN)),
      Y: p => H - m.b - ((Math.log10(Math.max(p, 1e-12)) - Y_MIN) / -Y_MIN) * (H - m.h - m.b) };
  }
  function trace(ctx, g, niveaux, poe) {
    ctx.beginPath();
    let premier = true;
    niveaux.forEach((x, l) => { if (poe[l] < 1e-7) return; if (premier) { ctx.moveTo(g.X(x), g.Y(poe[l])); premier = false; } else ctx.lineTo(g.X(x), g.Y(poe[l])); });
    ctx.stroke();
  }
  function dessinerCourbe() {
    const cv = $('#al-courbe');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), g = geoCourbe(cv), res = etat.res, k = etat.k;
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let e = X_MIN; e <= 0; e++) for (const f of [1, 2, 5]) {
      const x = f * Math.pow(10, e); if (Math.log10(x) > X_MAX + 1e-9) continue;
      const X = Math.round(g.X(x)) + 0.5; ctx.strokeStyle = f === 1 ? COUL['grid-strong'] : COUL.grid;
      ctx.beginPath(); ctx.moveTo(X, g.m.h); ctx.lineTo(X, H - g.m.b); ctx.stroke();
      if (f === 1 || W > 560) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(x).replace('.', ','), X, H - g.m.b + 5); }
    }
    for (let e = Y_MIN; e <= 0; e++) {
      const Y = Math.round(g.Y(Math.pow(10, e))) + 0.5; ctx.strokeStyle = COUL['grid-strong'];
      ctx.beginPath(); ctx.moveTo(g.m.g, Y); ctx.lineTo(W - g.m.d, Y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(e === 0 ? '1' : puissance(e), g.m.g - 6, Y);
    }
    // Axe de droite : périodes de retour
    ctx.textAlign = 'left';
    for (const T of [50, 100, 475, 2475, 10000, 100000]) {
      const p = 1 - Math.exp(-BASE.dureeVie / T), Y = g.Y(p);
      ctx.beginPath(); ctx.strokeStyle = COUL.muted; ctx.moveTo(W - g.m.d, Y); ctx.lineTo(W - g.m.d + 4, Y); ctx.stroke();
      ctx.fillText(`${milliers(T)} ans`, W - g.m.d + 7, Y);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(`${nomImt(k)} (g)`, W - g.m.d - 6, g.m.h + 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('probabilité de dépassement en 50 ans', g.m.g + 6, H - g.m.b - 4);
    ctx.save(); ctx.beginPath(); ctx.rect(g.m.g, g.m.h, W - g.m.g - g.m.d, H - g.m.h - g.m.b); ctx.clip();
    // Réalisations, fractiles, moyenne
    ctx.lineWidth = 1; ctx.strokeStyle = COUL.muted; ctx.globalAlpha = Math.max(0.12, Math.min(0.45, 6 / res.realisations.length));
    for (const r of res.realisations) trace(ctx, g, res.niveaux, r.poe[k]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    trace(ctx, g, res.niveaux, res.fractiles[0.16][k]); trace(ctx, g, res.niveaux, res.fractiles[0.84][k]);
    ctx.setLineDash([]); ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.6;
    trace(ctx, g, res.niveaux, res.moyenne[k]);
    // Probabilité visée et lecture
    const pc = poeCible(), Yc = g.Y(pc), x = etat.uhs.moy[k];
    ctx.strokeStyle = COUL.teal; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(g.m.g, Yc); ctx.lineTo(W - g.m.d, Yc); ctx.stroke();
    if (!enExercice() && x > 0) { ctx.beginPath(); ctx.moveTo(g.X(x), Yc); ctx.lineTo(g.X(x), H - g.m.b); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.restore();
    texte(ctx, `Tr = ${milliers(periodeRetour())} ans`, g.m.g + 8, Yc - 9, COUL.teal, `800 11px ${POLICE}`);
    if (!enExercice() && x > 0) {
      ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(g.X(x), Yc, 4, 0, 2 * Math.PI); ctx.fill();
      texte(ctx, `${g3(x)} g`, g.X(x) + 7, Yc + 12, COUL['pick-p'], `800 12px ${MONO}`);
    }
  }

  // UHS et spectres de l'EN 1998-1:2004 calés sur le PGA de l'UHS (sol déduit de Vs30)
  const classeSol = vs30 => (vs30 >= 800 ? 'A' : vs30 >= 360 ? 'B' : vs30 >= 180 ? 'C' : 'D');
  function dessinerUHS() {
    const cv = $('#al-uhs');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 14, h: 14, b: 30 }, Tmax = 3;
    const sol = classeSol(etat.r.site.vs30), pga = etat.uhs.moy[K_PGA], ag = pga / Sp.EC8_2004[1][sol].S;
    const ec8 = (T, type) => Sp.ec8(T, { type, sol, ag: pga / Sp.EC8_2004[type][sol].S });
    let ymax = Math.max(...etat.uhs.q84, ...[0.15, 0.3, 0.6, 1].map(T => Math.max(ec8(T, 1), ec8(T, 2))));
    ymax = ymax > 0 ? ymax * 1.12 : 0.1;
    const pas = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find(p => ymax / p <= 6) || 1;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let T = 0; T <= Tmax + 1e-9; T += 0.5) { const x = Math.round(X(T)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(T, T % 1 ? 1 : 0), x, H - m.b + 5); }
    for (let v = 0; v <= ymax + 1e-9; v += pas) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, pas < 0.1 ? 2 : 1), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('période T (s)', W - m.d - 4, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('Sa (g), ξ = 5 %', m.g + 6, m.h + 2);
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    if (pga > 0) {
      for (const [type, c] of [[1, 'teal'], [2, 'amp']]) {
        ctx.strokeStyle = COUL[c]; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]); ctx.beginPath();
        for (let i = 0; i <= 300; i++) { const T = (Tmax * i) / 300; if (i) ctx.lineTo(X(T), Y(ec8(T, type))); else ctx.moveTo(X(T), Y(ec8(T, type))); }
        ctx.stroke();
      }
    }
    ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.16; ctx.beginPath();
    BASE.imts.forEach((_, k) => { if (k) ctx.lineTo(X(periode(k)), Y(etat.uhs.q84[k])); else ctx.moveTo(X(periode(k)), Y(etat.uhs.q84[k])); });
    for (let k = BASE.imts.length - 1; k >= 0; k--) ctx.lineTo(X(periode(k)), Y(etat.uhs.q16[k]));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    if (!enExercice()) {
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.6; ctx.beginPath();
      BASE.imts.forEach((_, k) => { if (k) ctx.lineTo(X(periode(k)), Y(etat.uhs.moy[k])); else ctx.moveTo(X(periode(k)), Y(etat.uhs.moy[k])); });
      ctx.stroke();
      ctx.fillStyle = COUL['pick-p'];
      BASE.imts.forEach((_, k) => { ctx.beginPath(); ctx.arc(X(periode(k)), Y(etat.uhs.moy[k]), 3, 0, 2 * Math.PI); ctx.fill(); });
    }
    ctx.restore();
    $('#al-legende-ec8').textContent = pga > 0 ? `sol ${sol} (Vs30 ${milliers(etat.r.site.vs30)} m/s)${enExercice() ? '' : `, ag = ${g3(ag)} g`}` : '';
  }

  // Spectre moyen conditionnel (CMS) face à l'UHS : il touche l'UHS à T* et passe dessous ailleurs
  function dessinerCMS() {
    const cv = $('#al-cms');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), etroit = cv.clientWidth < 600, m = { g: 52, d: 14, h: etroit ? 46 : 30, b: 30 }, Tmax = 3, c = etat.cms;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    // en exercice, CMS(T*) = x et le scénario M̄, R̄ donneraient les réponses
    const absent = enExercice() ? 'spectre conditionnel affiché après la vérification' : !c ? 'probabilité visée non atteinte' : '';
    if (absent) { ctx.textAlign = 'center'; ctx.fillText(absent, W / 2, H / 2); return; }
    const haut = c.moyenne.map((v, k) => v * Math.exp(c.ecart[k])), bas = c.moyenne.map((v, k) => v * Math.exp(-c.ecart[k]));
    let ymax = Math.max(...etat.uhs.moy, ...haut) * 1.08;
    const pas = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find(p => ymax / p <= 6) || 1;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (Math.min(v, ymax) / ymax) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let T = 0; T <= Tmax + 1e-9; T += 0.5) { const x = Math.round(X(T)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(T, T % 1 ? 1 : 0), x, H - m.b + 5); }
    for (let v = 0; v <= ymax + 1e-9; v += pas) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, pas < 0.1 ? 2 : 1), m.g - 6, y); }
    // au-dessus des courbes, qui descendent vers les longues périodes
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('période T (s)', W - m.d - 4, m.h + 2);
    ctx.textAlign = 'left'; ctx.fillText('Sa (g), ξ = 5 %', m.g + 6, m.h + 2);
    const ligne = (vals, coul, w, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      BASE.imts.forEach((_, k) => (k ? ctx.lineTo(X(periode(k)), Y(vals[k])) : ctx.moveTo(X(periode(k)), Y(vals[k]))));
      ctx.stroke(); ctx.setLineDash([]);
    };
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    // bande ± σ du spectre conditionnel
    ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.14; ctx.beginPath();
    BASE.imts.forEach((_, k) => (k ? ctx.lineTo(X(periode(k)), Y(haut[k])) : ctx.moveTo(X(periode(k)), Y(haut[k]))));
    for (let k = BASE.imts.length - 1; k >= 0; k--) ctx.lineTo(X(periode(k)), Y(bas[k]));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ligne(etat.uhs.moy, COUL['pick-p'], 2, [6, 4]);
    ligne(c.moyenne, COUL.blue, 2.8);
    ctx.fillStyle = COUL.blue;
    BASE.imts.forEach((_, k) => { ctx.beginPath(); ctx.arc(X(periode(k)), Y(c.moyenne[k]), 3, 0, 2 * Math.PI); ctx.fill(); });
    // période de conditionnement
    const Ts = periode(etat.k);
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(Ts), m.h + 16); ctx.lineTo(X(Ts), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    texte(ctx, `T* = ${nomImt(etat.k)} · ${g3(etat.uhs.moy[etat.k])} g à Tr ${milliers(periodeRetour())} ans`, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    texte(ctx, `scénario : M̄ ${virg(c.mMoy, 1)} · R̄ ${virg(c.rMoy, 0)} km · ε̄ ${virg(c.epsMoy, 2)}`, etroit ? m.g : W - m.d, etroit ? 31 : 14, COUL.blue, `800 12px ${POLICE}`, etroit ? 'left' : 'right');
  }

  // Désagrégation : carte de chaleur magnitude × distance épicentrale
  function dessinerDesag() {
    const cv = $('#al-desag');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), etroit = cv.clientWidth < 600, m = { g: 48, d: 14, h: etroit ? 46 : 30, b: 30 }, d = etat.desag;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    if (!d) { ctx.textAlign = 'center'; ctx.fillText('probabilité visée non atteinte', W / 2, H / 2); return; }
    const Rmax = Math.max(100, Math.ceil(Math.max(...d.cases.filter(c => c.part > 1e-3).map(c => c.r1)) / 20) * 20);
    const M0 = 4, M1 = 8, X = R => m.g + (R / Rmax) * (W - m.g - m.d), Y = M => H - m.b - ((M - M0) / (M1 - M0)) * (H - m.h - m.b);
    const pmax = Math.max(...d.cases.map(c => c.part));
    for (const c of d.cases) {
      if (c.r0 >= Rmax) continue;
      const a = Math.pow(c.part / pmax, 0.6);
      ctx.globalAlpha = 0.08 + 0.92 * a; ctx.fillStyle = COUL['pick-p'];
      ctx.fillRect(X(c.r0) + 1, Y(c.m1) + 1, X(c.r1) - X(c.r0) - 2, Y(c.m0) - Y(c.m1) - 2);
      ctx.globalAlpha = 1;
      if (c.part >= 0.01 && X(c.r1) - X(c.r0) > 26) texte(ctx, virg(100 * c.part, 0), (X(c.r0) + X(c.r1)) / 2, (Y(c.m0) + Y(c.m1)) / 2, COUL.ink, `700 10.5px ${MONO}`, 'center');
    }
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.fillStyle = COUL.muted; ctx.font = `10.5px ${MONO}`;
    for (let R = 0; R <= Rmax; R += 20) { const x = Math.round(X(R)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); if (R % (Rmax > 160 ? 40 : 20) === 0) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(R), x, H - m.b + 5); } }
    for (let M = M0; M <= M1; M += 0.5) { const y = Math.round(Y(M)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(M, 1), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('distance Rjb (km) : épicentrale pour les zones', W - m.d - 4, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('M', m.g + 4, m.h + 2);
    const titre = `${nomImt(etat.k)} ≥ ${enExercice() ? 'UHS moyen' : g3(etat.uhs.moy[etat.k]) + ' g'} · Tr ${milliers(periodeRetour())} ans · parts en %`;
    texte(ctx, titre, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    if (!enExercice()) {
      const xm = X(d.rMoy), ym = Y(d.mMoy);
      ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(xm - 7, ym); ctx.lineTo(xm + 7, ym); ctx.moveTo(xm, ym - 7); ctx.lineTo(xm, ym + 7); ctx.stroke();
      const zones = [...d.zones.map((p, i) => `${etat.modele.zones[i].nom.split(' (')[0]} ${virg(100 * p, 0)} %`),
        ...d.failles.map((p, i) => `${etat.modele.failles[i].nom} ${virg(100 * p, 0)} %`)].join(' · ');
      texte(ctx, `M̄ ${virg(d.mMoy, 1)} · R̄ ${virg(d.rMoy, 0)} km · ${zones}`, etroit ? m.g : W - m.d, etroit ? 31 : 14, COUL.blue, `800 12px ${POLICE}`, etroit ? 'left' : 'right');
    }
  }

  // Sensibilité : une ligne par ensemble de branches, triées par étendue
  function dessinerTornade() {
    const cv = $('#al-tornade');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: Math.min(150, W * 0.3), d: 18, h: 22, b: 44 };
    const xMoy = etat.uhs.moy[etat.k];
    if (!(xMoy > 0)) return;
    const court = t => t.replace(/ \((proche|lointaine)\)/, '').replace('Akkar, Sandıkkaya et Bommer', 'Akkar et al.')
      .replace('Loi d\'atténuation', W < 520 ? 'Loi' : 'Loi d\'atténuation').replace('Modèle de taux', W < 520 ? 'Taux' : 'Modèle de taux');
    const lignes = etat.sens.map(e => ({ ...e, nom: court(e.nom), branches: e.branches.map(b => ({ ...b, libelle: court(b.libelle) })), min: Math.min(...e.branches.map(b => b.niveau)), max: Math.max(...e.branches.map(b => b.niveau)) }))
      .sort((p, q) => (q.max - q.min) - (p.max - p.min));
    const lo = Math.min(xMoy, ...lignes.map(l => l.min)) * 0.92, hi = Math.max(xMoy, ...lignes.map(l => l.max)) * 1.08;
    const X = x => m.g + ((x - lo) / (hi - lo)) * (W - m.g - m.d), hL = (H - m.h - m.b) / lignes.length;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    const pas = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2].find(p => (hi - lo) / p <= 6) || 0.5;
    for (let v = Math.ceil(lo / pas) * pas; v <= hi; v += pas) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(v, pas < 0.01 ? 3 : 2), x, H - m.b + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(`${nomImt(etat.k)} (g) à Tr = ${milliers(periodeRetour())} ans`, W - m.d, H - 5);
    lignes.forEach((l, i) => {
      const y = m.h + hL * (i + 0.5);
      texte(ctx, l.nom, m.g - 10, y, COUL.ink, `700 12px ${POLICE}`, 'right');
      if (l.branches.length < 2) { texte(ctx, 'branche unique', X(xMoy) + 8, y, COUL.muted, `11px ${POLICE}`); return; }
      ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.22; ctx.fillRect(X(l.min), y - hL * 0.28, X(l.max) - X(l.min), hL * 0.56); ctx.globalAlpha = 1;
      l.branches.forEach(b => { ctx.fillStyle = COUL.blue; ctx.beginPath(); ctx.arc(X(b.niveau), y, 3.5, 0, 2 * Math.PI); ctx.fill(); });
      const bmin = l.branches.find(b => b.niveau === l.min), bmax = l.branches.find(b => b.niveau === l.max);
      if (hL > 30) {
        texte(ctx, bmin.libelle, X(l.min), y - hL * 0.28 - 7, COUL.muted, `10.5px ${POLICE}`, 'center');
        texte(ctx, bmax.libelle, X(l.max), y + hL * 0.28 + 8, COUL.muted, `10.5px ${POLICE}`, 'center');
      }
    });
    ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(xMoy), m.h - 6); ctx.lineTo(X(xMoy), H - m.b); ctx.stroke();
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const u = etat.uhs, cache = enExercice(), d = etat.desag, n = etat.res.realisations.length;
    const val = (k, suff = ' g') => (cache || !(u.moy[k] > 0) ? '—' : g3(u.moy[k]) + suff);
    const frac = k => (cache || !(u.moy[k] > 0) ? 'fractiles masqués' : `16–84 % : ${g3(u.q16[k])} – ${g3(u.q84[k])}`);
    const v = etat.res.variantes, nCat = v.filter(x => x.id[0] === 'c').length, nGeo = v.length - nCat;
    const tailles = [nGeo ? `(${nCat} + ${nGeo})` : String(nCat), etat.modele.dMmax.length, etat.modele.gmpe.length];
    $('#al-afficheurs').innerHTML = [
      afficheur('PGA moyen', val(K_PGA), frac(K_PGA)),
      afficheur('Période de retour', milliers(periodeRetour()) + ' ans', `${virg(100 * etat.proba[0], 0)} % en ${etat.proba[1]} ans`),
      afficheur('Sa(0,2 s) moyen', val(K_SA02), frac(K_SA02)),
      afficheur('Sa(1 s) moyen', val(K_SA1), frac(K_SA1)),
      afficheur('Scénario dominant', cache || !d ? '—' : `M ${virg(d.mMoy, 1)}`, cache || !d ? nomImt(etat.k) : `R̄ = ${virg(d.rMoy, 0)} km, ${nomImt(etat.k)}`),
      afficheur('Réalisations', String(n), tailles.join(' × ')),
    ].join('');
    $('#al-arbre').textContent = `${n} réalisations = ${tailles.join(' × ')} : variantes de taux${nGeo ? ` (${nCat} du catalogue, ${nGeo} couplages géodésiques)` : ' du catalogue'}, Mmax, loi d'atténuation. Courbes calculées en ${milliers(etat.duree)} ms.`;
    const g = etat.r.geo;
    $('#al-geo-source').textContent = `Moments géodésiques : zone A ${sci(g.moments[0])}, zone B ${sci(g.moments[1])} N·m/an (${g.source}).`;
  }
  function majControles() {
    const r = etat.r, z = r.zones[etat.zone];
    $('#al-vs30').value = r.site.vs30; $('#al-vs30-v').textContent = `${milliers(r.site.vs30)} m/s · sol ${classeSol(r.site.vs30)}`;
    $$('[data-al-zone]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.alZone === etat.zone)));
    $('#al-lam').value = Math.log10(z.lam); $('#al-lam-v').textContent = virg(z.lam, 2) + ' /an';
    $('#al-b').value = z.b; $('#al-b-v').textContent = virg(z.b, 2);
    $('#al-mmax').value = z.mmax; $('#al-mmax-v').textContent = virg(z.mmax, 1);
    $('#al-inc-ab').checked = r.incAB; $('#al-inc-mmax').checked = r.incMmax; $('#al-inc-geo').checked = r.geo.actif;
    $('#al-poids-geo').value = r.geo.poids; $('#al-poids-geo-v').textContent = `${virg(r.geo.poids, 2)} / ${virg(1 - r.geo.poids, 2)}`;
    $('#al-poids-geo').disabled = !r.geo.actif;
    $('#al-faille').checked = r.faille.actif; $('#al-glissement').value = r.faille.glissement; $('#al-glissement').disabled = !r.faille.actif;
    const mF = Psha.momentFaille(BASE, { ...BASE.failles[0], glissement: r.faille.glissement });
    $('#al-glissement-v').textContent = `${virg(r.faille.glissement, 2)} mm/an · Ṁ0 ${sci(mF)} N·m/an`;
    $$('[data-al-loi]').forEach(c => { c.checked = r.lois[c.dataset.alLoi]; });
    const nL = Object.values(r.lois).filter(Boolean).length;
    $('#al-lois-v').textContent = nL > 1 ? `${nL} lois, poids 1/${nL} chacune` : 'une seule loi : pas d\'incertitude épistémique sur le mouvement du sol';
    $$('[data-al-proba]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.alProba === etat.proba.join('|'))));
    $$('[data-al-imt]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.alImt === etat.k)));
  }
  function dessiner() { lireCouleurs(); dessinerCarte(); dessinerCourbe(); dessinerUHS(); dessinerCMS(); dessinerDesag(); dessinerTornade(); }
  function tout() { majControles(); dessiner(); majAfficheurs(); }
  function recalculer() {
    const t0 = performance.now();
    calculer();
    etat.duree = performance.now() - t0;
    tout();
  }

  // ── Exercice ────────────────────────────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 7919 + 3);
    etat.exo = { numero };
    etat.r = {
      site: { x: Math.round(u.entre(-40, 85) / 5) * 5, y: Math.round(u.entre(-40, 40) / 5) * 5, vs30: 800 },
      zones: [
        { lam: Math.round(u.entre(0.1, 0.5) * 100) / 100, b: Math.round(u.entre(0.9, 1.1) * 100) / 100, mmax: Math.round(u.entre(6, 6.8) * 10) / 10 },
        { lam: Math.round(u.entre(0.6, 3) * 10) / 10, b: Math.round(u.entre(0.8, 1) * 100) / 100, mmax: Math.round(u.entre(7, 7.6) * 10) / 10 },
      ],
      incAB: true, incMmax: true, lois: reglagesDefaut().lois, geo: { ...reglagesDefaut().geo, actif: false }, faille: { ...reglagesDefaut().faille, actif: false },
    };
    etat.proba = [0.1, 50]; etat.verifie = false; etat.dom = null;
    $('#al-exo-num').textContent = 'Exercice n° ' + numero;
    $('#al-r-pga').value = ''; $('#al-r-sa1').value = '';
    $$('[data-al-dom]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#al-corrige').innerHTML = '';
    recalculer();
  }
  function verifier() {
    const P = Psha.niveauPourProba, res = etat.res, poe = 1 - Math.exp(-BASE.dureeVie / Psha.periodeRetour(0.1, 50));
    const pga = P(res.niveaux, res.moyenne[K_PGA], poe), sa1 = P(res.niveaux, res.moyenne[K_SA1], poe);
    const zones = Psha.desagregation(etat.modele, 1, sa1).zones, dom = zones[0] >= zones[1] ? 0 : 1;
    const lu = id => parseFloat(String($(id).value).replace(',', '.'));
    const vPga = lu('#al-r-pga'), vSa1 = lu('#al-r-sa1');
    const okP = Math.abs(vPga / pga - 1) <= 0.1, okS = Math.abs(vSa1 / sa1 - 1) <= 0.1, okD = etat.dom === dom;
    etat.verifie = true;
    const nomZone = i => (i === null ? '—' : etat.modele.zones[i].nom);
    const lignes = [
      ['PGA à 475 ans', Number.isFinite(vPga) ? g3(vPga) + ' g' : '—', g3(pga) + ' g', okP, '± 10 %, sur la courbe moyenne'],
      ['Sa(1 s) à 475 ans', Number.isFinite(vSa1) ? g3(vSa1) + ' g' : '—', g3(sa1) + ' g', okS, '± 10 %, sur l\'UHS moyen'],
      ['Zone qui domine Sa(1 s)', nomZone(etat.dom), `${nomZone(dom)} (${virg(100 * zones[dom], 0)} %)`, okD, 'désagrégation du taux de dépassement'],
    ];
    $('#al-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">Aux courtes périodes, les petits séismes proches suffisent ; à 1 s, seuls les grands séismes rayonnent assez d'énergie en
      longue période, et ils sont plus fréquents dans la zone la plus active même si elle est plus loin. Choisissez Sa(1 s) au-dessus de la courbe pour le voir.</p>`;
    tout();
  }

  // ── Événements ──────────────────────────────────────────────────────────
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 120); };
  function brancher() {
    $('#al-imts').innerHTML = CHOIX_IMTS.map(k => `<button type="button" data-al-imt="${k}">${nomImt(k)}</button>`).join('');
    $$('[data-al-imt]').forEach(b => b.addEventListener('click', () => { etat.k = +b.dataset.alImt; analyser(); tout(); }));
    $$('[data-al-proba]').forEach(b => b.addEventListener('click', () => { etat.proba = b.dataset.alProba.split('|').map(Number); analyser(); tout(); }));
    $$('[data-al-zone]').forEach(b => b.addEventListener('click', () => { etat.zone = +b.dataset.alZone; majControles(); }));
    $('#al-vs30').addEventListener('input', e => { etat.r.site.vs30 = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-lam').addEventListener('input', e => { etat.r.zones[etat.zone].lam = Math.round(Math.pow(10, parseFloat(e.target.value)) * 100) / 100; majControles(); planifier(); });
    $('#al-b').addEventListener('input', e => { etat.r.zones[etat.zone].b = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-mmax').addEventListener('input', e => { etat.r.zones[etat.zone].mmax = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-inc-ab').addEventListener('change', e => { etat.r.incAB = e.target.checked; recalculer(); });
    $('#al-inc-mmax').addEventListener('change', e => { etat.r.incMmax = e.target.checked; recalculer(); });
    $('#al-inc-geo').addEventListener('change', e => { etat.r.geo.actif = e.target.checked; recalculer(); });
    $('#al-faille').addEventListener('change', e => { etat.r.faille.actif = e.target.checked; recalculer(); });
    $('#al-glissement').addEventListener('input', e => { etat.r.faille.glissement = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-poids-geo').addEventListener('input', e => { etat.r.geo.poids = parseFloat(e.target.value); majControles(); planifier(); });
    $$('[data-al-loi]').forEach(c => c.addEventListener('change', () => {
      etat.r.lois[c.dataset.alLoi] = c.checked;
      if (!Object.values(etat.r.lois).some(Boolean)) { etat.r.lois[c.dataset.alLoi] = true; c.checked = true; return; } // au moins une loi
      recalculer();
    }));
    $('#al-defaut').addEventListener('click', () => { etat.r = reglagesDefaut(); etat.geoRecu = null; recalculer(); });
    $$('[data-al-dom]').forEach(b => b.addEventListener('click', () => { etat.dom = +b.dataset.alDom; $$('[data-al-dom]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $('#al-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#al-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#al-verifier').addEventListener('click', verifier);
    $('#al-nouvel-exo').addEventListener('click', nouvelExercice);
    // Carte : un clic déplace le site (pas de 5 km) ; le survol donne la position et les distances aux zones
    const cv = $('#al-carte');
    const position = e => { const g = geoCarte(cv); return { x: g.x(e.offsetX), y: g.y(e.offsetY) }; };
    cv.addEventListener('click', e => {
      if (etat.mode === 'exercice') return;
      const p = position(e);
      if (p.x < DOMAINE.x0 || p.x > DOMAINE.x1 || p.y < DOMAINE.y0 || p.y > DOMAINE.y1) return;
      etat.r.site.x = Math.round(p.x / 5) * 5; etat.r.site.y = Math.round(p.y / 5) * 5;
      recalculer();
    });
    cv.addEventListener('pointermove', e => {
      const p = position(e);
      if (p.x < DOMAINE.x0 || p.x > DOMAINE.x1 || p.y < DOMAINE.y0 || p.y > DOMAINE.y1) { $('#al-curseur').textContent = '—'; return; }
      const dz = etat.modele.zones.map(z => Math.min(...z.points.map(q => Math.hypot(q.x - p.x, q.y - p.y))));
      $('#al-curseur').textContent = `x ${virg(p.x, 0)} km, y ${virg(p.y, 0)} km · point le plus proche : zone A ${virg(dz[0], 0)} km, zone B ${virg(dz[1], 0)} km`
        + (etat.mode === 'exercice' ? '' : ' — cliquer pour y placer le site');
    });
    const redessiner = () => { if (etat.res && !$('#banc-alea').hidden) dessiner(); };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#al-carte', '#al-courbe', '#al-uhs', '#al-cms', '#al-desag', '#al-tornade']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#al-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#al-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#al-panneau-explorer').hidden = m !== 'explorer';
    $('#al-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); if (etat.geoRecu) etat.r.geo = etat.geoRecu; etat.verifie = false; recalculer(); }
  }

  // Moments estimés au banc « géodésie » : ils remplacent ceux du modèle d'école (hors exercice).
  window.addEventListener('geodesie:moments', e => {
    etat.geoRecu = { ...reglagesDefaut().geo, moments: e.detail.moments.slice(), source: e.detail.source };
    if (etat.mode !== 'explorer') return; // appliqué au retour en exploration
    etat.r.geo = { ...etat.r.geo, ...etat.geoRecu, actif: true, poids: etat.r.geo.poids };
    if (etat.pret) recalculer();
  });
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'alea') return;
    if (!etat.pret) { etat.pret = true; brancher(); recalculer(); }
    else tout();
  });
})();
