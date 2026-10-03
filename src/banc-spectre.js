import Sismo from './sismo/signal.js';
import Spectre from './sismo/spectre.js';

// src/banc-spectre.js — banc « spectre de réponse » : six bâtiments sur une table vibrante, le spectre
// qui se construit pendant la lecture de l'accélérogramme, et le spectre élastique de l'EC8 en regard.
(() => {
  'use strict';
  const SM = Sismo, Sp = Spectre, G = Sp.G;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const T_CALCUL = Sp.periodes(90, 0.02, 4);
  const T_BATIS = [0.1, 0.2, 0.5, 1, 2, 4];
  const NOM_SYSTEME = { acier: 'portiques en acier', beton: 'portiques en béton', autres: 'autres structures' };

  const etat = {
    pret: false, Mw: 5.5, R: 20, xi: 0.05, graine: 3,
    type: 2, sol: 'A', calage: 'pga', agImpose: 0.15, T1: 0.5, H: 15, systeme: 'beton', grandeur: 'Sa',
    sig: null, final: null, lecture: false, ralenti: false, i: 0, prog: null, batis: null, dejaJoue: false,
  };

  // ── Signal et spectre complet ───────────────────────────────────────────
  function regenerer() {
    const ev = SM.generer({ Mw: etat.Mw, delta: etat.R, h: 10, baz: 40, graine: etat.graine });
    const dt = ev.dt, i0 = Math.max(0, Math.round((ev.tt.tP - ev.t0 - 2) / dt));
    const acc = ev.acc.N.slice(i0), dep = SM.convertir(acc, dt, 'HN', 'deplacement', null);
    let pga = 0, ipga = 0, pgd = 0;
    for (let i = 0; i < acc.length; i++) { if (Math.abs(acc[i]) > pga) { pga = Math.abs(acc[i]); ipga = i; } pgd = Math.max(pgd, Math.abs(dep[i])); }
    etat.sig = { dt, acc, dep, pga, ipga, pgd, n: acc.length };
    recalculer();
  }
  function recalculer() {
    const s = etat.sig;
    etat.final = Sp.reponse(s.acc, s.dt, T_CALCUL, etat.xi);
    etat.batisFinal = Sp.reponse(s.acc, s.dt, T_BATIS, etat.xi);
    arreter(); etat.i = s.n - 1; etat.dejaJoue = false;
    tout();
  }
  const agEC8 = () => (etat.calage === 'pga' ? etat.sig.pga / G / Sp.EC8_2004[etat.type][etat.sol].S : etat.agImpose);
  const ec8 = T => Sp.ec8(T, { type: etat.type, sol: etat.sol, ag: agEC8(), xi: etat.xi });
  function saInterp(T, Sa) {
    if (T <= T_CALCUL[0]) return Sa[0];
    for (let k = 1; k < T_CALCUL.length; k++) if (T <= T_CALCUL[k]) {
      const r = Math.log(T / T_CALCUL[k - 1]) / Math.log(T_CALCUL[k] / T_CALCUL[k - 1]);
      return Sa[k - 1] + (Sa[k] - Sa[k - 1]) * r;
    }
    return Sa[Sa.length - 1];
  }

  // ── Lecture animée ──────────────────────────────────────────────────────
  let enCours = false, dernier = 0, reste = 0;
  function lancer() {
    const s = etat.sig;
    etat.prog = Sp.progressif(T_CALCUL, etat.xi, s.dt);
    etat.batis = Sp.progressif(T_BATIS, etat.xi, s.dt);
    etat.i = 0; reste = 0; etat.lecture = true; etat.dejaJoue = true;
    majBoutons();
    if (!enCours) { enCours = true; dernier = performance.now(); requestAnimationFrame(image); }
  }
  function arreter() { etat.lecture = false; majBoutons(); }
  function image(ts) {
    if (!etat.lecture || $('#banc-spectre').hidden) { enCours = false; return; }
    const s = etat.sig, dtr = Math.min(0.05, Math.max(0, (ts - dernier) / 1000));
    dernier = ts;
    reste += dtr * (etat.ralenti ? 0.25 : 1);
    while (reste >= s.dt && etat.i < s.n - 1) {
      etat.prog.avancer(s.acc[etat.i], s.acc[etat.i + 1]);
      etat.batis.avancer(s.acc[etat.i], s.acc[etat.i + 1]);
      etat.i++; reste -= s.dt;
    }
    if (etat.i >= s.n - 1) etat.lecture = false;
    dessinerTable(); dessinerAccelero(); dessinerSpectre(); majAfficheurs();
    if (!etat.lecture) { majBoutons(); enCours = false; return; }
    requestAnimationFrame(image);
  }
  // Sa courant (pendant la lecture) ou final.
  const saCourant = () => (etat.prog && (etat.lecture || etat.dejaJoue) ? T_CALCUL.map((_, k) => etat.prog.Sa(k)) : Array.from(etat.final.Sa));
  const sdCourant = () => (etat.prog && (etat.lecture || etat.dejaJoue) ? Array.from(etat.prog.Sd) : Array.from(etat.final.Sd));

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'phase', 'vrai', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft', 'line', 'teal'])
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
  function dessinerTable() {
    lireCouleurs();
    const cv = $('#sp-table');
    if (cv.clientWidth < 50 || !etat.sig) return;
    const { ctx, W, H } = preparer(cv), s = etat.sig, joue = etat.lecture || etat.dejaJoue;
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const i = joue ? etat.i : 0, u = s.dep[i] / (s.pgd || 1) * 18, yT = H - 56;
    // Table vibrante
    ctx.fillStyle = COUL.soft; ctx.fillRect(0, yT + 16, W, H - yT - 16);
    ctx.fillStyle = COUL['grid-strong']; ctx.fillRect(20 + u, yT, W - 40, 16);
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.5; ctx.strokeRect(20 + u + 0.5, yT + 0.5, W - 41, 15);
    texte(ctx, 'table vibrante', 26 + u, yT + 8, COUL.ink, `700 10.5px ${POLICE}`);
    const pas = (W - 40) / T_BATIS.length;
    T_BATIS.forEach((T, b) => {
      const xb = 20 + pas * (b + 0.5) + u, hb = 52 + 26 * Math.log2(T / 0.1) / Math.log2(40) * 4.5;
      const sdF = etat.batisFinal.Sd[b] || 1, x = joue && etat.batis ? etat.batis.etats[b].x : 0;
      const dx = (x / sdF) * pas * 0.36, top = yT - hb;
      ctx.strokeStyle = COUL.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(xb, yT); ctx.quadraticCurveTo(xb, top + hb * 0.35, xb + dx, top); ctx.stroke();
      ctx.fillStyle = COUL.blue; ctx.beginPath(); ctx.arc(xb + dx, top, 9, 0, 2 * Math.PI); ctx.fill();
      const sa = joue && etat.batis ? etat.batis.Sa(b) : (2 * Math.PI / T) ** 2 * etat.batisFinal.Sd[b];
      texte(ctx, `T = ${virg(T, T < 1 ? 1 : 0)} s`, 20 + pas * (b + 0.5), H - 26, COUL.ink, `800 11px ${POLICE}`, 'center');
      texte(ctx, `${virg(sa / G, 2)} g`, 20 + pas * (b + 0.5), H - 11, COUL['pick-p'], `700 11px ${MONO}`, 'center');
    });
    texte(ctx, 'déformations agrandies, chaque oscillateur à sa propre échelle', W - 8, 10, COUL.muted, `600 10.5px ${POLICE}`, 'right');
  }
  function dessinerAccelero() {
    const cv = $('#sp-accelero');
    if (cv.clientWidth < 50 || !etat.sig) return;
    const { ctx, W, H } = preparer(cv), s = etat.sig, m = { g: 8, d: 8, h: 8, b: 18 };
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const yc = (m.h + H - m.b) / 2, k = ((H - m.h - m.b) / 2) * 0.92 / (s.pga || 1), px = W - m.g - m.d;
    ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(m.g, yc + 0.5); ctx.lineTo(W - m.d, yc + 0.5); ctx.stroke();
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 0; c < px; c++) {
      const a = Math.floor((c * s.n) / px), b = Math.max(a + 1, Math.floor(((c + 1) * s.n) / px));
      let mn = Infinity, mx = -Infinity;
      for (let i = a; i < Math.min(s.n, b); i++) { if (s.acc[i] < mn) mn = s.acc[i]; if (s.acc[i] > mx) mx = s.acc[i]; }
      if (c === 0) ctx.moveTo(m.g + c + 0.5, yc - mx * k); else ctx.lineTo(m.g + c + 0.5, yc - mx * k);
      ctx.lineTo(m.g + c + 0.5, yc - mn * k);
    }
    ctx.stroke();
    const xp = m.g + (s.ipga / s.n) * px, yp = yc - s.acc[s.ipga] * k;
    ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(xp, yp, 4, 0, 2 * Math.PI); ctx.fill();
    texte(ctx, `PGA ${virg(s.pga / G, 3)} g`, xp + 8, Math.max(m.h + 6, Math.min(H - m.b - 6, yp)), COUL['pick-p'], `800 11px ${MONO}`);
    if (etat.lecture || etat.dejaJoue) {
      const x = m.g + (etat.i / s.n) * px;
      ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, m.h - 4); ctx.lineTo(x, H - m.b + 2); ctx.stroke();
    }
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${virg(s.n * s.dt, 0)} s · composante N · accélération du sol`, W - m.d, H - 2);
  }
  function dessinerSpectre() {
    const cv = $('#sp-spectre');
    if (cv.clientWidth < 50 || !etat.final) return;
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 16, h: 16, b: 34 }, Sa = etat.grandeur === 'Sa';
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const unite = Sa ? 'g' : 'cm', conv = Sa ? 1 / G : 100;
    const finale = (Sa ? Array.from(etat.final.Sa) : Array.from(etat.final.Sd)).map(v => v * conv);
    const courant = (Sa ? saCourant() : sdCourant()).map(v => v * conv);
    const ec8Val = T => (Sa ? ec8(T) : ec8(T) * G * (T / (2 * Math.PI)) ** 2 * 100);
    let ymax = Math.max(...finale);
    for (let T = 0; T <= 4; T += 0.02) ymax = Math.max(ymax, ec8Val(T));
    ymax *= 1.12;
    const X = T => m.g + (T / 4) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    // Grille
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let T = 0; T <= 4; T += 0.5) {
      const x = Math.round(X(T)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(T, T % 1 ? 1 : 0), x, H - m.b + 5);
    }
    const pas = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find(p => ymax / p <= 6) || 200;
    for (let v = 0; v <= ymax; v += pas) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, pas < 0.01 ? 3 : pas < 0.1 ? 2 : pas < 1 ? 1 : 0), m.g - 6, y);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('T (s)', W - m.d, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(Sa ? 'Sa (g)' : 'Sd (cm)', m.g + 6, m.h + 2);
    // Spectre EC8
    ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2.2; ctx.setLineDash([7, 5]); ctx.beginPath();
    for (let i = 0; i <= 400; i++) { const T = (4 * i) / 400; if (i === 0) ctx.moveTo(X(T), Y(ec8Val(T))); else ctx.lineTo(X(T), Y(ec8Val(T))); }
    ctx.stroke(); ctx.setLineDash([]);
    // Spectre final (gris) et spectre courant (rouge)
    const tracer = (v, coul, larg) => {
      ctx.strokeStyle = coul; ctx.lineWidth = larg; ctx.beginPath();
      ctx.moveTo(X(0), Y(Sa ? etat.sig.pga / G : 0));
      T_CALCUL.forEach((T, k) => ctx.lineTo(X(T), Y(v[k])));
      ctx.stroke();
    };
    if (etat.lecture) tracer(finale, COUL['grid-strong'], 1.5);
    tracer(courant, COUL['pick-p'], 2.4);
    // Période de l'ouvrage
    const x1 = X(etat.T1);
    ctx.save(); ctx.strokeStyle = COUL.amp; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x1, m.h); ctx.lineTo(x1, H - m.b); ctx.stroke(); ctx.restore();
    const v1 = saInterp(etat.T1, courant), e1 = ec8Val(etat.T1);
    for (const [v, c] of [[v1, COUL['pick-p']], [e1, COUL.teal]]) { ctx.fillStyle = c; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x1, Y(v), 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    texte(ctx, `T₁ = ${virg(etat.T1, 2)} s`, x1 + 6, H - m.b - 10, COUL.amp, `800 11px ${POLICE}`);
    $('#sp-legende-ec8').textContent = `EC8 type ${etat.type}, sol ${etat.sol}, ag = ${virg(agEC8(), 3)} g, ξ = ${virg(etat.xi * 100, 0)} %`;
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    if (!etat.final) return;
    const s = etat.sig, p = Sp.EC8_2004[etat.type][etat.sol], ag = agEC8(), n = Sp.eta(etat.xi);
    const Sa = Array.from(etat.final.Sa);
    let kmax = 0;
    Sa.forEach((v, k) => { if (v > Sa[kmax]) kmax = k; });
    $('#sp-afficheurs-seisme').innerHTML = [
      afficheur('PGA', virg(s.pga / G, 3) + ' g', `${virg(s.pga, 2)} m/s²`),
      afficheur('Sa maximal', virg(Sa[kmax] / G, 3) + ' g', `à T = ${virg(T_CALCUL[kmax], 2)} s ; ${virg(Sa[kmax] / s.pga, 1)} × PGA`),
    ].join('');
    $('#sp-afficheurs-ec8').innerHTML = [
      afficheur('S', virg(p.S, 2), `sol ${etat.sol}`),
      afficheur('η', virg(n, 3), `ξ = ${virg(etat.xi * 100, 0)} %`),
      afficheur('Fin du plateau TC', virg(p.TC, 2) + ' s', `TB = ${virg(p.TB, 2)} s · TD = ${virg(p.TD, 1)} s`),
      afficheur('Plateau 2,5·η·S·ag', virg(2.5 * n * p.S * ag, 3) + ' g', etat.calage === 'pga' ? `ag = PGA / S = ${virg(ag, 3)} g` : `ag = ${virg(ag, 3)} g imposé`),
    ].join('');
    const sa1 = saInterp(etat.T1, saCourant()) / G, se1 = ec8(etat.T1);
    $('#sp-afficheurs-ouvrage').innerHTML = [
      afficheur('Sa(T₁) du signal', virg(sa1, 3) + ' g', etat.lecture ? 'en cours de lecture' : 'enregistrement complet'),
      afficheur('Se(T₁) de l\'EC8', virg(se1, 3) + ' g', `rapport ${virg(sa1 / se1, 2)}`),
    ].join('');
    const conseil = etat.Mw <= 5.5 ? 2 : 1;
    $('#sp-conseil').innerHTML = `Avec Mw ${virg(etat.Mw, 1)}, l'EC8 recommande le <b>type ${conseil}</b> (type 2 si Ms ≤ 5,5 ; ici Ms ≈ Mw).`
      + (conseil !== etat.type ? ' Le type choisi n\'est pas celui-là : comparez les deux formes.' : '');
    $('#sp-T1-calc').textContent = `T₁ = ${virg(Sp.CT[etat.systeme], 3)} × ${etat.H}^¾ = ${virg(Sp.periodeApprochee(etat.H, etat.systeme), 2)} s`;
  }
  function majControles() {
    $('#sp-mw').value = etat.Mw; $('#sp-mw-v').textContent = virg(etat.Mw, 1);
    $('#sp-r').value = etat.R; $('#sp-r-v').textContent = etat.R + ' km';
    $('#sp-xi').value = etat.xi * 100; $('#sp-xi-v').textContent = virg(etat.xi * 100, 0) + ' %';
    $('#sp-t1').value = etat.T1; $('#sp-t1-v').textContent = virg(etat.T1, 2) + ' s';
    $('#sp-h').value = etat.H; $('#sp-h-v').textContent = etat.H + ' m';
    $('#sp-ag').value = etat.agImpose; $('#sp-ag-v').textContent = virg(etat.agImpose, 2) + ' g';
    $('#sp-champ-ag').hidden = etat.calage !== 'imposer';
    $('#sp-systeme').value = etat.systeme;
    $$('[data-sp-type]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.spType === etat.type)));
    $$('[data-sp-sol]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.spSol === etat.sol)));
    $$('[data-sp-calage]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.spCalage === etat.calage)));
    $$('[data-sp-grandeur]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.spGrandeur === etat.grandeur)));
    majBoutons();
  }
  function majBoutons() {
    const b = $('#sp-lecture');
    if (b) b.textContent = etat.lecture ? 'Arrêter' : (etat.dejaJoue ? 'Rejouer le séisme' : 'Jouer le séisme');
    const r = $('#sp-ralenti');
    if (r) r.setAttribute('aria-pressed', String(etat.ralenti));
  }
  function tout() { majControles(); majAfficheurs(); dessinerTable(); dessinerAccelero(); dessinerSpectre(); }

  // ── Événements ──────────────────────────────────────────────────────────
  let attente = 0;
  const occupe = on => { const b = $('#etat-calcul'); b.classList.toggle('calcul', on); b.lastElementChild.textContent = on ? 'Calcul du spectre…' : 'Signal prêt'; };
  const plusTard = fn => { occupe(true); setTimeout(() => { try { fn(); } finally { occupe(false); } }, 30); };
  const planifier = fn => { clearTimeout(attente); attente = setTimeout(() => plusTard(fn), 300); };
  function brancher() {
    $('#sp-mw').addEventListener('input', e => { etat.Mw = parseFloat(e.target.value); majControles(); planifier(regenerer); });
    $('#sp-r').addEventListener('input', e => { etat.R = parseInt(e.target.value, 10); majControles(); planifier(regenerer); });
    $('#sp-xi').addEventListener('input', e => { etat.xi = parseFloat(e.target.value) / 100; majControles(); planifier(recalculer); });
    $('#sp-tirage').addEventListener('click', () => { etat.graine = 1 + Math.floor(Math.random() * 1e5); plusTard(regenerer); });
    $('#sp-t1').addEventListener('input', e => { etat.T1 = parseFloat(e.target.value); majControles(); majAfficheurs(); dessinerSpectre(); });
    $('#sp-h').addEventListener('input', e => { etat.H = parseInt(e.target.value, 10); majControles(); majAfficheurs(); });
    $('#sp-systeme').addEventListener('change', e => { etat.systeme = e.target.value; majAfficheurs(); });
    $('#sp-appliquer').addEventListener('click', () => { etat.T1 = Math.min(4, Math.max(0.05, Math.round(Sp.periodeApprochee(etat.H, etat.systeme) * 100) / 100)); tout(); });
    $('#sp-ag').addEventListener('input', e => { etat.agImpose = parseFloat(e.target.value); majControles(); majAfficheurs(); dessinerSpectre(); });
    $$('[data-sp-type]').forEach(b => b.addEventListener('click', () => { etat.type = +b.dataset.spType; tout(); }));
    $$('[data-sp-sol]').forEach(b => b.addEventListener('click', () => { etat.sol = b.dataset.spSol; tout(); }));
    $$('[data-sp-calage]').forEach(b => b.addEventListener('click', () => { etat.calage = b.dataset.spCalage; tout(); }));
    $$('[data-sp-grandeur]').forEach(b => b.addEventListener('click', () => { etat.grandeur = b.dataset.spGrandeur; majControles(); dessinerSpectre(); }));
    $('#sp-lecture').addEventListener('click', () => { if (etat.lecture) arreter(); else lancer(); });
    $('#sp-ralenti').addEventListener('click', () => { etat.ralenti = !etat.ralenti; majBoutons(); });
    const redessiner = () => { if (etat.final && !$('#banc-spectre').hidden) { dessinerTable(); dessinerAccelero(); dessinerSpectre(); } };
    const ro = new ResizeObserver(redessiner);
    ro.observe($('#sp-table')); ro.observe($('#sp-spectre'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'spectre') return;
    if (!etat.pret) { etat.pret = true; brancher(); majControles(); plusTard(regenerer); }
    else tout();
  });
})();
