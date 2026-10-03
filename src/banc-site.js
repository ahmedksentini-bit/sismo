import Spectre from './sismo/spectre.js';
import Sismo from './sismo/signal.js';
import Accelero from './sismo/accelerogramme.js';
import Site from './sismo/site.js';

// src/banc-site.js — banc « site » : un accélérogramme au rocher traverse une colonne de sol (ondes SH
// verticales), en linéaire ou en linéaire équivalent (courbes de Darendeli) ; fonction de transfert,
// spectres en surface face aux spectres de l'EN 1998-1:2004, profils de rigidité et de déformation.
// Tout le calcul est dans src/sismo/site.js (vérifié contre pystrata).
(() => {
  'use strict';
  const Sp = Spectre;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const g3 = x => (x >= 1 ? virg(x, 2) : x >= 0.1 ? virg(x, 3) : virg(x, 4));

  // Poids volumique (kN/m³) déduit de Vs, ordre de grandeur des sols courants
  const poids = vs => (vs < 200 ? 17.5 : vs < 300 ? 18.5 : vs < 450 ? 19.5 : 20.5);
  const PROFILS = {
    ecole: { nom: 'Profil d\'école', couches: [[4, 160, 30], [8, 220, 15], [12, 320, 0], [10, 450, 0]], rocher: 1200 },
    argile: { nom: 'Argile molle', couches: [[6, 110, 40], [14, 150, 30], [10, 250, 10]], rocher: 900 },
    alluvions: { nom: 'Alluvions minces', couches: [[3, 150, 15], [9, 260, 0]], rocher: 1100 },
    sable: { nom: 'Sable dense', couches: [[10, 300, 0], [20, 450, 0], [15, 600, 0]], rocher: 1500 },
  };
  const SCENARIOS = [{ M: 5.5, R: 10 }, { M: 6.5, R: 20 }, { M: 7.2, R: 40 }];
  const TS = Sp.periodes(40, 0.02, 3);
  const profil = id => ({ couches: PROFILS[id].couches.map(([h, vs, ip]) => ({ h, vs, ip, poids: poids(vs) })), rocher: { vs: PROFILS[id].rocher, poids: 22, xi: 0.01 } });
  const reglagesDefaut = () => ({ profil: 'ecole', ...profil('ecole'), scenario: 1, pga: 0.25, graine: 271828, calcul: 'eql', couche: 0 });
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), res: null, exo: null, verifie: false, rep: {} };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  // ── Calcul ──────────────────────────────────────────────────────────────
  function mouvement() {
    const s = SCENARIOS[etat.r.scenario], rec = Accelero.simuler({ M: s.M, R: s.R, graine: etat.r.graine });
    let p = 0;
    for (const v of rec.acc) p = Math.max(p, Math.abs(v));
    // en g, mis au PGA choisi, suivi de 10 s de repos (le sol finit de vibrer)
    const acc = new Float64Array(rec.acc.length + Math.round(10 / rec.dt));
    for (let i = 0; i < rec.acc.length; i++) acc[i] = (rec.acc[i] / p) * etat.r.pga;
    return { acc, dt: rec.dt, M: s.M };
  }
  function calculer() {
    const t0 = performance.now(), r = etat.r, mv = mouvement(), col = Site.colonne(r.couches, r.rocher);
    const lin = Site.calculer(col, mv.acc, mv.dt, { lineaire: true });
    const eql = r.calcul === 'eql' ? Site.calculer(col, mv.acc, mv.dt, { tolerance: 1e-3, iterMax: 30 }) : lin;
    const sa = a => Array.from(Sp.reponse(Float64Array.from(a, v => v * Site.GRAV), mv.dt, TS, 0.05).Sa, v => v / Site.GRAV);
    const pic = a => a.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
    const cl = Site.classeEC8(r.couches, r.rocher);
    // fréquence du premier pic de la fonction de transfert linéaire
    let kPic = 1;
    for (let k = 2; k < lin.H.length - 1; k++) { const a = Site.cabs(lin.H[k]); if (a > Site.cabs(lin.H[k - 1]) && a >= Site.cabs(lin.H[k + 1])) { kPic = k; break; } }
    etat.res = {
      mv, col, lin, eql, saRoc: sa(mv.acc), saSurf: sa(eql.surface), pgaRoc: pic(mv.acc), pgaSurf: pic(eql.surface),
      ...cl, f0: Site.frequenceQuartOnde(r.couches), fPic: kPic * lin.df, H: r.couches.reduce((s, c) => s + c.h, 0), duree: performance.now() - t0,
    };
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
  const graduationsLog = (a, b) => {
    const out = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) out.push(v); }
    return out;
  };
  const etiquette = v => (v >= 1 ? virg(v, 0) : virg(v, Math.max(0, -Math.floor(Math.log10(v) + 1e-9))));
  const pas = (max, n = 5) => [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(p => max / p <= n) || 1000;

  // Profils en profondeur : Vs initial et compatible, déformation γeff, G/G0
  function dessinerProfils() {
    const cv = $('#si-profils');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, r = etat.r, sc = res.col.couches, eq = res.eql.couches;
    const m = { h: 34, b: 26 }, Hmax = Math.ceil((res.H + 4) / 5) * 5, Y = z => m.h + (z / Hmax) * (H - m.h - m.b);
    const g = 40, larg = (W - g - 10) / 3, panneaux = [0, 1, 2].map(i => ({ x0: g + i * larg + (i ? 10 : 0), x1: g + (i + 1) * larg - 6 }));
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let z = 0; z <= Hmax; z += pas(Hmax, 6)) { const y = Math.round(Y(z)) + 0.5; ctx.beginPath(); ctx.moveTo(g, y); ctx.lineTo(W - 10, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(z), g - 6, y); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('z (m)', 4, H - m.b + 6);
    // couches d'origine en fond et rocher
    let z = 0;
    r.couches.forEach((c, i) => {
      ctx.fillStyle = COUL.soft; ctx.globalAlpha = i % 2 ? 0.55 : 0.25; ctx.fillRect(g, Y(z), W - 10 - g, Y(z + c.h) - Y(z)); ctx.globalAlpha = 1;
      if (i === r.couche && !enExercice()) { ctx.strokeStyle = COUL.cyan; ctx.lineWidth = 2; ctx.strokeRect(g + 1, Y(z) + 1, W - 12 - g, Y(z + c.h) - Y(z) - 2); }
      z += c.h;
    });
    ctx.fillStyle = COUL['grid-strong']; ctx.globalAlpha = 0.35; ctx.fillRect(g, Y(res.H), W - 10 - g, H - m.b - Y(res.H)); ctx.globalAlpha = 1;
    texte(ctx, `rocher · Vs ${milliers(r.rocher.vs)} m/s`, g + 6, Math.min(H - m.b - 8, Y(res.H) + 10), COUL.ink, `700 11px ${POLICE}`);
    // un panneau : valeurs par sous-couche, en marches
    const panneau = (p, titre, vals, vmax, coul, larg2 = 2.2, tirets = null, unite = '') => {
      const X = v => p.x0 + (v / vmax) * (p.x1 - p.x0);
      ctx.strokeStyle = coul; ctx.lineWidth = larg2; ctx.setLineDash(tirets || []); ctx.beginPath();
      let zz = 0;
      sc.forEach((c, i) => { const x = X(vals[i]); if (i === 0) ctx.moveTo(x, Y(0)); else ctx.lineTo(x, Y(zz)); ctx.lineTo(x, Y(zz + c.h)); zz += c.h; });
      ctx.stroke(); ctx.setLineDash([]);
      if (titre) texte(ctx, titre, p.x0, 13, COUL.ink, `800 12px ${POLICE}`);
      ctx.fillStyle = COUL.muted; ctx.font = `10.5px ${MONO}`; ctx.textBaseline = 'top';
      // graduations alignées dans le panneau : pas de chevauchement aux jointures
      [0, vmax / 2, vmax].forEach((v, j) => { ctx.textAlign = ['left', 'center', 'right'][j]; ctx.fillText(virg(v, vmax < 1 ? 2 : vmax < 10 ? 1 : 0) + unite, X(v), H - m.b + 6); });
    };
    const vsMax = Math.ceil(Math.max(...sc.map(c => c.vs)) * 1.15 / 100) * 100;
    panneau(panneaux[0], 'Vs (m/s)', sc.map(c => c.vs), vsMax, COUL.muted, 1.6, [5, 4]);
    panneau(panneaux[0], null, eq.map(c => c.vs), vsMax, COUL.blue, 2.4);
    const gMax = Math.max(...eq.map(c => 100 * c.gammaEff)) * 1.2 || 1e-3;
    panneau(panneaux[1], 'γeff (%)', eq.map(c => 100 * c.gammaEff), gMax, COUL['pick-p'], 2.4);
    panneau(panneaux[2], 'G/G0 et ξ', eq.map(c => c.GG0), 1, COUL.teal, 2.4);
    panneau(panneaux[2], null, eq.map(c => c.xi * 4), 1, COUL.amp, 1.8, [4, 3]);
    texte(ctx, 'ξ × 4', panneaux[2].x1 - 2, m.h + 10, COUL.amp, `700 10.5px ${MONO}`, 'right');
  }

  function dessinerTransfert() {
    const cv = $('#si-transfert');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, m = { g: 44, d: 14, h: 30, b: 30 }, f0 = 0.1, f1 = 25;
    const amp = h => h.map(Site.cabs), aL = amp(res.lin.H), aE = amp(res.eql.H), df = res.lin.df;
    const ymax = Math.max(...aL.slice(1), ...aE.slice(1)) * 1.12;
    const X = f => m.g + (Math.log(f / f0) / Math.log(f1 / f0)) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const f of graduationsLog(f0, f1)) { const x = Math.round(X(f)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(etiquette(f), x, H - m.b + 5); }
    for (let v = 0; v <= ymax; v += pas(ymax)) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, 0), m.g - 6, y); }
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    const courbe = (a, coul, w, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      let premier = true;
      for (let k = 1; k < a.length; k++) { const f = k * df; if (f < f0 || f > f1) continue; const x = X(f), y = Y(a[k]); if (premier) { ctx.moveTo(x, y); premier = false; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    courbe(aL, COUL['grid-strong'], 1.8, [6, 4]);
    if (etat.r.calcul === 'eql') courbe(aE, COUL.blue, 2.4);
    if (!enExercice()) {
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(res.f0), m.h + 16); ctx.lineTo(X(res.f0), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    texte(ctx, '|H(f)| = surface / affleurement du rocher', m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    if (!enExercice()) texte(ctx, `f0 ≈ Vs/4H = ${virg(res.f0, 2)} Hz`, X(res.f0) + 6, m.h + 10, COUL['pick-p'], `700 11px ${MONO}`);
    texte(ctx, 'fréquence (Hz)', W - m.d - 4, m.h + 9, COUL.muted, `10.5px ${MONO}`, 'right');
  }

  function dessinerSpectres() {
    const cv = $('#si-spectres');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, etroit = W < 600, m = { g: 50, d: 14, h: etroit ? 46 : 30, b: 30 }, Tmax = 3;
    // spectres de l'EN 1998-1:2004 de même ag : rocher (A) et classe du site
    const type = res.mv.M > 5.5 ? 1 : 2, ag = res.pgaRoc, classe = res.classe;
    const ec8 = (T, sol) => Sp.ec8(T, { type, sol, ag });
    const ymax = Math.max(...res.saSurf, ...res.saRoc, ...[0.1, 0.3, 0.6].map(T => ec8(T, classe))) * 1.1;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let T = 0; T <= Tmax + 1e-9; T += 0.5) { const x = Math.round(X(T)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(T, T % 1 ? 1 : 0), x, H - m.b + 5); }
    const p = pas(ymax);
    for (let v = 0; v <= ymax + 1e-9; v += p) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, p < 0.1 ? 2 : 1), m.g - 6, y); }
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    const analytique = (sol, coul) => {
      ctx.strokeStyle = coul; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]); ctx.beginPath();
      for (let i = 0; i <= 300; i++) { const T = (Tmax * i) / 300; (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(T), Y(ec8(T, sol))); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    analytique('A', COUL.teal);
    if (classe !== 'A' && !enExercice()) analytique(classe, COUL['pick-p']);
    const courbe = (v, coul, w) => { ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.beginPath(); TS.forEach((T, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, X(T), Y(v[k]))); ctx.stroke(); };
    courbe(res.saRoc, COUL['grid-strong'], 2);
    courbe(res.saSurf, COUL.blue, 2.6);
    ctx.restore();
    texte(ctx, `Sa (g), ξ = 5 % · spectres EC8 de type ${type}, ag = ${g3(ag)} g`, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    const k1 = TS.findIndex(T => T >= 0.2), k2 = TS.findIndex(T => T >= 1);
    const droite = `surface / rocher : ${virg(res.saSurf[k1] / res.saRoc[k1], 2)} à 0,2 s · ${virg(res.saSurf[k2] / res.saRoc[k2], 2)} à 1 s`;
    texte(ctx, droite, etroit ? m.g : W - m.d, etroit ? 31 : 14, COUL.blue, `800 12px ${POLICE}`, etroit ? 'left' : 'right');
    texte(ctx, 'période T (s)', W - m.d - 4, m.h + 9, COUL.muted, `10.5px ${MONO}`, 'right');
  }

  function dessinerAccelero() {
    const cv = $('#si-acc');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, m = { g: 50, d: 14, h: 22, b: 26 }, dt = res.mv.dt;
    const traces = [{ nom: 'rocher (affleurement)', a: res.mv.acc, coul: COUL.trace, pga: res.pgaRoc }, { nom: 'surface', a: res.eql.surface, coul: COUL.blue, pga: res.pgaSurf }];
    const amax = Math.max(res.pgaRoc, res.pgaSurf) * 1.1, duree = res.mv.acc.length * dt, hb = (H - m.h - m.b) / 2;
    const X = t => m.g + (t / duree) * (W - m.g - m.d);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    const pt = duree > 60 ? 10 : 5;
    for (let t = 0; t <= duree; t += pt) { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(t), x, H - m.b + 5); }
    traces.forEach((tr, j) => {
      const yc = m.h + hb * (j + 0.5), Y = v => yc - (v / amax) * (hb / 2) * 0.95;
      ctx.strokeStyle = COUL.grid; ctx.beginPath(); ctx.moveTo(m.g, yc); ctx.lineTo(W - m.d, yc); ctx.stroke();
      ctx.strokeStyle = tr.coul; ctx.lineWidth = 1; ctx.beginPath();
      const n = tr.a.length, paquet = Math.max(1, Math.floor(n / (2 * (W - m.g - m.d))));
      for (let i = 0; i < n; i += paquet) {
        let lo = tr.a[i], hi = tr.a[i];
        for (let k = i; k < Math.min(n, i + paquet); k++) { lo = Math.min(lo, tr.a[k]); hi = Math.max(hi, tr.a[k]); }
        if (i === 0) ctx.moveTo(X(i * dt), Y(lo)); else ctx.lineTo(X(i * dt), Y(lo));
        ctx.lineTo(X(i * dt), Y(hi));
      }
      ctx.stroke();
      texte(ctx, `${tr.nom} · PGA ${g3(tr.pga)} g`, m.g + 4, yc - hb / 2 + 10, tr.coul, `700 11px ${MONO}`);
    });
    ctx.fillStyle = COUL.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('temps (s)', W - m.d - 4, H - m.b - 3);
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const res = etat.res, cache = enExercice();
    if (!res) return;
    const gmax = Math.max(...res.eql.couches.map(c => c.gammaMax));
    $('#si-afficheurs').innerHTML = [
      afficheur('Vs30', cache ? '—' : `${milliers(res.vs30)} m/s`, cache ? 'à calculer' : `épaisseur de sol ${virg(res.H, 0)} m`),
      afficheur('Classe EC8', cache ? '—' : res.classe, cache ? 'à déterminer' : 'EN 1998-1:2004, tableau 3.1'),
      afficheur('f0 = Vs/4H', cache ? '—' : `${virg(res.f0, 2)} Hz`, cache ? 'à calculer' : `pic linéaire : ${virg(res.fPic, 2)} Hz`),
      afficheur('PGA surface', `${g3(res.pgaSurf)} g`, `rocher ${g3(res.pgaRoc)} g · ×${virg(res.pgaSurf / res.pgaRoc, 2)}`),
      afficheur('γmax', `${virg(100 * gmax, gmax < 1e-3 ? 3 : 2)} %`, etat.r.calcul === 'eql' ? `${res.eql.iterations} itérations` : 'calcul linéaire'),
      afficheur('Calcul', `${milliers(res.duree)} ms`, `${res.col.couches.length} sous-couches`),
    ].join('');
  }
  function majControles() {
    const r = etat.r, c = r.couches[r.couche];
    $$('[data-si-profil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.siProfil === r.profil)));
    $$('[data-si-scenario]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.siScenario === r.scenario)));
    $$('[data-si-calcul]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.siCalcul === r.calcul)));
    $('#si-couches').innerHTML = r.couches.map((x, i) => `<button type="button" data-si-couche="${i}" aria-pressed="${i === r.couche}">${i + 1}</button>`).join('');
    $$('[data-si-couche]').forEach(b => b.addEventListener('click', () => { etat.r.couche = +b.dataset.siCouche; majControles(); dessinerProfils(); }));
    $('#si-h').value = c.h; $('#si-h-v').textContent = `${virg(c.h, 0)} m`;
    $('#si-vs').value = c.vs; $('#si-vs-v').textContent = `${milliers(c.vs)} m/s`;
    $('#si-ip').value = c.ip; $('#si-ip-v').textContent = `${virg(c.ip, 0)} %`;
    $('#si-roc').value = r.rocher.vs; $('#si-roc-v').textContent = `${milliers(r.rocher.vs)} m/s`;
    $('#si-pga').value = r.pga; $('#si-pga-v').textContent = `${g3(r.pga)} g`;
    $('#si-retirer').disabled = r.couches.length <= 1; $('#si-ajouter').disabled = r.couches.length >= 6;
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majAfficheurs();
    dessinerProfils(); dessinerTransfert(); dessinerSpectres(); dessinerAccelero();
  }
  function recalculer() { calculer(); tout(); }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 150); };
  const modifie = () => { etat.r.profil = null; };

  // ── Exercice : Vs30, classe et fréquence fondamentale d'un profil ──────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 17);
    const n = 2 + Math.floor(u() * 2), couches = [];
    let vs = 120 + Math.round(u() * 12) * 10;
    for (let i = 0; i < n; i++) {
      couches.push({ h: 2 + Math.round(u() * 10), vs, ip: Math.round(u() * 3) * 10, poids: poids(vs) });
      vs = Math.min(700, vs + 60 + Math.round(u() * 15) * 10);
    }
    etat.exo = { numero };
    etat.r = { ...reglagesDefaut(), profil: null, couches, rocher: { vs: 900 + Math.round(u() * 6) * 100, poids: 22, xi: 0.01 } };
    etat.verifie = false; etat.rep = {};
    $('#si-exo-num').textContent = 'Exercice n° ' + numero;
    $('#si-r-vs30').value = ''; $('#si-r-f0').value = '';
    $$('[data-si-rep]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#si-corrige').innerHTML = '';
    $('#si-exo-profil').innerHTML = `<div class="table-defile"><table class="resultats"><thead><tr><th>couche</th><th>h (m)</th><th>Vs (m/s)</th></tr></thead><tbody>${couches.map((c, i) =>
      `<tr><td class="n">${i + 1}</td><td class="n">${c.h}</td><td class="n">${c.vs}</td></tr>`).join('')}<tr><td>rocher</td><td class="n">—</td><td class="n">${etat.r.rocher.vs}</td></tr></tbody></table></div>`;
    recalculer();
  }
  function verifier() {
    const res = etat.res, lu = id => parseFloat(String($(id).value).replace(',', '.'));
    const v = lu('#si-r-vs30'), f = lu('#si-r-f0');
    const okV = Math.abs(v / res.vs30 - 1) <= 0.03, okC = etat.rep.classe === res.classe, okF = Math.abs(f / res.f0 - 1) <= 0.1;
    etat.verifie = true;
    const lignes = [
      ['Vs30', Number.isFinite(v) ? `${milliers(v)} m/s` : '—', `${milliers(res.vs30)} m/s`, okV, '± 3 % : 30 / Σ hi/Vsi, le rocher complète les 30 m'],
      ['Classe de sol', etat.rep.classe || '—', res.classe, okC, 'EN 1998-1:2004, tableau 3.1 (E : 5 à 20 m de sol C ou D sur rocher)'],
      ['f0 de la colonne', Number.isFinite(f) ? `${virg(f, 2)} Hz` : '—', `${virg(res.f0, 2)} Hz`, okF, `± 10 % : 1 / (4 Σ hi/Vsi) ; pic de la fonction de transfert : ${virg(res.fPic, 2)} Hz`],
    ];
    $('#si-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">La fréquence du quart d'onde situe le premier pic ; sa hauteur dépend du contraste d'impédance avec le rocher et de
      l'amortissement — et, en linéaire équivalent, de l'intensité du séisme, qui assouplit le sol et déplace le pic vers le bas.</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#si-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#si-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#si-panneau-explorer').hidden = m !== 'explorer';
    $('#si-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; recalculer(); }
  }

  // ── Événements ──────────────────────────────────────────────────────────
  function brancher() {
    $('#si-profils-choix').innerHTML = Object.entries(PROFILS).map(([id, p]) => `<button type="button" data-si-profil="${id}">${p.nom}</button>`).join('');
    $$('[data-si-profil]').forEach(b => b.addEventListener('click', () => { etat.r = { ...etat.r, profil: b.dataset.siProfil, ...profil(b.dataset.siProfil), couche: 0 }; recalculer(); }));
    $$('[data-si-scenario]').forEach(b => b.addEventListener('click', () => { etat.r.scenario = +b.dataset.siScenario; recalculer(); }));
    $$('[data-si-calcul]').forEach(b => b.addEventListener('click', () => { etat.r.calcul = b.dataset.siCalcul; recalculer(); }));
    const couche = () => etat.r.couches[etat.r.couche];
    $('#si-h').addEventListener('input', e => { couche().h = parseFloat(e.target.value); modifie(); majControles(); planifier(); });
    $('#si-vs').addEventListener('input', e => { const c = couche(); c.vs = parseFloat(e.target.value); c.poids = poids(c.vs); modifie(); majControles(); planifier(); });
    $('#si-ip').addEventListener('input', e => { couche().ip = parseFloat(e.target.value); modifie(); majControles(); planifier(); });
    $('#si-roc').addEventListener('input', e => { etat.r.rocher.vs = parseFloat(e.target.value); modifie(); majControles(); planifier(); });
    $('#si-pga').addEventListener('input', e => { etat.r.pga = parseFloat(e.target.value); majControles(); planifier(); });
    $('#si-ajouter').addEventListener('click', () => { const r = etat.r, c = r.couches[r.couches.length - 1]; r.couches.push({ ...c, vs: Math.min(780, c.vs + 100), poids: poids(Math.min(780, c.vs + 100)) }); r.couche = r.couches.length - 1; modifie(); recalculer(); });
    $('#si-retirer').addEventListener('click', () => { const r = etat.r; r.couches.splice(r.couche, 1); r.couche = Math.min(r.couche, r.couches.length - 1); modifie(); recalculer(); });
    $('#si-tirage').addEventListener('click', () => { etat.r.graine = 1 + Math.floor(Math.random() * 1e6); recalculer(); });
    $('#si-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#si-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $$('[data-si-rep]').forEach(b => b.addEventListener('click', () => {
      const [q, val] = b.dataset.siRep.split('|');
      etat.rep[q] = val;
      $$(`[data-si-rep^="${q}|"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('#si-verifier').addEventListener('click', verifier);
    $('#si-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-site').hidden && etat.res) { lireCouleurs(); tout(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#si-profils', '#si-transfert', '#si-spectres', '#si-acc']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'site') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); setTimeout(recalculer, 30); }
    else tout();
  });
})();
