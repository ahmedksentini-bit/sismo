import Oscillateur from './sismo/oscillateur.js';
import Sismo from './sismo/signal.js';

// src/banc-sismometre.js — banc « sismomètre » : une masse sur ressort et amortisseur, dans un bâti
// posé sur le sol. Le stylet lié à la masse écrit son déplacement x par rapport au bâti.
(() => {
  'use strict';
  const O = Oscillateur, SM = Sismo;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  // Curseurs logarithmiques : 0 → 0,02 Hz, 1000 → 50 Hz.
  const depuisCurseur = v => 0.02 * Math.pow(2500, v / 1000);
  const versCurseur = f => Math.round((1000 * Math.log(f / 0.02)) / Math.log(2500));
  const fmtF = f => virg(f, f < 0.1 ? 3 : f < 1 ? 2 : f < 10 ? 2 : 1);
  const AMP = 1e-3; // amplitude du sol sinusoïdal : 1 mm
  const NOM_REGIME = { sismometre: 'Sismomètre : x ≈ −ug', accelerometre: 'Accéléromètre : x ≈ −üg/ω₀²', resonance: 'Zone de résonance' };

  const etat = {
    pret: false, exc: 'sinus', f0: 1, xi: 0.7, f: 5, ralenti: false, marche: true,
    t: 0, tdebut: 0, phi0: 0, tphi0: 0, s: { x: 0, v: 0 }, hist: [], tHist: 0, k: 1e4, seisme: null,
  };

  // ── Mouvement du sol ────────────────────────────────────────────────────
  function sol(t) {
    if (etat.exc === 'sinus') {
      const w = 2 * Math.PI * etat.f, ph = etat.phi0 + w * (t - etat.tphi0);
      const Tr = Math.min(10, Math.max(0.5, 1 / etat.f)), tau = t - etat.tdebut;
      let R = 1, R1 = 0, R2 = 0;
      if (tau < Tr) { const k = Math.PI / Tr; R = 0.5 * (1 - Math.cos(k * tau)); R1 = 0.5 * k * Math.sin(k * tau); R2 = 0.5 * k * k * Math.cos(k * tau); }
      const s = Math.sin(ph), c = Math.cos(ph);
      return { u: AMP * R * s, a: AMP * (R2 * s + 2 * R1 * w * c - R * w * w * s) };
    }
    if (etat.exc === 'seisme') {
      const q = etat.seisme, p = ((t - etat.tdebut) / q.dt) % (q.n - 1), i = Math.floor(p), r = p - i;
      return { u: q.dep[i] * (1 - r) + q.dep[i + 1] * r, a: q.acc[i] * (1 - r) + q.acc[i + 1] * r };
    }
    return { u: 0, a: 0 };
  }
  function preparerSeisme() {
    if (etat.seisme) return;
    const ev = SM.generer({ Mw: 4.5, delta: 25, h: 8, baz: 60, graine: 5 });
    const dt = ev.dt, i0 = Math.max(0, Math.round((ev.tt.tP - ev.t0 - 3) / dt)), i1 = Math.min(ev.n, Math.round((ev.tt.tSg - ev.t0 + 35) / dt));
    const dep = SM.convertir(ev.acc.N, dt, 'HN', 'deplacement', null);
    etat.seisme = { dt, n: i1 - i0, acc: ev.acc.N.slice(i0, i1), dep: dep.slice(i0, i1) };
  }
  function redemarrer() {
    etat.t = 0; etat.tdebut = 0; etat.phi0 = 0; etat.tphi0 = 0; etat.hist = []; etat.tHist = 0;
    etat.s = { x: etat.exc === 'lacher' ? AMP : 0, v: 0 };
  }

  // ── Intégration en temps réel ───────────────────────────────────────────
  function avancer(T) {
    const fmax = Math.max(etat.f0, etat.exc === 'sinus' ? etat.f : etat.exc === 'seisme' ? 25 : 0);
    const h = Math.min(0.004, 1 / (40 * fmax));
    let reste = T;
    while (reste > 1e-9) {
      const d = Math.min(h, reste), s0 = sol(etat.t), s1 = sol(etat.t + d);
      O.pas(etat.s, s0.a, s1.a, d, etat.f0, etat.xi);
      etat.t += d; reste -= d;
      if (etat.t - etat.tHist >= 0.005) { etat.hist.push([etat.t, s1.u, etat.s.x, s1.a]); etat.tHist = etat.t; }
    }
    const garde = etat.t - fenetre() - 2;
    let i = 0;
    while (i < etat.hist.length && etat.hist[i][0] < garde) i++;
    if (i > 0) etat.hist.splice(0, i);
  }
  const fenetre = () => (etat.exc === 'sinus' ? Math.min(60, Math.max(6, 3 / etat.f)) : etat.exc === 'seisme' ? 20 : 8);

  let enCours = false, dernier = 0, derniereMaj = 0;
  function demarrer() {
    if (enCours || !etat.marche) return;
    enCours = true; dernier = performance.now();
    requestAnimationFrame(image);
  }
  function image(ts) {
    if (!etat.marche || $('#banc-sismometre').hidden) { enCours = false; return; }
    const dtr = Math.min(0.05, Math.max(0, (ts - dernier) / 1000));
    dernier = ts;
    avancer(dtr * (etat.ralenti ? 0.25 : 1));
    dessinerScene(); dessinerCourbes();
    if (ts - derniereMaj > 120) { majAfficheurs(); derniereMaj = ts; }
    requestAnimationFrame(image);
  }

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'phase', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft', 'soft-line', 'line', 'input'])
      COUL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function preparer(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    return { ctx, W, H };
  }
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }
  // Échelle de dessin commune au sol et à la masse : la plus grande amplitude récente vaut 46 px.
  function echelle() {
    let m = 0;
    const t0 = etat.t - Math.min(fenetre(), 6);
    for (let i = etat.hist.length - 1; i >= 0 && etat.hist[i][0] >= t0; i--) {
      const [, u, x] = etat.hist[i];
      m = Math.max(m, Math.abs(u), Math.abs(x), Math.abs(u + x));
    }
    const cible = m > 0 ? 46 / m : etat.k;
    etat.k = cible < etat.k ? cible : etat.k + (cible - etat.k) * 0.03;
    return etat.k;
  }
  function ressort(ctx, x0, x1, y) {
    const n = 9, l = x1 - x0, a = 7;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 6, y);
    for (let i = 0; i < n; i++) ctx.lineTo(x0 + 6 + ((i + 0.5) / n) * (l - 12), y + (i % 2 ? a : -a));
    ctx.lineTo(x1 - 6, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  function dessinerScene() {
    lireCouleurs();
    const cv = $('#s-scene');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), k = echelle();
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const s = sol(etat.t), u = s.u, x = etat.s.x, cx = W / 2;
    const ySol = H - 34, bw = Math.min(380, W - 60), bh = 168, gauche = cx + u * k - bw / 2, haut = ySol - bh;
    // Repère fixe (inertiel)
    ctx.save(); ctx.strokeStyle = COUL.muted; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + 0.5, 6); ctx.lineTo(cx + 0.5, H - 4); ctx.stroke(); ctx.restore();
    texte(ctx, 'repère fixe', cx + 5, 12, COUL.muted, `700 11px ${POLICE}`);
    // Sol : bande hachurée qui suit ug
    ctx.fillStyle = COUL.soft; ctx.fillRect(0, ySol, W, H - ySol);
    ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1;
    const dec = ((u * k) % 14 + 14) % 14;
    for (let X = -14 + dec; X < W + 14; X += 14) { ctx.beginPath(); ctx.moveTo(X, H); ctx.lineTo(X + 12, ySol); ctx.stroke(); }
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, ySol); ctx.lineTo(W, ySol); ctx.stroke();
    texte(ctx, 'sol : ug', 10, ySol + 16, COUL.ink, `800 11px ${POLICE}`);
    // Bâti lié au sol
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gauche, ySol); ctx.lineTo(gauche, haut); ctx.lineTo(gauche + bw, haut); ctx.lineTo(gauche + bw, ySol); ctx.stroke();
    texte(ctx, 'bâti', gauche + bw - 6, haut + 12, COUL.muted, `700 11px ${POLICE}`, 'right');
    // Papier lié au bâti, défilant vers le bas : 3 s d'enregistrement
    const pg = gauche + 16, pd = gauche + bw - 16, ph = ySol - 70, pb = ySol - 8;
    ctx.fillStyle = COUL.input; ctx.fillRect(pg, ph, pd - pg, pb - ph);
    ctx.strokeStyle = COUL.line; ctx.lineWidth = 1; ctx.strokeRect(pg + 0.5, ph + 0.5, pd - pg - 1, pb - ph - 1);
    // Durée de papier visible : quelques cycles, pour que la trace reste lisible.
    const duree = etat.exc === 'sinus' ? Math.min(3, Math.max(0.4, 4 / etat.f)) : etat.exc === 'lacher' ? Math.min(3, Math.max(0.5, 5 / etat.f0)) : 3;
    const cxB = gauche + bw / 2, vit = (pb - ph) / duree;
    ctx.save(); ctx.beginPath(); ctx.rect(pg, ph, pd - pg, pb - ph); ctx.clip();
    ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 1.5; ctx.beginPath();
    let premier = true;
    for (let i = etat.hist.length - 1; i >= 0; i--) {
      const [t, , xx] = etat.hist[i], yy = ph + 3 + (etat.t - t) * vit;
      if (yy > pb + 2) break;
      const X = cxB + xx * k;
      if (premier) { ctx.moveTo(X, yy); premier = false; } else ctx.lineTo(X, yy);
    }
    ctx.stroke(); ctx.restore();
    texte(ctx, 'papier (lié au bâti)', pg + 4, pb - 9, COUL.muted, `700 10.5px ${POLICE}`);
    // Masse : position absolue ug + x
    const mx = cx + (u + x) * k, my = haut + 52, mw = 62, mh = 44;
    // Ressort et amortisseur, du montant gauche à la masse
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.6;
    ressort(ctx, gauche, mx - mw / 2, my - 11);
    const ya = my + 12, xc0 = gauche + 18, xc1 = Math.max(xc0 + 30, mx - mw / 2 - 30);
    ctx.beginPath(); ctx.moveTo(gauche, ya); ctx.lineTo(xc0, ya); ctx.stroke();
    ctx.strokeRect(xc0, ya - 8, Math.max(26, xc1 - xc0), 16);
    ctx.beginPath(); ctx.moveTo(mx - mw / 2, ya); ctx.lineTo(Math.min(mx - mw / 2, xc0 + 14), ya);
    ctx.moveTo(Math.min(mx - mw / 2, xc0 + 14), ya - 6); ctx.lineTo(Math.min(mx - mw / 2, xc0 + 14), ya + 6); ctx.stroke();
    texte(ctx, `ressort (f₀ = ${fmtF(etat.f0)} Hz)`, gauche + 8, my - 30, COUL.muted, `700 10.5px ${POLICE}`);
    texte(ctx, `amortisseur (ξ = ${virg(etat.xi, 2)})`, gauche + 8, ya + 20, COUL.muted, `700 10.5px ${POLICE}`);
    ctx.fillStyle = COUL.blue; ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
    ctx.font = `800 12px ${POLICE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COUL.paper; ctx.fillText('masse', mx, my);
    // Stylet
    ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, my + mh / 2); ctx.lineTo(mx, ph + 3); ctx.stroke();
    ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(mx, ph + 3, 3, 0, 2 * Math.PI); ctx.fill();
  }

  function dessinerCourbes() {
    const cv = $('#s-courbes');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: 10, d: 10, h: 10, b: 22 };
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const F = fenetre(), t1 = etat.t, t0 = t1 - F, w0 = 2 * Math.PI * etat.f0;
    const X = t => m.g + ((t - t0) / F) * (W - m.g - m.d), yc = (m.h + H - m.b) / 2;
    let a = 0;
    for (const [t, u, x] of etat.hist) if (t >= t0) a = Math.max(a, Math.abs(u), Math.abs(x));
    const ech = ((H - m.h - m.b) / 2) * 0.85 / (a || 1);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    const pas = F > 30 ? 10 : F > 12 ? 5 : 1;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = Math.ceil(t0 / pas) * pas; t <= t1; t += pas) {
      const x = Math.round(X(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke();
      ctx.fillText(virg(t, 0) + ' s', x, H - m.b + 5);
    }
    ctx.strokeStyle = COUL['grid-strong']; ctx.beginPath(); ctx.moveTo(m.g, yc + 0.5); ctx.lineTo(W - m.d, yc + 0.5); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    const courbe = (val, coul, larg, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = larg; ctx.setLineDash(tirets || []); ctx.beginPath();
      let p = true;
      for (const e of etat.hist) { if (e[0] < t0) continue; const y = yc - val(e) * ech; if (p) { ctx.moveTo(X(e[0]), y); p = false; } else ctx.lineTo(X(e[0]), y); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    // −üg/ω₀² n'est tracée que si elle tient dans le cadre ; sinon on dit de combien elle le dépasse.
    let aa = 0;
    for (const e of etat.hist) if (e[0] >= t0) aa = Math.max(aa, Math.abs(e[3]) / (w0 * w0));
    const horsEchelle = a > 0 && aa > 3 * a;
    if (!horsEchelle) courbe(e => -e[3] / (w0 * w0), COUL.amp, 1.5, [5, 4]);
    courbe(e => -e[1], COUL.blue, 1.5);
    courbe(e => e[2], COUL['pick-p'], 2.2);
    ctx.restore();
    if (horsEchelle) texte(ctx, `−üg/ω₀² hors échelle : ${virg(aa / a, 0)} fois plus grand`, m.g + 6, m.h + 9, COUL.amp, `700 11px ${POLICE}`);
  }

  function dessinerReponse() {
    lireCouleurs();
    const cv = $('#s-reponse');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: 46, d: 12, h: 14, b: 30 };
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const fx = [0.01, 100], fy = [0.001, 30];
    const X = f => m.g + (Math.log10(f / fx[0]) / Math.log10(fx[1] / fx[0])) * (W - m.g - m.d);
    const Y = v => H - m.b - (Math.log10(v / fy[0]) / Math.log10(fy[1] / fy[0])) * (H - m.h - m.b);
    // Zones de fonctionnement
    ctx.fillStyle = COUL.soft;
    ctx.fillRect(m.g, m.h, Math.max(0, Math.min(X(0.3 * etat.f0), W - m.d) - m.g), H - m.h - m.b);
    ctx.fillRect(Math.max(m.g, X(3 * etat.f0)), m.h, Math.max(0, W - m.d - Math.max(m.g, X(3 * etat.f0))), H - m.h - m.b);
    ctx.font = `700 10.5px ${POLICE}`; ctx.fillStyle = COUL.muted; ctx.textBaseline = 'top';
    if (X(0.3 * etat.f0) - m.g > 70) { ctx.textAlign = 'left'; ctx.fillText('accéléromètre', m.g + 5, m.h + 4); }
    if (W - m.d - X(3 * etat.f0) > 70) { ctx.textAlign = 'right'; ctx.fillText('sismomètre (déplacement)', W - m.d - 5, m.h + 4); }
    // Grille décadique
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const f of [0.01, 0.1, 1, 10, 100]) {
      const x = Math.round(X(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(f).replace('.', ','), x, H - m.b + 5);
    }
    for (const v of [0.001, 0.01, 0.1, 1, 10]) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(v).replace('.', ','), m.g - 5, y);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('f (Hz)', W - m.d, H - m.b - 2);
    // f₀
    const x0 = X(etat.f0);
    ctx.save(); ctx.strokeStyle = COUL.ink; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x0, m.h); ctx.lineTo(x0, H - m.b); ctx.stroke(); ctx.restore();
    texte(ctx, 'f₀', x0 + 4, H - m.b - 12, COUL.ink, `800 11px ${POLICE}`);
    // Courbes
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    for (const [cle, coul, larg] of [['acceleration', COUL.amp, 2], ['deplacement', COUL['pick-p'], 2.4]]) {
      ctx.strokeStyle = coul; ctx.lineWidth = larg; ctx.beginPath();
      for (let i = 0; i <= 400; i++) {
        const f = fx[0] * Math.pow(fx[1] / fx[0], i / 400), v = Math.max(fy[0] / 2, O.reponse(f, etat.f0, etat.xi)[cle]);
        if (i === 0) ctx.moveTo(X(f), Y(v)); else ctx.lineTo(X(f), Y(v));
      }
      ctx.stroke();
    }
    ctx.restore();
    if (etat.exc === 'sinus') {
      const r = O.reponse(etat.f, etat.f0, etat.xi);
      for (const [v, c] of [[r.deplacement, COUL['pick-p']], [r.acceleration, COUL.amp]]) {
        if (v < fy[0]) continue;
        ctx.fillStyle = c; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(etat.f), Y(Math.min(v, fy[1])), 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      }
    }
  }

  // ── Afficheurs ──────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function mesure() {
    if (etat.exc !== 'sinus') return null;
    const Tr = Math.min(10, Math.max(0.5, 1 / etat.f)), etab = Math.min(60, 4 / Math.max(1e-3, etat.xi * 2 * Math.PI * etat.f0));
    if (etat.t - etat.tdebut < Tr + etab + 2 / etat.f) return null;
    const t0 = etat.t - Math.max(0.5, 2 / etat.f);
    let a = 0;
    for (let i = etat.hist.length - 1; i >= 0 && etat.hist[i][0] >= t0; i--) a = Math.max(a, Math.abs(etat.hist[i][2]));
    return a / AMP;
  }
  function majAfficheurs() {
    const r = O.reponse(etat.f, etat.f0, etat.xi), sin = etat.exc === 'sinus', mes = mesure();
    const reg = sin ? O.regime(etat.f, etat.f0) : null;
    $('#s-afficheurs').innerHTML = [
      afficheur('Fréquence propre f₀', fmtF(etat.f0) + ' Hz', `T₀ = ${virg(1 / etat.f0, 1 / etat.f0 < 1 ? 2 : 1)} s`),
      afficheur('Amortissement ξ', virg(etat.xi, 2), etat.xi >= 1 ? 'au-delà du critique' : 'critique : ξ = 1'),
      afficheur('Fréquence du sol', sin ? fmtF(etat.f) + ' Hz' : '—', sin ? `f / f₀ = ${virg(etat.f / etat.f0, 2)}` : etat.exc === 'lacher' ? 'masse lâchée, sol immobile' : 'séisme M4,5 à 25 km'),
      afficheur('|X / Ug| théorique', sin ? virg(r.deplacement, r.deplacement < 0.1 ? 3 : 2) : '—', sin ? `|X·ω₀² / Üg| = ${virg(r.acceleration, 2)}` : ''),
      afficheur('|X / Ug| mesuré', mes !== null ? virg(mes, mes < 0.1 ? 3 : 2) : '—', sin ? (mes !== null ? 'régime permanent' : 'régime transitoire…') : ''),
      afficheur('Régime', reg ? NOM_REGIME[reg].split(' : ')[0] : '—', reg ? NOM_REGIME[reg].split(' : ')[1] || 'ni l\'un ni l\'autre' : ''),
    ].join('');
  }
  function majCurseurs() {
    $('#s-f0').value = versCurseur(etat.f0); $('#s-f0-v').textContent = fmtF(etat.f0) + ' Hz';
    $('#s-xi').value = etat.xi; $('#s-xi-v').textContent = virg(etat.xi, 2);
    $('#s-f').value = versCurseur(etat.f); $('#s-f-v').textContent = fmtF(etat.f) + ' Hz';
    $('#s-champ-f').hidden = etat.exc !== 'sinus';
    $$('[data-s-exc]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sExc === etat.exc)));
    $('#s-marche').textContent = etat.marche ? 'Pause' : 'Reprendre';
    $('#s-ralenti').setAttribute('aria-pressed', String(etat.ralenti));
  }
  function majAide() {
    const t = {
      sinus: 'Le sol oscille sur 1 mm. Comparez le stylet (rouge) à −ug (bleu) et à −üg/ω₀² (tirets ambre) : selon f/f₀, il recopie l\'un ou l\'autre.',
      lacher: 'Essai de lâcher : la masse est écartée puis libérée, le sol ne bouge pas. Elle oscille à f₀ et s\'amortit d\'autant plus vite que ξ est grand.',
      seisme: 'Le sol suit un accélérogramme simulé (M4,5 à 25 km). Réglez f₀ très bas puis très haut : le stylet donne le déplacement, puis l\'accélération.',
    }[etat.exc];
    $('#s-aide').innerHTML = t;
  }
  function tout() { majCurseurs(); majAide(); majAfficheurs(); dessinerReponse(); dessinerScene(); dessinerCourbes(); }

  // ── Événements ──────────────────────────────────────────────────────────
  function brancher() {
    $('#s-f0').addEventListener('input', e => { etat.f0 = depuisCurseur(+e.target.value); delete etat.s.a; majCurseurs(); dessinerReponse(); majAfficheurs(); });
    $('#s-xi').addEventListener('input', e => { etat.xi = parseFloat(e.target.value); delete etat.s.a; majCurseurs(); dessinerReponse(); majAfficheurs(); });
    $('#s-f').addEventListener('input', e => {
      // Continuité de phase : le sol ne saute pas quand on change sa fréquence.
      const w = 2 * Math.PI * etat.f;
      etat.phi0 += w * (etat.t - etat.tphi0); etat.tphi0 = etat.t;
      etat.f = depuisCurseur(+e.target.value);
      majCurseurs(); dessinerReponse(); majAfficheurs();
    });
    $$('[data-s-exc]').forEach(b => b.addEventListener('click', () => {
      etat.exc = b.dataset.sExc;
      if (etat.exc === 'seisme') preparerSeisme();
      redemarrer(); tout(); demarrer();
    }));
    $$('[data-s-prereglage]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.sPrereglage === 'peuAmorti' ? { f0: etat.f0, xi: 0.05 } : O.INSTRUMENTS[b.dataset.sPrereglage];
      etat.f0 = p.f0; etat.xi = p.xi; delete etat.s.a; tout();
    }));
    $('#s-marche').addEventListener('click', () => { etat.marche = !etat.marche; majCurseurs(); demarrer(); });
    $('#s-ralenti').addEventListener('click', () => { etat.ralenti = !etat.ralenti; majCurseurs(); });
    $('#s-relancer').addEventListener('click', () => { redemarrer(); tout(); demarrer(); });
    const redessiner = () => { if (!$('#banc-sismometre').hidden) tout(); };
    new ResizeObserver(redessiner).observe($('#s-scene'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'sismometre') return;
    if (!etat.pret) {
      etat.pret = true;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) etat.marche = false;
      brancher(); redemarrer();
      // Une seconde de régime déjà calculée : la page n'est pas vide à l'ouverture.
      avancer(1.5);
    }
    tout(); demarrer();
  });
})();
