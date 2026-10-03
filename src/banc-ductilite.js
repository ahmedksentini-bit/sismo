import Spectre from './sismo/spectre.js';
import Sismo from './sismo/signal.js';
import Accelero from './sismo/accelerogramme.js';
import Inelastique from './sismo/inelastique.js';

// src/banc-ductilite.js — banc « ductilité » : un oscillateur élastoplastique de période T, de résistance
// Se(T)/R, soumis à sept accélérogrammes calés sur le spectre de l'EN 1998-1:2004 à T ; boucle d'hystérésis,
// spectres de ductilité à résistance constante face aux règles R-μ-T, et déplacement cible de la méthode N2
// (annexe B) face à la moyenne des calculs temporels. Calcul dans src/sismo/inelastique.js (vérifié contre
// OpenSeesPy).
(() => {
  'use strict';
  const Sp = Spectre, I = Inelastique, G = Sp.G;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const cm = x => virg(100 * x, 100 * x < 1 ? 2 : 1);

  const SCENARIOS = [{ M: 5.5, R: 10 }, { M: 6.5, R: 20 }, { M: 7.2, R: 40 }];
  const N = 7, TS = Sp.periodes(22, 0.05, 3);
  const reglagesDefaut = () => ({ T: 0.5, R: 3, alpha: 0, ag: 0.25, sol: 'A', scenario: 1, graine: 1000 });
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), jeu: null, cleJeu: null, mu: null, cleMu: null, res: null, vu: 0, exo: null, verifie: false };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;
  const TC = () => Sp.EC8_2004[1][etat.r.sol].TC;
  const se = T => Sp.ec8(T, { type: 1, sol: etat.r.sol, ag: etat.r.ag }) * G; // m/s²

  // ── Calcul ──────────────────────────────────────────────────────────────
  function jeu() {
    const r = etat.r, cle = `${r.scenario}|${r.graine}`;
    if (etat.cleJeu !== cle) {
      const s = SCENARIOS[r.scenario];
      etat.jeu = Array.from({ length: N }, (_, i) => Accelero.simuler({ M: s.M, R: s.R, graine: r.graine + 17 * i })).map(x => ({ acc: x.acc, dt: x.dt }));
      etat.cleJeu = cle; etat.cleMu = null;
    }
    return etat.jeu;
  }
  function calculer() {
    const r = etat.r, j = jeu(), seT = se(r.T), saY = seT / r.R;
    // chaque accélérogramme est mis à l'échelle pour que Sa(T) = Se(T)
    const calcs = j.map(x => {
      const s = seT / I.saElastique(x.acc, x.dt, r.T), acc = Float64Array.from(x.acc, v => v * s);
      return { s, acc, dt: x.dt, ...I.integrer(acc, x.dt, { T: r.T, xi: 0.05, fy: saY, alpha: r.alpha }) };
    });
    const n2 = I.n2({ T: r.T, saY, se: seT, TC: TC() });
    etat.res = { seT, saY, calcs, n2, moyenne: calcs.reduce((a, c) => a + c.umax, 0) / calcs.length, muMoy: calcs.reduce((a, c) => a + c.mu, 0) / calcs.length };
    // spectres de ductilité (indépendants de T, ag et du sol : R est relatif à chaque enregistrement)
    const cleMu = `${etat.cleJeu}|${r.R}|${r.alpha}`;
    if (etat.cleMu !== cleMu) {
      etat.mu = j.map(x => TS.map(T => I.ductiliteR(x.acc, x.dt, T, r.R, { alpha: r.alpha })));
      etat.cleMu = cleMu;
    }
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
  const pas = (max, n = 5) => [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find(p => max / p <= n) || 100;
  function axes(ctx, W, H, m, X, Y, xmax, ymax, { xmin = 0, ymin = 0, fx = v => virg(v, 1), fy = v => virg(v, 2) } = {}) {
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    const px = pas(xmax - xmin), py = pas(ymax - ymin);
    for (let v = Math.ceil(xmin / px) * px; v <= xmax + 1e-9; v += px) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(fx(v), x, H - m.b + 5); }
    for (let v = Math.ceil(ymin / py) * py; v <= ymax + 1e-9; v += py) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fy(v), m.g - 6, y); }
  }

  // Boucle force–déplacement et déplacement au cours du temps de l'enregistrement affiché
  function dessinerHysteresis() {
    const cv = $('#du-hyst');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, c = res.calcs[etat.vu], etroit = W < 600;
    const largeur = etroit ? W : W * 0.42, m = { g: 50, d: 12, h: 30, b: 30 };
    // boucle
    const umax = Math.max(c.umax, c.uy) * 1.15, fmax = Math.max(...Array.from(c.f, Math.abs), res.saY) * 1.2;
    const hauteur = etroit ? H * 0.5 : H, X = u => m.g + ((u + umax) / (2 * umax)) * (largeur - m.g - m.d), Y = f => m.h + (1 - (f + fmax) / (2 * fmax)) * (hauteur - m.h - m.b);
    // axes gradués en cm et en g
    axes(ctx, largeur, hauteur, m, v => X(v / 100), v => Y(v * G), umax * 100, fmax / G, { xmin: -umax * 100, ymin: -fmax / G, fx: v => virg(v, 1), fy: v => virg(v, 2) });
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < c.u.length; i += 1) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(c.u[i]), Y(c.f[i]));
    ctx.stroke();
    ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(s * c.uy), m.h); ctx.lineTo(X(s * c.uy), hauteur - m.b); ctx.stroke(); }
    ctx.setLineDash([]);
    texte(ctx, `force / masse (g) — déplacement (cm) · μ = ${virg(c.mu, 2)}`, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    // déplacement au cours du temps
    const x0 = etroit ? 0 : largeur, y0 = etroit ? hauteur : 0, W2 = etroit ? W : W - largeur, H2 = etroit ? H - hauteur : H, m2 = { g: 50, d: 14, h: 30, b: 30 };
    const n = c.u.length, duree = n * c.dt, Xt = t => x0 + m2.g + (t / duree) * (W2 - m2.g - m2.d), Yt = u => y0 + m2.h + (1 - (u + umax) / (2 * umax)) * (H2 - m2.h - m2.b);
    ctx.strokeStyle = COUL.grid; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let t = 0; t <= duree; t += duree > 40 ? 10 : 5) { const x = Math.round(Xt(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, y0 + m2.h); ctx.lineTo(x, y0 + H2 - m2.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(t), x, y0 + H2 - m2.b + 5); }
    for (const u of [-umax / 1.15, 0, umax / 1.15]) { const y = Math.round(Yt(u)) + 0.5; ctx.beginPath(); ctx.moveTo(x0 + m2.g, y); ctx.lineTo(x0 + W2 - m2.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(100 * u, 1), x0 + m2.g - 6, y); }
    ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x0 + m2.g, Yt(s * c.uy)); ctx.lineTo(x0 + W2 - m2.d, Yt(s * c.uy)); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1.2; ctx.beginPath();
    const saut = Math.max(1, Math.floor(n / (W2 - m2.g)));
    for (let i = 0; i < n; i += saut) (i ? ctx.lineTo : ctx.moveTo).call(ctx, Xt(i * c.dt), Yt(c.u[i]));
    ctx.stroke();
    texte(ctx, `u(t) (cm) · n° ${etat.vu + 1}, ×${virg(c.s, 2)} · résiduel ${cm(Math.abs(c.residuel))} cm`, x0 + m2.g, y0 + 14, COUL.ink, `800 12px ${POLICE}`);
  }

  function dessinerDuctilite() {
    const cv = $('#du-mu');
    if (cv.clientWidth < 50 || !etat.mu) return;
    const { ctx, W, H } = preparer(cv), m = { g: 44, d: 14, h: 30, b: 30 }, R = etat.r.R, tc = TC();
    const moy = TS.map((_, k) => etat.mu.reduce((a, v) => a + v[k], 0) / etat.mu.length);
    const ymax = Math.min(30, Math.max(R * 2, ...moy) * 1.1), Tmax = 3;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (Math.min(v, ymax) / ymax) * (H - m.h - m.b);
    axes(ctx, W, H, m, X, Y, Tmax, ymax, { fx: v => virg(v, 1), fy: v => virg(v, 0) });
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    const courbe = (vals, coul, w, tirets, Tv = TS) => { ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath(); Tv.forEach((T, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, X(T), Y(vals[k]))); ctx.stroke(); ctx.setLineDash([]); };
    ctx.globalAlpha = 0.45; etat.mu.forEach(v => courbe(v, COUL.muted, 1)); ctx.globalAlpha = 1;
    const fin = Array.from({ length: 121 }, (_, i) => 0.05 + (i * (Tmax - 0.05)) / 120);
    courbe(fin.map(() => R), COUL.teal, 1.8, [6, 4], fin);
    courbe(fin.map(T => I.regles.n2(R, T, tc)), COUL['pick-p'], 2, [8, 4], fin);
    courbe(moy, COUL.blue, 2.6);
    ctx.strokeStyle = COUL.ink; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(etat.r.T), m.h + 16); ctx.lineTo(X(etat.r.T), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    texte(ctx, `ductilité demandée μ pour R = ${virg(R, 1)} (résistance Sa,él/R) · TC = ${virg(tc, 2)} s`, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    texte(ctx, 'période T (s)', W - m.d - 4, m.h + 9, COUL.muted, `10.5px ${MONO}`, 'right');
  }

  // Méthode N2 en format accélération–déplacement (ADRS)
  function dessinerN2() {
    const cv = $('#du-n2');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), m = { g: 50, d: 14, h: 30, b: 30 }, res = etat.res, n2 = res.n2, r = etat.r, tc = TC(), cache = enExercice();
    const Tl = Array.from({ length: 200 }, (_, i) => 0.02 + (i * 3.5) / 199), sd = (sa, T) => sa * (T / (2 * Math.PI)) ** 2;
    const dmax = Math.max(n2.dt, res.moyenne, ...res.calcs.map(c => c.umax), sd(se(r.T), r.T)) * 1.4, amax = Math.max(...Tl.map(se)) * 1.1;
    const X = d => m.g + (d / dmax) * (W - m.g - m.d), Y = a => H - m.b - (a / amax) * (H - m.h - m.b);
    axes(ctx, W, H, m, v => X(v / 100), v => Y(v * G), dmax * 100, amax / G, { fx: v => virg(v, 1), fy: v => virg(v, 2) });
    const Xc = d => X(d), Yg = a => Y(a);
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    // spectre élastique et spectre inélastique de la ductilité N2
    const tracer = (pts, coul, w, tirets) => { ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath(); pts.forEach(([d, a], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, Xc(d), Yg(a))); ctx.stroke(); ctx.setLineDash([]); };
    tracer(Tl.map(T => [sd(se(T), T), se(T)]), COUL.teal, 2);
    const mu = Math.max(1, n2.mu), Rmu = T => (T < tc ? (mu - 1) * (T / tc) + 1 : mu);
    if (!cache) tracer(Tl.map(T => [(mu / Rmu(T)) * sd(se(T), T), se(T) / Rmu(T)]), COUL.teal, 1.4, [6, 4]);
    // droite de la période T et courbe de capacité élastique parfaitement plastique
    tracer([[0, 0], [sd(se(r.T), r.T), se(r.T)]], COUL.muted, 1, [3, 3]);
    tracer([[0, 0], [n2.dy, res.saY], [dmax, res.saY]], COUL.ink, 2.2);
    // calculs temporels
    ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.5;
    res.calcs.forEach(c => { ctx.beginPath(); ctx.arc(Xc(c.umax), Yg(res.saY), 4, 0, 2 * Math.PI); ctx.fill(); });
    ctx.globalAlpha = 1;
    if (!cache) {
      ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(Xc(res.moyenne), Yg(res.saY) - 12); ctx.lineTo(Xc(res.moyenne), Yg(res.saY) + 12); ctx.stroke();
      ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.moveTo(Xc(n2.dt), Yg(res.saY) - 9); ctx.lineTo(Xc(n2.dt) + 8, Yg(res.saY) + 6); ctx.lineTo(Xc(n2.dt) - 8, Yg(res.saY) + 6); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    texte(ctx, 'Sa (g) — Sd (cm) · EN 1998-1:2004, annexe B', m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    if (!cache) texte(ctx, `N2 : d*t = ${cm(n2.dt)} cm · calculs temporels : ${cm(res.moyenne)} cm en moyenne`, W - m.d, H - m.b - 12, COUL['pick-p'], `800 11.5px ${POLICE}`, 'right');
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const res = etat.res, n2 = res.n2, c = enExercice();
    $('#du-afficheurs').innerHTML = [
      afficheur('Se(T)', `${virg(res.seT / G, 3)} g`, `sol ${etat.r.sol}, type 1, ag ${virg(etat.r.ag, 2)} g`),
      afficheur('Résistance', `${virg(res.saY / G, 3)} g`, `Se(T)/R, R = ${virg(etat.r.R, 1)}`),
      afficheur('N2 : d*t', c ? '—' : `${cm(n2.dt)} cm`, c ? 'à calculer' : `${n2.regle}, μ = ${virg(n2.mu, 2)}`),
      afficheur('Calculs temporels', `${cm(res.moyenne)} cm`, `moyenne de ${N}, μ moyen ${virg(res.muMoy, 2)}`),
      afficheur('d*e élastique', c ? '—' : `${cm(n2.de)} cm`, `T = ${virg(etat.r.T, 2)} s, TC = ${virg(TC(), 2)} s`),
      afficheur('N2 / temporel', c ? '—' : virg(n2.dt / res.moyenne, 2), 'rapport des déplacements'),
    ].join('');
    $('#du-table').innerHTML = `<thead><tr><th>n°</th><th>facteur</th><th>umax (cm)</th><th>μ</th></tr></thead><tbody>${res.calcs.map((x, i) =>
      `<tr class="${i === etat.vu ? 'vu' : ''}" data-du-vu="${i}" tabindex="0"><td class="n">${i + 1}</td><td class="n">×${virg(x.s, 2)}</td><td class="n">${cm(x.umax)}</td><td class="n">${virg(x.mu, 2)}</td></tr>`).join('')}</tbody>`;
    $$('[data-du-vu]').forEach(tr => {
      const choisir = () => { etat.vu = +tr.dataset.duVu; majAfficheurs(); dessinerHysteresis(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    });
  }
  function majControles() {
    const r = etat.r;
    $('#du-t').value = Math.log10(r.T); $('#du-t-v').textContent = `${virg(r.T, 2)} s`;
    $('#du-r').value = r.R; $('#du-r-v').textContent = virg(r.R, 1);
    $('#du-alpha').value = r.alpha; $('#du-alpha-v').textContent = `${virg(100 * r.alpha, 0)} %`;
    $('#du-ag').value = r.ag; $('#du-ag-v').textContent = `${virg(r.ag, 2)} g`;
    $$('[data-du-sol]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.duSol === r.sol)));
    $$('[data-du-scenario]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.duScenario === r.scenario)));
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majAfficheurs();
    dessinerHysteresis(); dessinerDuctilite(); dessinerN2();
  }
  function recalculer() { calculer(); tout(); }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 120); };

  // ── Exercice : déplacement cible N2 ─────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 31);
    const sols = ['A', 'B', 'C', 'D'];
    etat.r = { ...reglagesDefaut(), T: Math.round(u.entre(0.15, 1.5) * 100) / 100, R: Math.round(u.entre(1.5, 5) * 10) / 10, ag: Math.round(u.entre(0.1, 0.35) * 100) / 100, sol: sols[Math.floor(u() * 4)], graine: numero };
    etat.verifie = false; etat.rep = null;
    $('#du-exo-num').textContent = 'Exercice n° ' + numero;
    $('#du-r-qu').value = ''; $('#du-r-dt').value = ''; $('#du-corrige').innerHTML = '';
    $$('[data-du-rep]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    recalculer();
    const res = etat.res;
    $('#du-exo-donnees').innerHTML = `<div class="table-defile"><table class="resultats"><tbody>
      ${[['T*', `${virg(etat.r.T, 2)} s`], ['TC', `${virg(TC(), 2)} s`], ['Se(T*)', `${virg(res.seT / G, 3)} g`], ['Fy*/m*', `${virg(res.saY / G, 3)} g`]].map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function verifier() {
    const n2 = etat.res.n2, lu = id => parseFloat(String($(id).value).replace(',', '.'));
    const q = lu('#du-r-qu'), d = lu('#du-r-dt');
    const okQ = Math.abs(q / n2.qu - 1) <= 0.02, okD = Math.abs(d / (100 * n2.dt) - 1) <= 0.05, okR = etat.rep === n2.regle;
    etat.verifie = true;
    const lignes = [
      ['qu', Number.isFinite(q) ? virg(q, 2) : '—', virg(n2.qu, 2), okQ, '± 2 % : Se(T*)·m*/Fy*'],
      ['d*t (cm)', Number.isFinite(d) ? virg(d, 2) : '—', cm(n2.dt), okD, '± 5 % : d*e = Se(T*)(T*/2π)², puis la règle'],
      ['Règle', etat.rep || '—', n2.regle, okR, 'T* ≥ TC : égaux déplacements ; T* < TC : (d*e/qu)(1 + (qu − 1)TC/T*)'],
    ];
    $('#du-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">Les ${N} calculs temporels donnent ${cm(etat.res.moyenne)} cm en moyenne : la méthode N2 en donne ${virg((100 * n2.dt) / (100 * etat.res.moyenne), 2)} fois autant.</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#du-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#du-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#du-panneau-explorer').hidden = m !== 'explorer';
    $('#du-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; recalculer(); }
  }

  function brancher() {
    $('#du-t').addEventListener('input', e => { etat.r.T = Math.round(Math.pow(10, parseFloat(e.target.value)) * 100) / 100; majControles(); planifier(); });
    $('#du-r').addEventListener('input', e => { etat.r.R = parseFloat(e.target.value); majControles(); planifier(); });
    $('#du-alpha').addEventListener('input', e => { etat.r.alpha = parseFloat(e.target.value); majControles(); planifier(); });
    $('#du-ag').addEventListener('input', e => { etat.r.ag = parseFloat(e.target.value); majControles(); planifier(); });
    $$('[data-du-sol]').forEach(b => b.addEventListener('click', () => { etat.r.sol = b.dataset.duSol; recalculer(); }));
    $$('[data-du-scenario]').forEach(b => b.addEventListener('click', () => { etat.r.scenario = +b.dataset.duScenario; recalculer(); }));
    $('#du-tirage').addEventListener('click', () => { etat.r.graine = 1 + Math.floor(Math.random() * 1e6); recalculer(); });
    $('#du-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#du-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $$('[data-du-rep]').forEach(b => b.addEventListener('click', () => { etat.rep = b.dataset.duRep; $$('[data-du-rep]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $('#du-verifier').addEventListener('click', verifier);
    $('#du-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-ductilite').hidden && etat.res) { lireCouleurs(); tout(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#du-hyst', '#du-mu', '#du-n2']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'ductilite') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); setTimeout(recalculer, 30); }
    else tout();
  });
})();
