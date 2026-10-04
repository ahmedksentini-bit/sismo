import Spectre from './sismo/spectre.js';
import Sismo from './sismo/signal.js';
import Accelero from './sismo/accelerogramme.js';
import Batiment from './sismo/batiment.js';

// src/banc-batiment.js — banc « bâtiment » : bâtiment à étages en console de cisaillement ; modes propres et
// masses effectives, spectre de calcul de l'EN 1998-1:2004, méthode des forces latérales et analyse modale
// spectrale (SRSS, CQC), limitation des dommages et coefficient θ ; combinaisons modales face à des calculs
// temporels (sept accélérogrammes calés sur Se(T1), superposition modale). Calcul dans src/sismo/batiment.js
// (vérifié contre OpenSeesPy).
(() => {
  'use strict';
  const Sp = Spectre, B = Batiment, G = Sp.G;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => (Number.isFinite(x) ? String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace(/^-/, '−') : '—');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const pc = (x, d = 1) => `${virg(100 * x, d)}\u00a0%`;

  const HAUTEUR = 3, NB_ACC = 7, SCENARIO = { M: 6.5, R: 20 };
  const PROFILS = {
    regulier: { nom: 'Régulier', regulier: true, m: () => 1, k: () => 1 },
    degressif: { nom: 'Rigidité dégressive', regulier: true, m: () => 1, k: (i, n) => (n > 1 ? 1 - (0.5 * i) / (n - 1) : 1) },
    souple: { nom: 'Étage souple', regulier: false, m: () => 1, k: i => (i === 0 ? 0.4 : 1) },
    toiture: { nom: 'Toiture lourde', regulier: false, m: (i, n) => (i === n - 1 && n > 1 ? 2.5 : 1), k: () => 1 },
  };
  const LIMITES = { fragiles: { a: 0.005, nom: 'éléments fragiles' }, ductiles: { a: 0.0075, nom: 'éléments ductiles' }, libres: { a: 0.01, nom: 'éléments indépendants de la structure' } };
  const reglagesDefaut = () => ({ profil: 'regulier', n: 6, masse: 300, k: 400, ag: 0.25, sol: 'B', type: 1, q: 3, forme: 'z', limite: 'ductiles', nu: 0.5, graine: 500 });
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), res: null, jeu: null, cleJeu: null, vu: 0, exo: null, verifie: false, rep: {} };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  // ── Calcul ──────────────────────────────────────────────────────────────
  function batiment(r = etat.r) {
    const p = PROFILS[r.profil], n = r.n, idx = Array.from({ length: n }, (_, i) => i);
    return { m: idx.map(i => r.masse * p.m(i, n)), k: idx.map(i => r.k * 1000 * p.k(i, n)), h: idx.map(() => HAUTEUR) };
  }
  function jeu() {
    const cle = String(etat.r.graine);
    if (etat.cleJeu !== cle) {
      etat.jeu = Array.from({ length: NB_ACC }, (_, i) => Accelero.simuler({ M: SCENARIO.M, R: SCENARIO.R, graine: etat.r.graine + 23 * i })).map(x => ({ acc: x.acc, dt: x.dt }));
      etat.cleJeu = cle;
    }
    return etat.jeu;
  }
  function calculer() {
    const r = etat.r, bat = batiment(), md = B.modes(bat), sp = { type: r.type, sol: r.sol, ag: r.ag, q: r.q };
    const { TC } = Sp.EC8_2004[r.type][r.sol], T1 = md[0].T, H = HAUTEUR * r.n, M = bat.m.reduce((a, b) => a + b, 0);
    const Sd = T => Sp.ec8Calcul(T, sp) * G, Se = T => Sp.ec8(T, sp) * G;
    // méthode des forces latérales (forme zᵢ ou déformée du mode 1)
    const fl = B.forcesLaterales(bat, { T1, Sd: Sd(T1), TC, forme: r.forme === 'phi' ? md[0].phi : null });
    const regulier = PROFILS[r.profil].regulier, permis = B.forcesLateralesPermises(T1, TC);
    const flV = B.statique(bat.k, fl.F);
    // analyse modale spectrale : modes retenus, règle de combinaison
    const ret = B.modesRetenus(md), indep = B.independants(md, ret.n), regle = indep ? 'srss' : 'cqc';
    const srss = B.spectrale(bat, md, Sd, { n: ret.n, regle: 'srss' }), cqc = B.spectrale(bat, md, Sd, { n: ret.n, regle: 'cqc' });
    const retenue = regle === 'srss' ? srss : cqc;
    const verif = B.verifications(bat, retenue, { q: r.q, nu: r.nu });
    const theta = Math.max(...verif.theta), iTheta = verif.theta.indexOf(theta);
    const ratio = Math.max(...verif.ratio), iRatio = verif.ratio.indexOf(ratio);
    // calculs temporels élastiques : accélérogrammes calés sur Se(T1)
    const temps = jeu().map(x => {
      const s = Se(T1) / (Sp.reponse(x.acc, x.dt, [T1], 0.05).Sa[0]), acc = Float64Array.from(x.acc, v => v * s);
      const t = B.temporel(bat, md, acc, x.dt);
      const R = md.map((mo, j) => B.reponseModale(mo, bat, t.Sd[j] * mo.w * mo.w).V);
      const w = md.map(mo => mo.w);
      return { s, h: t.h, base: t.base, VMax: t.VMax, vb: t.VMax[0], srss: B.combiner(R, w, 'srss')[0], cqc: B.combiner(R, w, 'cqc')[0] };
    });
    etat.res = {
      bat, md, sp, TC, T1, H, M, Sd, Se, fl, flV, regulier, permis, ret, indep, regle, srss, cqc, retenue, verif, theta, iTheta, ratio, iRatio, temps,
      Tct: Sp.periodeApprochee(H, 'beton'), T2d: B.periodeDeplacement(bat),
    };
    etat.vu = Math.min(etat.vu, NB_ACC - 1);
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
  function message(cv, t) {
    const { ctx, W, H } = preparer(cv);
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, W / 2, H / 2);
  }
  const pas = (max, n = 5) => [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 1e4, 2e4, 5e4, 1e5].find(p => max / p <= n) || 1e5;
  function axes(ctx, m, X, Y, x0, x1, y0, y1, { fx = v => virg(v, 1), fy = v => virg(v, 2), nx = 5, ny = 5 } = {}) {
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    const px = pas(x1 - x0, nx), py = pas(y1 - y0, ny);
    for (let v = Math.ceil(x0 / px - 1e-9) * px; v <= x1 + 1e-9; v += px) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, Y(y1)); ctx.lineTo(x, Y(y0)); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(fx(v), x, Y(y0) + 5); }
    for (let v = Math.ceil(y0 / py - 1e-9) * py; v <= y1 + 1e-9; v += py) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(X(x0), y); ctx.lineTo(X(x1), y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fy(v), X(x0) - 6, y); }
  }

  // Déformées des premiers modes, côte à côte
  function dessinerModes() {
    const cv = $('#bt-modes');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, md = res.md, nm = Math.min(md.length, W < 600 ? 3 : 4), z = B.cotes(res.bat.h);
    const lw = W / nm, haut = 70, bas = 22, Y = v => H - bas - (v / res.H) * (H - haut - bas);
    for (let j = 0; j < nm; j++) {
      const x0 = j * lw, xc = x0 + lw / 2, mo = md[j], amax = Math.max(...mo.phi.map(Math.abs)), A = (0.26 * lw) / amax, dalle = Math.min(0.2 * lw, 40);
      // en exercice, le nombre de modes à retenir est demandé : tous les modes ont la même couleur
      const X = v => xc + v * A, retenu = enExercice() || j < res.ret.n;
      if (j) { ctx.strokeStyle = COUL.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 0.5, 8); ctx.lineTo(x0 + 0.5, H - 8); ctx.stroke(); }
      // sol et position au repos
      ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xc - dalle - 10, Y(0)); ctx.lineTo(xc + dalle + 10, Y(0)); ctx.stroke();
      ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xc, Y(0)); ctx.lineTo(xc, Y(res.H)); ctx.stroke(); ctx.setLineDash([]);
      // poteaux déformés (droits dans chaque étage : console de cisaillement) et planchers
      const coul = retenu ? COUL.blue : COUL.muted;
      ctx.strokeStyle = coul; ctx.lineWidth = 2;
      for (const c of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(xc + c * dalle, Y(0));
        mo.phi.forEach((p, i) => ctx.lineTo(X(p) + c * dalle, Y(z[i])));
        ctx.stroke();
      }
      ctx.lineWidth = 3.2;
      mo.phi.forEach((p, i) => { ctx.beginPath(); ctx.moveTo(X(p) - dalle - 4, Y(z[i])); ctx.lineTo(X(p) + dalle + 4, Y(z[i])); ctx.stroke(); });
      texte(ctx, `Mode ${j + 1}`, xc, 13, retenu ? COUL.ink : COUL.muted, `800 12px ${POLICE}`, 'center');
      texte(ctx, `T = ${virg(mo.T, mo.T < 0.1 ? 3 : 2)} s`, xc, 31, retenu ? COUL.blue : COUL.muted, `700 11px ${MONO}`, 'center');
      texte(ctx, `meff ${pc(mo.part, mo.part < 0.1 ? 1 : 0)}`, xc, 47, retenu ? COUL.blue : COUL.muted, `700 11px ${MONO}`, 'center');
    }
  }

  // Spectre de calcul, périodes des modes, périodes approchées
  function dessinerSpectre() {
    const cv = $('#bt-spectre');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, m = { g: 50, d: 14, h: 34, b: 30 };
    const Tmax = Math.max(3, res.T1 * 1.15), ymax = (res.Se(Sp.EC8_2004[res.sp.type][res.sp.sol].TC) / G) * 1.12;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    axes(ctx, m, X, Y, 0, Tmax, 0, ymax, { fx: v => virg(v, 1), fy: v => virg(v, ymax < 0.2 ? 3 : 2) });
    // en exercice, le domaine des forces latérales et les modes retenus sont des réponses : rien n'est distingué
    const lim = Math.min(4 * res.TC, 2), cache = enExercice();
    if (!cache) { ctx.fillStyle = COUL.soft; ctx.fillRect(X(0), m.h, X(lim) - X(0), H - m.h - m.b); }
    const courbe = (f, coul, w, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      for (let i = 0; i <= 300; i++) { const T = (i / 300) * Tmax; (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(T), Y(f(T) / G)); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    courbe(res.Se, COUL.teal, 1.4, [6, 4]);
    courbe(res.Sd, COUL.blue, 2.4);
    ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(0), Y(0.2 * res.sp.ag)); ctx.lineTo(X(Tmax), Y(0.2 * res.sp.ag)); ctx.stroke(); ctx.setLineDash([]);
    // modes
    res.md.forEach((mo, j) => {
      if (mo.T > Tmax) return;
      const x = X(mo.T), y = Y(res.Sd(mo.T) / G), retenu = cache || j < res.ret.n;
      ctx.strokeStyle = retenu ? COUL.blue : COUL['grid-strong']; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Y(0)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = retenu ? COUL.blue : COUL.muted; ctx.beginPath(); ctx.arc(x, y, 3 + 9 * Math.sqrt(mo.part), 0, 2 * Math.PI); ctx.fill();
      if (j < 2) texte(ctx, String(j + 1), x + 5 + 9 * Math.sqrt(mo.part), y - 10, COUL.ink, `700 11px ${MONO}`);
    });
    // périodes approchées : Ct·H^¾ (béton) et 2·√d
    const repere = (T, coul) => {
      if (T > Tmax) return;
      const x = X(T);
      ctx.fillStyle = coul; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, Y(0) - 1); ctx.lineTo(x - 6, Y(0) - 12); ctx.lineTo(x + 6, Y(0) - 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    repere(res.Tct, COUL['pick-p']);
    repere(res.T2d, COUL.amp);
    if (!cache) texte(ctx, `min(4·TC ; 2 s) = ${virg(lim, 2)} s`, X(lim) - 4, m.h + 10, COUL.muted, `10.5px ${MONO}`, 'right');
    texte(ctx, `Sd et Se (g) selon T (s) · q = ${virg(res.sp.q, 1)} · sol ${res.sp.sol} · type ${res.sp.type}`, m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // Efforts tranchants d'étage et déplacements relatifs
  function dessinerEfforts() {
    const cv = $('#bt-efforts');
    if (cv.clientWidth < 50 || !etat.res) return;
    if (enExercice()) return message(cv, 'masqué pendant l\'exercice');
    const { ctx, W, H } = preparer(cv), res = etat.res, etroit = W < 600, z = B.cotes(res.bat.h), n = z.length;
    const zones = etroit ? [[0, 0, W, H / 2], [0, H / 2, W, H / 2]] : [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]];
    const marche = (ctx, vals, X, Y, coul, w, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      vals.forEach((v, i) => { const za = i ? z[i - 1] : 0; (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(v), Y(za)); ctx.lineTo(X(v), Y(z[i])); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    // efforts tranchants
    {
      const [x0, y0, Wz, Hz] = zones[0], m = { g: 44, d: 14, h: 34, b: 30 };
      const vmax = Math.max(...res.flV.V, ...res.cqc.V, ...res.srss.V) * 1.1;
      const X = v => x0 + m.g + (v / vmax) * (Wz - m.g - m.d), Y = v => y0 + Hz - m.b - (v / res.H) * (Hz - m.h - m.b);
      axes(ctx, m, X, Y, 0, vmax, 0, res.H, { fx: v => milliers(v), fy: v => virg(v, 0), nx: etroit ? 4 : 4, ny: 5 });
      marche(ctx, res.flV.V, X, Y, COUL['pick-p'], 2, res.regulier && res.permis ? null : [6, 4]);
      marche(ctx, res.srss.V, X, Y, COUL.blue, 2.4);
      marche(ctx, res.cqc.V, X, Y, COUL.cyan, 1.6, [3, 3]);
      texte(ctx, 'effort tranchant d\'étage (kN)', x0 + m.g, y0 + 15, COUL.ink, `800 12px ${POLICE}`);
      texte(ctx, 'z (m)', x0 + m.g + 4, y0 + m.h + 8, COUL.muted, `10.5px ${MONO}`);
    }
    // déplacements relatifs dr·ν / h
    {
      const [x0, y0, Wz, Hz] = zones[1], m = { g: 44, d: 14, h: 34, b: 30 }, a = LIMITES[etat.r.limite].a;
      const xmax = Math.max(a * 1.25, ...res.verif.ratio) * 1.1 * 100;
      const X = v => x0 + m.g + (v / xmax) * (Wz - m.g - m.d), Y = v => y0 + Hz - m.b - (v / res.H) * (Hz - m.h - m.b);
      axes(ctx, m, X, Y, 0, xmax, 0, res.H, { fx: v => virg(v, 2), fy: v => virg(v, 0), nx: 4 });
      ctx.fillStyle = COUL['pick-p']; ctx.globalAlpha = 0.08; ctx.fillRect(X(100 * a), Y(res.H), X(xmax) - X(100 * a), Y(0) - Y(res.H)); ctx.globalAlpha = 1;
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(100 * a), Y(0)); ctx.lineTo(X(100 * a), Y(res.H)); ctx.stroke();
      marche(ctx, res.verif.ratio.map(v => 100 * v), X, Y, COUL.blue, 2.4);
      texte(ctx, `dr·ν / h (%) · limite ${virg(100 * a, a < 0.01 ? 2 : 1)} %`, x0 + m.g, y0 + 15, COUL.ink, `800 12px ${POLICE}`);
    }
  }

  // Effort à la base au cours du temps, face aux combinaisons modales du même accélérogramme
  function dessinerTemps() {
    const cv = $('#bt-temps');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), t = etat.res.temps[etat.vu], m = { g: 56, d: 14, h: 34, b: 28 }, n = t.base.length, duree = (n - 1) * t.h;
    const vmax = Math.max(t.vb, t.srss, t.cqc) * 1.15;
    const X = s => m.g + (s / duree) * (W - m.g - m.d), Y = v => m.h + ((H - m.h - m.b) / 2) * (1 - v / vmax);
    axes(ctx, m, X, v => (v === -vmax ? H - m.b : Y(v)), 0, duree, -vmax, vmax, { fx: v => virg(v, 0), fy: v => milliers(v), ny: 4 });
    for (const [v, coul, tirets] of [[t.srss, COUL.blue, [6, 4]], [t.cqc, COUL.cyan, [2, 3]]]) {
      ctx.strokeStyle = coul; ctx.lineWidth = 1.6; ctx.setLineDash(tirets);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(m.g, Y(s * v)); ctx.lineTo(W - m.d, Y(s * v)); ctx.stroke(); }
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
    const saut = Math.max(1, Math.floor(n / (2 * (W - m.g - m.d))));
    let imax = 0;
    for (let i = 0; i < n; i++) if (Math.abs(t.base[i]) > Math.abs(t.base[imax])) imax = i;
    for (let i = 0; i < n; i += saut) {
      let lo = t.base[i], hi = t.base[i];
      for (let j = i; j < Math.min(n, i + saut); j++) { lo = Math.min(lo, t.base[j]); hi = Math.max(hi, t.base[j]); }
      (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i * t.h), Y(lo)); ctx.lineTo(X(i * t.h), Y(hi));
    }
    ctx.stroke();
    ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(X(imax * t.h), Y(t.base[imax]), 4, 0, 2 * Math.PI); ctx.fill();
    const etroit = W < 600;
    texte(ctx, `n° ${etat.vu + 1} · ×${virg(t.s, 2)} · Vb max ${milliers(t.vb)} kN`, m.g, 15, COUL.ink, `800 12px ${POLICE}`);
    texte(ctx, `SRSS ${milliers(t.srss)} · CQC ${milliers(t.cqc)} kN`, etroit ? m.g : W - m.d, etroit ? 31 : 15, COUL.blue, `800 12px ${POLICE}`, etroit ? 'left' : 'right');
    texte(ctx, 'temps (s)', W - m.d - 4, H - m.b - 10, COUL.muted, `10.5px ${MONO}`, 'right');
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const res = etat.res, c = enExercice(), vb = res.retenue.V[0];
    $('#bt-afficheurs').innerHTML = [
      afficheur('T1', `${virg(res.T1, 2)} s`, `${res.md.length} étage${res.md.length > 1 ? 's' : ''}, H = ${virg(res.H, 0)} m, ${milliers(res.M)} t`),
      afficheur('Périodes approchées', `${virg(res.Tct, 2)} · ${virg(res.T2d, 2)} s`, 'Ct·H<sup>3/4</sup> (béton) · 2·√d'),
      afficheur('Forces latérales : Fb', c ? '—' : `${milliers(res.fl.Fb)} kN`, c ? 'à calculer' : `λ = ${virg(res.fl.lambda, 2)}${res.regulier && res.permis ? '' : ' · hors domaine'}`),
      afficheur('Modal : Vb', c ? '—' : `${milliers(vb)} kN`, c ? 'à calculer' : `${res.ret.n} mode${res.ret.n > 1 ? 's' : ''}, ${res.regle.toUpperCase()}`),
      afficheur('dr·ν / h max', c ? '—' : pc(res.ratio, 2), c ? '' : `étage ${res.iRatio + 1}, limite ${pc(LIMITES[etat.r.limite].a, 2)}`),
      afficheur('θ max', c ? '—' : virg(res.theta, 3), c ? '' : `étage ${res.iTheta + 1}`),
    ].join('');
  }
  function majTables() {
    const res = etat.res, c = enExercice();
    let cumul = 0;
    $('#bt-modes-table').innerHTML = `<thead><tr><th>n°</th><th>T (s)</th>${c ? '' : '<th>Sd (g)</th>'}<th>meff (%)</th><th>cumul (%)</th></tr></thead><tbody>${res.md.map((mo, j) => {
      cumul += mo.part;
      return `<tr class="${!c && j < res.ret.n ? 'retenu' : ''}"><td class="n">${j + 1}</td><td class="n">${virg(mo.T, 3)}</td>${c ? '' : `<td class="n">${virg(res.Sd(mo.T) / G, 3)}</td>`}<td class="n">${virg(100 * mo.part, 1)}</td><td class="n">${virg(100 * cumul, 1)}</td></tr>`;
    }).join('')}</tbody>`;
    $('#bt-modes-info').textContent = c ? `Masse par niveau : ${res.bat.m.map(x => milliers(x)).join(' · ')} t ; hauteur d'étage ${virg(HAUTEUR, 0)} m.`
      : `En bleu, les ${res.ret.n} mode${res.ret.n > 1 ? 's' : ''} retenu${res.ret.n > 1 ? 's' : ''} (§ 4.3.3.3.1 (3)) : ${pc(res.ret.cumul)} de la masse.`;
    $('#bt-temps-table').innerHTML = `<thead><tr><th>n°</th><th>facteur</th><th>Vb temporel (kN)</th><th>SRSS / temp.</th><th>CQC / temp.</th></tr></thead><tbody>${res.temps.map((t, i) =>
      `<tr class="${i === etat.vu ? 'vu' : ''}" data-bt-vu="${i}" tabindex="0"><td class="n">${i + 1}</td><td class="n">×${virg(t.s, 2)}</td><td class="n">${milliers(t.vb)}</td><td class="n">${virg(t.srss / t.vb, 2)}</td><td class="n">${virg(t.cqc / t.vb, 2)}</td></tr>`).join('')}</tbody>`;
    $$('[data-bt-vu]').forEach(tr => {
      const choisir = () => { etat.vu = +tr.dataset.btVu; majTables(); dessinerTemps(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    });
    const moy = k => res.temps.reduce((a, t) => a + t[k] / t.vb, 0) / res.temps.length;
    $('#bt-temps-info').textContent = `Rapports moyens : SRSS ${virg(moy('srss'), 2)}, CQC ${virg(moy('cqc'), 2)} (combinaisons des spectres de chaque accélérogramme, tous les modes).`;
  }
  function majRegles() {
    const res = etat.res, r = etat.r;
    const ligne = (ok, t, d, neutre = false) => `<li><span class="verdict ${neutre ? '' : ok ? 'ok' : 'ko'}">${neutre ? '•' : ok ? '✓' : '✗'}</span> ${t}<br><small>${d}</small></li>`;
    const lim = Math.min(4 * res.TC, 2), a = LIMITES[r.limite].a, th = res.theta;
    const vb = res.retenue.V[0];
    $('#bt-regles').innerHTML = `<ul class="regles">${[
      ligne(res.regulier, `Régularité en élévation (§ 4.2.3.3) : ${res.regulier ? 'oui' : 'non'}`, res.regulier ? 'rigidité et masse constantes ou décroissant progressivement vers le haut' : `${PROFILS[r.profil].nom.toLowerCase()} : changement brusque de ${r.profil === 'souple' ? 'rigidité' : 'masse'}`),
      ligne(res.permis && res.regulier, `Forces latérales (§ 4.3.3.2.1) : T1 = ${virg(res.T1, 2)} s ${res.permis ? '≤' : '>'} min(4·TC ; 2 s) = ${virg(lim, 2)} s`, res.permis && res.regulier ? `applicable : Fb = Sd(T1)·m·λ = ${milliers(res.fl.Fb)} kN, soit ${virg(res.fl.Fb / vb, 2)} fois l'effort modal` : 'non applicable : analyse modale spectrale'),
      ligne(true, `Modes retenus (§ 4.3.3.3.1 (3)) : ${res.ret.n}, ${pc(res.ret.cumul)} de la masse`, 'somme des masses effectives ≥ 90 % et tous les modes de plus de 5 %', true),
      ligne(true, `Combinaison (§ 4.3.3.3.2) : ${res.indep ? 'SRSS' : 'CQC'}`, res.indep ? 'modes retenus indépendants : Tj ≤ 0,9·Ti' : 'périodes voisines (Tj > 0,9·Ti) : combinaison quadratique complète', true),
      ligne(res.ratio <= a + 1e-12, `Limitation des dommages (§ 4.4.3.2) : dr·ν/h = ${pc(res.ratio, 2)} ${res.ratio <= a ? '≤' : '>'} ${pc(a, 2)}`, `dr = q·de (4.23), ν = ${virg(r.nu, 1)}, ${LIMITES[r.limite].nom} ; étage ${res.iRatio + 1}`),
      ligne(th <= 0.1, `Second ordre (§ 4.4.2.2) : θ = ${virg(th, 3)}`, th <= 0.1 ? 'θ ≤ 0,10 : effets du second ordre négligeables' : th <= 0.2 ? `0,10 < θ ≤ 0,20 : effets majorés par 1/(1 − θ) = ${virg(1 / (1 - th), 2)}` : th <= 0.3 ? '0,20 < θ ≤ 0,30 : analyse du second ordre explicite' : 'θ > 0,30 : interdit, rigidifier'),
    ].join('')}</ul>`;
  }
  function majControles() {
    const r = etat.r;
    $$('[data-bt-profil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.btProfil === r.profil)));
    $('#bt-n').value = r.n; $('#bt-n-v').textContent = String(r.n);
    $('#bt-m').value = r.masse; $('#bt-m-v').textContent = `${milliers(r.masse)} t`;
    $('#bt-k').value = Math.log10(r.k); $('#bt-k-v').textContent = `${milliers(r.k)} MN/m`;
    $('#bt-ag').value = r.ag; $('#bt-ag-v').textContent = `${virg(r.ag, 2)} g`;
    $('#bt-q').value = r.q; $('#bt-q-v').textContent = virg(r.q, 1);
    $$('[data-bt-sol]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.btSol === r.sol)));
    $$('[data-bt-type]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.btType === r.type)));
    $$('[data-bt-forme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.btForme === r.forme)));
    $$('[data-bt-limite]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.btLimite === r.limite)));
    $$('[data-bt-nu]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.btNu === r.nu)));
  }
  function tout() {
    if (!COUL.paper || !etat.res) return;
    majControles(); majAfficheurs(); majTables(); majRegles();
    $('#bt-ec8').hidden = enExercice();
    dessiner();
  }
  function dessiner() { dessinerModes(); dessinerSpectre(); dessinerEfforts(); dessinerTemps(); }
  function recalculer() { calculer(); tout(); }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 60); };

  // ── Exercice : forces latérales et analyse modale d'un bâtiment tiré au hasard ──
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 47);
    const profils = Object.keys(PROFILS), sols = ['A', 'B', 'C', 'D'];
    const r = { ...reglagesDefaut(), profil: profils[Math.floor(u() * profils.length)], n: 3 + Math.floor(u() * 6), masse: 50 * Math.round(u.entre(200, 500) / 50),
      sol: sols[Math.floor(u() * sols.length)], ag: Math.round(u.entre(0.1, 0.35) * 100) / 100, q: Math.round(u.entre(1.5, 4) * 10) / 10, graine: numero };
    // rigidité choisie pour une période fondamentale entre 0,25 et 1,8 s
    const T1 = Math.exp(u.entre(Math.log(0.25), Math.log(1.8))), T1ref = B.modes(batiment({ ...r, k: 1000 }))[0].T;
    r.k = Math.max(20, 10 * Math.round((1000 * (T1ref / T1) ** 2) / 10));
    etat.r = r; etat.exo = { numero }; etat.verifie = false; etat.rep = {};
    $('#bt-exo-num').textContent = 'Exercice n° ' + numero;
    $('#bt-r-fb').value = ''; $('#bt-r-n').value = ''; $('#bt-r-vb').value = '';
    $$('[data-bt-rep]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#bt-corrige').innerHTML = '';
    recalculer();
    const res = etat.res;
    $('#bt-exo-donnees').innerHTML = `<div class="table-defile"><table class="resultats"><tbody>
      ${[['Bâtiment', `${PROFILS[r.profil].nom}, ${r.n} étages de ${virg(HAUTEUR, 0)} m`], ['Masses', `${res.bat.m.map(x => milliers(x)).join(' · ')} t`], ['Spectre', `type ${r.type}, sol ${r.sol}, ag = ${virg(r.ag, 2)} g`], ['q', virg(r.q, 1)]]
        .map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function verifier() {
    const res = etat.res, lu = id => parseFloat(String($(id).value).replace(',', '.').replace(/\s/g, ''));
    const fb = lu('#bt-r-fb'), n = lu('#bt-r-n'), vb = lu('#bt-r-vb'), vrai = res.retenue.V[0], permis = res.permis && res.regulier;
    const okA = etat.rep.permis === (permis ? 'oui' : 'non'), okF = Math.abs(fb / res.fl.Fb - 1) <= 0.03, okN = n === res.ret.n, okV = Math.abs(vb / vrai - 1) <= 0.05;
    etat.verifie = true;
    const lignes = [
      ['Forces latérales applicables ?', etat.rep.permis || '—', permis ? 'oui' : 'non', okA, `régularité et T1 ≤ min(4·TC ; 2 s) = ${virg(Math.min(4 * res.TC, 2), 2)} s`],
      ['Fb (kN)', Number.isFinite(fb) ? milliers(fb) : '—', milliers(res.fl.Fb), okF, `± 3 % : Sd(T1) = ${virg(res.Sd(res.T1) / G, 3)} g, λ = ${virg(res.fl.lambda, 2)}`],
      ['Modes à retenir', Number.isFinite(n) ? String(n) : '—', String(res.ret.n), okN, '≥ 90 % de la masse et tous les modes de plus de 5 %'],
      ['Vb modal (kN)', Number.isFinite(vb) ? milliers(vb) : '—', milliers(vrai), okV, `± 5 % : ${res.regle.toUpperCase()} des meff·Sd(Tj) des modes retenus`],
    ];
    $('#bt-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([t, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${t}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 4 justes</p>
      <p class="verite">L'effort à la base d'un mode vaut sa masse effective fois Sd(Tj) ; la méthode des forces latérales prend toute la masse
      (λ = 0,85 corrige la part des modes supérieurs) et donne en général un effort un peu plus fort que l'analyse modale.</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#bt-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#bt-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#bt-panneau-explorer').hidden = m !== 'explorer';
    $('#bt-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; recalculer(); }
  }

  // ── Événements ──────────────────────────────────────────────────────────
  function brancher() {
    $$('[data-bt-profil]').forEach(b => b.addEventListener('click', () => { etat.r.profil = b.dataset.btProfil; recalculer(); }));
    $('#bt-n').addEventListener('input', e => { etat.r.n = parseInt(e.target.value, 10); majControles(); planifier(); });
    $('#bt-m').addEventListener('input', e => { etat.r.masse = parseFloat(e.target.value); majControles(); planifier(); });
    $('#bt-k').addEventListener('input', e => { const v = Math.pow(10, parseFloat(e.target.value)); etat.r.k = v < 200 ? 5 * Math.round(v / 5) : 10 * Math.round(v / 10); majControles(); planifier(); });
    $('#bt-ag').addEventListener('input', e => { etat.r.ag = parseFloat(e.target.value); majControles(); planifier(); });
    $('#bt-q').addEventListener('input', e => { etat.r.q = parseFloat(e.target.value); majControles(); planifier(); });
    $$('[data-bt-sol]').forEach(b => b.addEventListener('click', () => { etat.r.sol = b.dataset.btSol; recalculer(); }));
    $$('[data-bt-type]').forEach(b => b.addEventListener('click', () => { etat.r.type = +b.dataset.btType; recalculer(); }));
    $$('[data-bt-forme]').forEach(b => b.addEventListener('click', () => { etat.r.forme = b.dataset.btForme; recalculer(); }));
    $$('[data-bt-limite]').forEach(b => b.addEventListener('click', () => { etat.r.limite = b.dataset.btLimite; recalculer(); }));
    $$('[data-bt-nu]').forEach(b => b.addEventListener('click', () => { etat.r.nu = +b.dataset.btNu; recalculer(); }));
    $('#bt-tirage').addEventListener('click', () => { etat.r.graine = 1 + Math.floor(Math.random() * 1e6); recalculer(); });
    $('#bt-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#bt-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $$('[data-bt-rep]').forEach(b => b.addEventListener('click', () => {
      const [q, v] = b.dataset.btRep.split('|');
      etat.rep[q] = v;
      $$(`[data-bt-rep^="${q}|"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('#bt-verifier').addEventListener('click', verifier);
    $('#bt-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-batiment').hidden) { lireCouleurs(); dessiner(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#bt-modes', '#bt-spectre', '#bt-efforts', '#bt-temps']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'batiment') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); majControles(); setTimeout(recalculer, 30); }
    else tout();
  });
})();
