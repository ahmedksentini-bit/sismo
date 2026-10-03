import Spectre from './sismo/spectre.js';
import Sismo from './sismo/signal.js';
import Accelero from './sismo/accelerogramme.js';
import Batiment from './sismo/batiment.js';
import Poussee from './sismo/poussee.js';

// src/banc-poussee.js — banc « poussée progressive » : bâtiment en console de cisaillement dimensionné à l'EN 1998-1:2004
// (résistances d'étage = surrésistance × efforts de l'analyse modale), courbes de capacité sous les profils modal et
// uniforme, méthode N2 de l'annexe B en format accélération–déplacement, glissements d'étage au déplacement cible
// face à sept calculs temporels non linéaires. Calcul dans src/sismo/poussee.js (vérifié contre OpenSeesPy).
(() => {
  'use strict';
  const Sp = Spectre, B = Batiment, P = Poussee, G = Sp.G;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => (Number.isFinite(x) ? String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace(/^-/, '−') : '—');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const cm = x => virg(100 * x, 100 * Math.abs(x) < 10 ? 2 : 1);

  const HAUTEUR = 3, NB_ACC = 7, SCENARIOS = { 1: { M: 7, R: 10 }, 2: { M: 6, R: 5 } };
  const PROFILS = {
    ec8: { nom: 'Dimensionné EC8', regulier: true },
    faible: { nom: 'Rez souple et faible', regulier: false },
    toiture: { nom: 'Toiture lourde', regulier: false },
  };
  const reglagesDefaut = () => ({ profil: 'ec8', n: 5, masse: 300, k: 400, ag: 0.3, sol: 'B', type: 1, q: 3, omega: 1.5, vue: 'modal', graine: 900 });
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), res: null, temps: null, jeton: null, vu: 0, exo: null, verifie: false, rep: {} };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  // ── Calcul ──────────────────────────────────────────────────────────────
  function batiment(r = etat.r) {
    const n = r.n, idx = Array.from({ length: n }, (_, i) => i);
    const b = {
      m: idx.map(i => r.masse * (r.profil === 'toiture' && i === n - 1 && n > 1 ? 2.5 : 1)),
      k: idx.map(i => r.k * 1000 * (r.profil === 'faible' && i === 0 ? 0.5 : 1)),
      h: idx.map(() => HAUTEUR),
    };
    const Sd = T => Sp.ec8Calcul(T, { type: r.type, sol: r.sol, ag: r.ag, q: r.q }) * G;
    b.Vy = P.resistances(b, Sd, { omega: r.omega }).map((v, i) => (r.profil === 'faible' && i === 0 ? 0.6 : 1) * v);
    b.alpha = 0;
    return b;
  }
  function calculer() {
    const r = etat.r, bat = batiment(), md = B.modes(bat), sp = { type: r.type, sol: r.sol, ag: r.ag };
    const { TC } = Sp.EC8_2004[r.type][r.sol], se = T => Sp.ec8(T, sp) * G;
    const modal = P.n2(bat, md[0].phi, { se, TC }), uniforme = P.n2(bat, bat.m.map(() => 1), { se, TC });
    etat.res = { bat, md, sp, TC, se, modal, uniforme, H: HAUTEUR * r.n, M: bat.m.reduce((a, b) => a + b, 0) };
    lancerTemporels();
  }
  // Calculs temporels non linéaires, un accélérogramme à la fois (l'interface reste fluide)
  function lancerTemporels() {
    const r = etat.r, res = etat.res, jeton = {}, sc = SCENARIOS[r.type], T1 = res.md[0].T, liste = [];
    etat.jeton = jeton; etat.temps = null;
    const suivant = () => {
      if (etat.jeton !== jeton) return;
      const i = liste.length, x = Accelero.simuler({ M: sc.M, R: sc.R, graine: r.graine + 31 * i });
      const s = res.se(T1) / Sp.reponse(x.acc, x.dt, [T1], 0.05).Sa[0], acc = Float64Array.from(x.acc, v => v * s);
      const t = P.temporel(res.bat, acc, x.dt);
      let toitMax = 0;
      for (const v of t.toit) toitMax = Math.max(toitMax, Math.abs(v));
      liste.push({ s, dt: x.dt, toit: t.toit, base: t.base, toitMax, dMax: t.dMax, mu: t.mu, fBase: Math.max(...Array.from(t.base, Math.abs)) });
      $('#pp-etat').textContent = liste.length < NB_ACC ? `calculs temporels : ${liste.length} / ${NB_ACC}` : '';
      if (liste.length < NB_ACC) setTimeout(suivant, 0);
      else { etat.temps = liste; etat.vu = Math.min(etat.vu, NB_ACC - 1); tout(); }
    };
    $('#pp-etat').textContent = `calculs temporels : 0 / ${NB_ACC}`;
    setTimeout(suivant, 0);
  }
  const moyenneTemps = () => {
    const t = etat.temps, n = t.length;
    return { toit: t.reduce((a, x) => a + x.toitMax, 0) / n, d: t[0].dMax.map((_, i) => t.reduce((a, x) => a + x.dMax[i], 0) / n), base: t.reduce((a, x) => a + x.fBase, 0) / n };
  };

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
  function axes(ctx, X, Y, x0, x1, y0, y1, { fx = v => virg(v, 1), fy = v => virg(v, 2), nx = 5, ny = 5 } = {}) {
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    const px = pas(x1 - x0, nx), py = pas(y1 - y0, ny);
    for (let v = Math.ceil(x0 / px - 1e-9) * px; v <= x1 + 1e-9; v += px) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, Y(y1)); ctx.lineTo(x, Y(y0)); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(fx(v), x, Y(y0) + 5); }
    for (let v = Math.ceil(y0 / py - 1e-9) * py; v <= y1 + 1e-9; v += py) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(X(x0), y); ctx.lineTo(X(x1), y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fy(v), X(x0) - 6, y); }
  }
  const triangle = (ctx, x, y, coul) => { ctx.fillStyle = coul; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 11); ctx.lineTo(x + 6, y - 11); ctx.closePath(); ctx.fill(); ctx.stroke(); };

  // Courbes de capacité (effort à la base – déplacement en tête), cibles N2 et calculs temporels
  function dessinerCapacite() {
    const cv = $('#pp-capacite');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, c = enExercice(), m = { g: 56, d: 14, h: 34, b: 30 };
    const pts = etat.temps || [];
    const xmax = 100 * Math.max(1.6 * res.modal.dt, 1.6 * res.uniforme.dt, ...pts.map(t => t.toitMax * 1.1), 3 * res.modal.cap.dy);
    const ymax = Math.max(res.modal.cap.Fb, res.uniforme.cap.Fb, ...pts.map(t => t.fBase)) * 1.2;
    const X = v => m.g + (v / xmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    axes(ctx, X, Y, 0, xmax, 0, ymax, { fx: v => virg(v, xmax < 5 ? 1 : 0), fy: v => milliers(v), ny: 5 });
    for (const [n2, coul, tirets] of [[res.uniforme, COUL.teal, [7, 4]], [res.modal, COUL.blue, []]]) {
      ctx.strokeStyle = coul; ctx.lineWidth = 2.4; ctx.setLineDash(tirets); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(100 * n2.cap.dy), Y(n2.cap.Fb)); ctx.lineTo(X(xmax), Y(n2.cap.Fb)); ctx.stroke(); ctx.setLineDash([]);
      if (!c) {
        triangle(ctx, X(100 * n2.dt), Y(n2.cap.Fb) - 4, coul);
        ctx.strokeStyle = coul; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(150 * n2.dt), Y(n2.cap.Fb) - 18); ctx.lineTo(X(150 * n2.dt), Y(0)); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    pts.forEach((t, i) => { ctx.fillStyle = i === etat.vu ? COUL.cyan : COUL.muted; ctx.beginPath(); ctx.arc(X(100 * t.toitMax), Y(t.fBase), i === etat.vu ? 5 : 3.5, 0, 2 * Math.PI); ctx.fill(); });
    if (etat.temps) {
      const mo = moyenneTemps(), x = X(100 * mo.toit), y = Y(mo.base);
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
    }
    texte(ctx, 'effort à la base (kN) — déplacement en tête (cm)', m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // Méthode N2 en format accélération–déplacement pour le profil affiché
  function dessinerAdrs() {
    const cv = $('#pp-adrs');
    if (cv.clientWidth < 50 || !etat.res) return;
    if (enExercice()) return message(cv, 'masqué pendant l\'exercice');
    const { ctx, W, H } = preparer(cv), res = etat.res, n = res[etat.r.vue], m = { g: 50, d: 14, h: 34, b: 30 };
    const sd = T => res.se(T) * (T / (2 * Math.PI)) ** 2, Tmax = 4;
    const xmax = 100 * Math.max(n.dtEtoile * 1.6, n.de * 1.2, n.dy * 2.5, 0.01), ymax = (res.se(res.TC) / G) * 1.15;
    const X = v => m.g + (v / xmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    axes(ctx, X, Y, 0, xmax, 0, ymax, { fx: v => virg(v, xmax < 5 ? 1 : 0), fy: v => virg(v, 2) });
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.b - m.h); ctx.clip();
    // spectre élastique
    ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 400; i++) { const T = 0.01 + (i / 400) * Tmax; (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(100 * sd(T)), Y(res.se(T) / G)); }
    ctx.stroke();
    // droite de période T* et capacité du système équivalent
    const sa = n.Fy / n.mEtoile / G;
    ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(100 * n.de), Y(n.se / G)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(100 * n.dy), Y(sa)); ctx.lineTo(X(xmax), Y(sa)); ctx.stroke();
    ctx.fillStyle = COUL.teal; ctx.beginPath(); ctx.arc(X(100 * n.de), Y(n.se / G), 4.5, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
    triangle(ctx, X(100 * n.dtEtoile), Y(sa) - 4, COUL['pick-p']);
    texte(ctx, `T* = ${virg(n.T, 2)} s`, X(100 * n.de) + 8, Y(n.se / G) - 8, COUL.muted, `700 10.5px ${MONO}`);
    texte(ctx, `d*t = ${cm(n.dtEtoile)} cm`, X(100 * n.dtEtoile), Y(sa) - 24, COUL['pick-p'], `700 10.5px ${MONO}`, 'center');
    texte(ctx, `Sa (g) — Sd (cm) · profil ${etat.r.vue}`, m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // Glissements d'étage : poussée au déplacement cible et calculs temporels
  function dessinerDerives() {
    const cv = $('#pp-derives');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, c = enExercice(), m = { g: 44, d: 14, h: 34, b: 30 }, z = B.cotes(res.bat.h);
    const ratio = d => d.map((x, i) => (100 * x) / res.bat.h[i]);
    const series = [];
    if (!c) series.push([ratio(res.uniforme.glissements), COUL.teal, 2.2, [7, 4]], [ratio(res.modal.glissements), COUL.blue, 2.4]);
    const t = etat.temps || [];
    const xmax = Math.max(0.2, ...series.flatMap(s => s[0]), ...t.flatMap(x => ratio(x.dMax))) * 1.1;
    const X = v => m.g + (v / xmax) * (W - m.g - m.d), Y = v => H - m.b - (v / res.H) * (H - m.h - m.b);
    axes(ctx, X, Y, 0, xmax, 0, res.H, { fx: v => virg(v, xmax < 1 ? 2 : 1), fy: v => virg(v, 0) });
    // glissement de plastification de chaque étage
    const dy = res.bat.Vy.map((v, i) => (100 * v) / res.bat.k[i] / res.bat.h[i]);
    const marche = (vals, coul, w, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      vals.forEach((v, i) => { (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(v), Y(i ? z[i - 1] : 0)); ctx.lineTo(X(v), Y(z[i])); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    marche(dy, COUL['grid-strong'], 1.4, [2, 3]);
    ctx.globalAlpha = 0.5; t.forEach((x, i) => { if (i !== etat.vu) marche(ratio(x.dMax), COUL.muted, 1); }); ctx.globalAlpha = 1;
    if (t.length) { marche(ratio(t[etat.vu].dMax), COUL.cyan, 1.6); marche(ratio(moyenneTemps().d), COUL['pick-p'], 2.4); }
    for (const [v, coul, w, tirets] of series) marche(v, coul, w, tirets);
    texte(ctx, 'glissement d\'étage / h (%) — hauteur z (m)', m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // Déplacement en tête au cours du temps
  function dessinerTemps() {
    const cv = $('#pp-temps');
    if (cv.clientWidth < 50 || !etat.res) return;
    if (!etat.temps) return message(cv, 'calculs temporels en cours…');
    const { ctx, W, H } = preparer(cv), t = etat.temps[etat.vu], res = etat.res, m = { g: 50, d: 14, h: 34, b: 28 }, n = t.toit.length, duree = (n - 1) * t.dt;
    const ymax = 100 * Math.max(t.toitMax, enExercice() ? 0 : res.modal.dt) * 1.15;
    const X = s => m.g + (s / duree) * (W - m.g - m.d), Y = v => m.h + ((H - m.h - m.b) / 2) * (1 - v / ymax);
    axes(ctx, X, v => (v === -ymax ? H - m.b : Y(v)), 0, duree, -ymax, ymax, { fx: v => virg(v, 0), fy: v => virg(v, ymax < 5 ? 1 : 0), ny: 4 });
    if (!enExercice()) {
      ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(m.g, Y(s * 100 * res.modal.dt)); ctx.lineTo(W - m.d, Y(s * 100 * res.modal.dt)); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1.2; ctx.beginPath();
    const saut = Math.max(1, Math.floor(n / (2 * (W - m.g - m.d))));
    for (let i = 0; i < n; i += saut) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i * t.dt), Y(100 * t.toit[i]));
    ctx.stroke();
    texte(ctx, `n° ${etat.vu + 1} · ×${virg(t.s, 2)} · max ${cm(t.toitMax)} cm · résiduel ${cm(Math.abs(t.toit[n - 1]))} cm`, m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const res = etat.res, n = res.modal, c = enExercice(), mo = etat.temps ? moyenneTemps() : null;
    $('#pp-afficheurs').innerHTML = [
      afficheur('T1', `${virg(res.md[0].T, 2)} s`, `${res.bat.m.length} étages, ${milliers(res.M)} t`),
      afficheur('Γ (modal)', c ? '—' : virg(n.gamma, 3), c ? 'à calculer' : `m* = ${milliers(n.mEtoile)} t`),
      afficheur('T*', c ? '—' : `${virg(n.T, 2)} s`, c ? 'à calculer' : `F*y/m* = ${virg(n.Fy / n.mEtoile / G, 3)} g`),
      afficheur('dt modal · uniforme', c ? '—' : `${cm(n.dt)} · ${cm(res.uniforme.dt)} cm`, c ? 'à calculer' : `${n.regle}, qu = ${virg(n.qu, 2)}`),
      afficheur('Temporels : toit', mo ? `${cm(mo.toit)} cm` : '…', mo ? `moyenne de ${NB_ACC}` : 'en cours'),
      afficheur('N2 / temporel', c || !mo ? '—' : virg(n.dt / mo.toit, 2), 'déplacement en tête, profil modal'),
    ].join('');
  }
  function majTables() {
    const res = etat.res, c = enExercice(), etage = n => `étage ${n.cap.critique + 1}`;
    const lignes = [
      ['m* (t)', n => milliers(n.mEtoile)], ['Γ', n => virg(n.gamma, 3)], ['Fb au mécanisme (kN)', n => milliers(n.cap.Fb)], ['F*y (kN)', n => milliers(n.Fy)],
      ['d*y (cm)', n => cm(n.dy)], ['T* (s)', n => virg(n.T, 3)], ['Se(T*) (g)', n => virg(n.se / G, 3)], ['qu', n => virg(n.qu, 2)],
      ['d*t (cm)', n => cm(n.dtEtoile)], ['dt = Γ·d*t (cm)', n => cm(n.dt)], ['Mécanisme', etage],
    ];
    $('#pp-n2-table').innerHTML = c ? '<tbody><tr><td>masqué pendant l\'exercice</td></tr></tbody>'
      : `<thead><tr><th>Annexe B</th><th>modal</th><th>uniforme</th></tr></thead><tbody>${lignes.map(([t, f]) => `<tr><td>${t}</td><td class="n">${f(res.modal)}</td><td class="n">${f(res.uniforme)}</td></tr>`).join('')}</tbody>`;
    const t = etat.temps;
    if (!t) { $('#pp-temps-table').innerHTML = '<tbody><tr><td>calculs en cours…</td></tr></tbody>'; $('#pp-temps-info').textContent = ''; return; }
    $('#pp-temps-table').innerHTML = `<thead><tr><th>n°</th><th>facteur</th><th>toit (cm)</th><th>glissement max (%)</th><th>ductilité max</th></tr></thead><tbody>${t.map((x, i) => {
      const r = x.dMax.map((d, j) => d / res.bat.h[j]), j = r.indexOf(Math.max(...r));
      return `<tr class="${i === etat.vu ? 'vu' : ''}" data-pp-vu="${i}" tabindex="0"><td class="n">${i + 1}</td><td class="n">×${virg(x.s, 2)}</td><td class="n">${cm(x.toitMax)}</td><td class="n">${virg(100 * r[j], 2)} (ét. ${j + 1})</td><td class="n">${virg(Math.max(...x.mu), 2)}</td></tr>`;
    }).join('')}</tbody>`;
    $$('[data-pp-vu]').forEach(tr => {
      const choisir = () => { etat.vu = +tr.dataset.ppVu; majTables(); dessinerCapacite(); dessinerDerives(); dessinerTemps(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    });
    const mo = moyenneTemps(), jm = mo.d.map((d, j) => d / res.bat.h[j]), jx = jm.indexOf(Math.max(...jm));
    $('#pp-temps-info').textContent = `Moyenne : toit ${cm(mo.toit)} cm, glissement maximal à l'étage ${jx + 1} (${virg(100 * jm[jx], 2)} %). Accélérogrammes calés sur Se(T1).`;
  }
  function majControles() {
    const r = etat.r;
    $$('[data-pp-profil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ppProfil === r.profil)));
    $('#pp-n').value = r.n; $('#pp-n-v').textContent = String(r.n);
    $('#pp-m').value = r.masse; $('#pp-m-v').textContent = `${milliers(r.masse)} t`;
    $('#pp-k').value = Math.log10(r.k); $('#pp-k-v').textContent = `${milliers(r.k)} MN/m`;
    $('#pp-ag').value = r.ag; $('#pp-ag-v').textContent = `${virg(r.ag, 2)} g`;
    $('#pp-q').value = r.q; $('#pp-q-v').textContent = virg(r.q, 1);
    $('#pp-omega').value = r.omega; $('#pp-omega-v').textContent = virg(r.omega, 2);
    $$('[data-pp-sol]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ppSol === r.sol)));
    $$('[data-pp-type]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.ppType === r.type)));
    $$('[data-pp-vue]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ppVue === r.vue)));
  }
  function tout() {
    if (!COUL.paper || !etat.res) return;
    majControles(); majAfficheurs(); majTables();
    dessiner();
  }
  function dessiner() { dessinerCapacite(); dessinerAdrs(); dessinerDerives(); dessinerTemps(); }
  function recalculer() { calculer(); tout(); }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 120); };

  // ── Exercice : méthode N2 à partir de la courbe de capacité modale ────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 53);
    const profils = Object.keys(PROFILS), sols = ['A', 'B', 'C', 'D'];
    const r = { ...reglagesDefaut(), profil: profils[Math.floor(u() * profils.length)], n: 2 + Math.floor(u() * 5), masse: 50 * Math.round(u.entre(200, 450) / 50),
      sol: sols[Math.floor(u() * sols.length)], ag: Math.round(u.entre(0.15, 0.4) * 100) / 100, q: Math.round(u.entre(1.5, 4) * 10) / 10, omega: Math.round(u.entre(1.1, 1.8) * 10) / 10, graine: numero };
    const T1 = Math.exp(u.entre(Math.log(0.2), Math.log(1.2))), T1ref = B.modes(batiment({ ...r, k: 1000 }))[0].T;
    r.k = Math.max(20, 10 * Math.round((1000 * (T1ref / T1) ** 2) / 10));
    etat.r = r; etat.exo = { numero }; etat.verifie = false; etat.rep = {};
    $('#pp-exo-num').textContent = 'Exercice n° ' + numero;
    for (const id of ['#pp-r-gamma', '#pp-r-t', '#pp-r-dt']) $(id).value = '';
    $$('[data-pp-rep]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#pp-corrige').innerHTML = '';
    recalculer();
    const res = etat.res, n = res.modal;
    $('#pp-exo-donnees').innerHTML = `<div class="table-defile"><table class="resultats"><thead><tr><th>Niveau</th><th>m (t)</th><th>Φ</th></tr></thead><tbody>
      ${res.bat.m.map((x, i) => `<tr><td class="n">${i + 1}</td><td class="n">${milliers(x)}</td><td class="n">${virg(res.md[0].phi[i], 3)}</td></tr>`).reverse().join('')}</tbody></table></div>
      <p class="aide">Courbe de capacité, profil modal Fi = mi·Φi : élastique jusqu'à <b>Fb = ${milliers(n.cap.Fb)} kN</b> pour <b>dn = ${cm(n.cap.dy)} cm</b> au sommet, puis palier (mécanisme).
      Spectre élastique de type ${r.type}, sol ${r.sol}, ag = ${virg(r.ag, 2)} g (ξ = 5 %).</p>`;
  }
  function verifier() {
    const n = etat.res.modal, lu = id => parseFloat(String($(id).value).replace(',', '.').replace(/\s/g, ''));
    const g = lu('#pp-r-gamma'), T = lu('#pp-r-t'), d = lu('#pp-r-dt');
    const okG = Math.abs(g / n.gamma - 1) <= 0.01, okT = Math.abs(T / n.T - 1) <= 0.02, okD = Math.abs(d / (100 * n.dt) - 1) <= 0.05, okR = etat.rep.regle === n.regle;
    etat.verifie = true;
    const lignes = [
      ['Γ', Number.isFinite(g) ? virg(g, 3) : '—', virg(n.gamma, 3), okG, `± 1 % : m*/Σ mi·Φi², m* = ${milliers(n.mEtoile)} t`],
      ['T* (s)', Number.isFinite(T) ? virg(T, 3) : '—', virg(n.T, 3), okT, `± 2 % : 2π·√(m*·d*y/F*y), F*y = ${milliers(n.Fy)} kN, d*y = ${cm(n.dy)} cm`],
      ['dt (cm)', Number.isFinite(d) ? virg(d, 2) : '—', cm(n.dt), okD, `± 5 % : Γ·d*t, Se(T*) = ${virg(n.se / G, 3)} g, qu = ${virg(n.qu, 2)}`],
      ['Règle', etat.rep.regle || '—', n.regle, okR, 'T* ≥ TC : égaux déplacements ; T* < TC : (d*e/qu)(1 + (qu − 1)TC/T*)'],
    ];
    $('#pp-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([t, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${t}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 4 justes</p>
      <p class="verite">Comparez maintenant le déplacement cible aux calculs temporels non linéaires : la méthode N2 donne l'ordre de grandeur du
      déplacement en tête, mais pas toujours l'étage où se concentrent les glissements.</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#pp-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#pp-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#pp-panneau-explorer').hidden = m !== 'explorer';
    $('#pp-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; recalculer(); }
  }

  // ── Événements ──────────────────────────────────────────────────────────
  function brancher() {
    $$('[data-pp-profil]').forEach(b => b.addEventListener('click', () => { etat.r.profil = b.dataset.ppProfil; recalculer(); }));
    $('#pp-n').addEventListener('input', e => { etat.r.n = parseInt(e.target.value, 10); majControles(); planifier(); });
    $('#pp-m').addEventListener('input', e => { etat.r.masse = parseFloat(e.target.value); majControles(); planifier(); });
    $('#pp-k').addEventListener('input', e => { const v = Math.pow(10, parseFloat(e.target.value)); etat.r.k = v < 200 ? 5 * Math.round(v / 5) : 10 * Math.round(v / 10); majControles(); planifier(); });
    $('#pp-ag').addEventListener('input', e => { etat.r.ag = parseFloat(e.target.value); majControles(); planifier(); });
    $('#pp-q').addEventListener('input', e => { etat.r.q = parseFloat(e.target.value); majControles(); planifier(); });
    $('#pp-omega').addEventListener('input', e => { etat.r.omega = parseFloat(e.target.value); majControles(); planifier(); });
    $$('[data-pp-sol]').forEach(b => b.addEventListener('click', () => { etat.r.sol = b.dataset.ppSol; recalculer(); }));
    $$('[data-pp-type]').forEach(b => b.addEventListener('click', () => { etat.r.type = +b.dataset.ppType; recalculer(); }));
    $$('[data-pp-vue]').forEach(b => b.addEventListener('click', () => { etat.r.vue = b.dataset.ppVue; majControles(); dessinerAdrs(); }));
    $('#pp-tirage').addEventListener('click', () => { etat.r.graine = 1 + Math.floor(Math.random() * 1e6); recalculer(); });
    $('#pp-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#pp-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $$('[data-pp-rep]').forEach(b => b.addEventListener('click', () => { etat.rep.regle = b.dataset.ppRep; $$('[data-pp-rep]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $('#pp-verifier').addEventListener('click', verifier);
    $('#pp-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-poussee').hidden) { lireCouleurs(); dessiner(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#pp-capacite', '#pp-adrs', '#pp-derives', '#pp-temps']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'poussee') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); majControles(); setTimeout(recalculer, 30); }
    else tout();
  });
})();
