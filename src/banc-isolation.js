import Spectre from './sismo/spectre.js';
import Oscillateur from './sismo/oscillateur.js';
import Sismo from './sismo/signal.js';
import Accelero from './sismo/accelerogramme.js';
import Isolation from './sismo/isolation.js';

// src/banc-isolation.js — banc « isolation » : un bâtiment (superstructure à un niveau de période Ts) posé sur des
// isolateurs bilinéaires ; décalage de période et amortissement dans le spectre de l'EN 1998-1:2004, linéarisation
// équivalente par point fixe, boucle de l'isolateur et accélérations de la superstructure, isolée ou sur base fixe,
// sous sept calculs temporels non linéaires. Calcul dans src/sismo/isolation.js (vérifié contre OpenSeesPy).
(() => {
  'use strict';
  const Sp = Spectre, Iso = Isolation, G = Sp.G;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => (Number.isFinite(x) ? String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace(/^-/, '−') : '—');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const cm = x => virg(100 * x, 100 * Math.abs(x) < 10 ? 2 : 1);
  const pc = x => `${virg(100 * x, 1)} %`;

  const NB_ACC = 7, SCENARIOS = { 1: { M: 7, R: 10 }, 2: { M: 6, R: 5 } }, RAPPORT_DALLE = 0.3, XI_S = 0.05;
  const reglagesDefaut = () => ({ Ts: 0.4, ms: 900, Tiso: 2.5, q: 0.05, dy: 0.01, xiV: 0.02, ag: 0.3, sol: 'C', type: 1, graine: 700 });
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), res: null, temps: null, jeton: null, vu: 0, exo: null, verifie: false };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  // ── Calcul ──────────────────────────────────────────────────────────────
  function calculer() {
    const r = etat.r, mb = RAPPORT_DALLE * r.ms, M = r.ms + mb, sp = { type: r.type, sol: r.sol, ag: r.ag };
    const se = (T, xi = 0.05) => Sp.ec8(T, { ...sp, xi }) * G;
    const iso = Iso.isolateur({ M, Tiso: r.Tiso, q: r.q, dy: r.dy }), eq = Iso.deplacementCalcul(iso, { se, xiV: r.xiV });
    const mod = Iso.modele({ ms: r.ms, mb, Ts: r.Ts, xiS: XI_S }, iso, r.xiV);
    etat.res = { sp, se, M, mb, iso, eq, mod, aFixe: se(r.Ts) / G, aIso: eq.F / M / G };
    lancerTemporels();
  }
  function lancerTemporels() {
    const r = etat.r, res = etat.res, jeton = {}, sc = SCENARIOS[r.type], liste = [], w = (2 * Math.PI) / r.Ts;
    // calage en moindres carrés des ln Sa autour de Teff (0,75 à 1,25·Teff), là où travaille l'isolation ; la base fixe
    // reçoit le même mouvement, ce qui rend la comparaison équitable même si sa forme spectrale s'écarte de Se
    const TS = Array.from({ length: 5 }, (_, k) => res.eq.Teff * (0.75 + 0.125 * k));
    etat.jeton = jeton; etat.temps = null;
    const suivant = () => {
      if (etat.jeton !== jeton) return;
      const i = liste.length, x = Accelero.simuler({ M: sc.M, R: sc.R, graine: r.graine + 31 * i });
      const sa = Sp.reponse(x.acc, x.dt, TS, 0.05).Sa, s = Math.exp(TS.reduce((a, T, k) => a + Math.log(res.se(T) / sa[k]), 0) / TS.length);
      const acc = Float64Array.from(x.acc, v => v * s);
      const t = Iso.temporel(res.mod, acc, x.dt);
      // superstructure sur base fixe : oscillateur élastique Ts, ξ = 5 %, accélération absolue −(2ξω·v + ω²·x)
      const sous = Sp.sousPas(x.dt, r.Ts), o = Oscillateur.integrer(Sp.surEchantillonner(acc, sous), x.dt / sous, 1 / r.Ts, XI_S);
      const fixe = Float64Array.from(acc, (_, j) => -(2 * XI_S * w * o.v[j * sous] + w * w * o.x[j * sous]));
      let aFixe = 0;
      for (let j = 0; j < o.x.length; j++) aFixe = Math.max(aFixe, Math.abs(2 * XI_S * w * o.v[j] + w * w * o.x[j]));
      liste.push({ s, dt: x.dt, dIso: t.dIso, fIso: t.fIso, dMax: t.dIsoMax, acc: t.accTete, fixe, aMax: Math.max(...Array.from(t.accTete, Math.abs)), aFixe, residuel: t.residuel[0] });
      $('#is-etat').textContent = liste.length < NB_ACC ? `calculs temporels : ${liste.length} / ${NB_ACC}` : '';
      if (liste.length < NB_ACC) setTimeout(suivant, 0);
      else { etat.temps = liste; etat.vu = Math.min(etat.vu, NB_ACC - 1); tout(); }
    };
    $('#is-etat').textContent = `calculs temporels : 0 / ${NB_ACC}`;
    setTimeout(suivant, 0);
  }
  const moyenne = cle => etat.temps.reduce((a, t) => a + t[cle], 0) / etat.temps.length;

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
  const point = (ctx, x, y, coul, r = 5) => { ctx.fillStyle = coul; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); };

  // Spectres à 5 % et à ξeff : base fixe contre isolé
  function dessinerSpectre() {
    const cv = $('#is-spectre');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, W, H } = preparer(cv), res = etat.res, c = enExercice(), m = { g: 50, d: 14, h: 34, b: 30 }, Tmax = 4;
    const ymax = (res.se(Sp.EC8_2004[res.sp.type][res.sp.sol].TC) / G) * 1.15;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    axes(ctx, X, Y, 0, Tmax, 0, ymax, { fx: v => virg(v, 1), fy: v => virg(v, 2) });
    const courbe = (xi, coul, w, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      for (let i = 0; i <= 400; i++) { const T = (i / 400) * Tmax; (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(T), Y(res.se(T, xi) / G)); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    courbe(0.05, COUL.teal, 2);
    if (!c) courbe(res.eq.xi, COUL.blue, 2.2, [7, 4]);
    const r = etat.r, xF = X(r.Ts), yF = Y(res.aFixe);
    ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xF, yF); ctx.lineTo(xF, Y(0)); ctx.stroke(); ctx.setLineDash([]);
    point(ctx, xF, yF, COUL['pick-p']);
    texte(ctx, `base fixe : Ts = ${virg(r.Ts, 2)} s`, xF + 8, yF - 10, COUL['pick-p'], `700 10.5px ${MONO}`);
    if (!c) {
      const xI = X(res.eq.Teff), yI = Y(res.se(res.eq.Teff, res.eq.xi) / G);
      ctx.strokeStyle = COUL.blue; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xI, yI); ctx.lineTo(xI, Y(0)); ctx.stroke(); ctx.setLineDash([]);
      // flèche du décalage de période
      ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(xF + 6, yF + 6); ctx.quadraticCurveTo((xF + xI) / 2, (yF + yI) / 2 - 40, xI - 6, yI - 6); ctx.stroke();
      point(ctx, xI, yI, COUL.blue);
      texte(ctx, `isolé : Teff = ${virg(res.eq.Teff, 2)} s, ξ = ${pc(res.eq.xi)}`, Math.min(xI, W - 230), yI - 16, COUL.blue, `700 10.5px ${MONO}`);
    }
    texte(ctx, `Se (g) selon T (s) · type ${res.sp.type}, sol ${res.sp.sol}, ag ${virg(res.sp.ag, 2)} g`, m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // Point fixe de la linéarisation équivalente : demande d'(d) face à la droite d' = d, et itérations
  function dessinerPointFixe() {
    const cv = $('#is-pointfixe');
    if (cv.clientWidth < 50 || !etat.res) return;
    if (enExercice()) return message(cv, 'masqué pendant l\'exercice');
    const { ctx, W, H } = preparer(cv), res = etat.res, m = { g: 50, d: 14, h: 34, b: 30 }, iso = res.iso, r = etat.r;
    const demande = d => { const e = Iso.equivalent(iso, d, r.xiV); return res.se(e.Teff, e.xi) * (e.Teff / (2 * Math.PI)) ** 2; };
    const xmax = 100 * Math.max(2 * res.eq.d, ...res.eq.etapes.map(e => e.d * 1.1));
    const ymax = Math.max(xmax, ...Array.from({ length: 50 }, (_, i) => 100 * demande(((i + 1) / 50) * xmax / 100))) * 1.05;
    const X = v => m.g + (v / xmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    axes(ctx, X, Y, 0, xmax, 0, ymax, { fx: v => virg(v, 0), fy: v => virg(v, 0) });
    ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(Math.min(xmax, ymax)), Y(Math.min(xmax, ymax))); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 1; i <= 200; i++) { const d = (i / 200) * xmax / 100; (i > 1 ? ctx.lineTo : ctx.moveTo).call(ctx, X(100 * d), Y(100 * demande(d))); }
    ctx.stroke();
    // escalier des itérations
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.2; ctx.beginPath();
    res.eq.etapes.slice(0, 30).forEach((e, k) => { const x = X(100 * e.d), y = Y(100 * e.suivant); if (!k) ctx.moveTo(x, Y(100 * e.d)); ctx.lineTo(x, y); ctx.lineTo(X(100 * e.suivant), y); });
    ctx.stroke();
    point(ctx, X(100 * res.eq.d), Y(100 * res.eq.d), COUL['pick-p']);
    const droite = X(100 * res.eq.d) > W / 2;
    texte(ctx, `d = ${cm(res.eq.d)} cm`, X(100 * res.eq.d) + (droite ? -9 : 9), Y(100 * res.eq.d) - 14, COUL['pick-p'], `700 10.5px ${MONO}`, droite ? 'right' : 'left');
    texte(ctx, 'demande selon d supposé (cm)', m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // Boucle force–déplacement de l'isolateur
  function dessinerBoucle() {
    const cv = $('#is-boucle');
    if (cv.clientWidth < 50 || !etat.res) return;
    if (!etat.temps) return message(cv, 'calculs temporels en cours…');
    const { ctx, W, H } = preparer(cv), res = etat.res, t = etat.temps[etat.vu], iso = res.iso, c = enExercice(), m = { g: 56, d: 14, h: 34, b: 30 };
    const dm = Math.max(t.dMax, c ? 0 : res.eq.d) * 1.15, fm = (iso.Q + iso.K2 * dm) * 1.1;
    const X = v => m.g + ((v + dm) / (2 * dm)) * (W - m.g - m.d), Y = v => m.h + (1 - (v + fm) / (2 * fm)) * (H - m.h - m.b);
    axes(ctx, v => X(v / 100), Y, -100 * dm, 100 * dm, -fm, fm, { fx: v => virg(v, 0), fy: v => milliers(v), nx: 6 });
    // enveloppe bilinéaire et raideur sécante au déplacement de calcul
    ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); ctx.beginPath();
    for (const s of [-1, 1]) { ctx.moveTo(X(s * iso.dy), Y(s * iso.Fy)); ctx.lineTo(X(s * dm), Y(s * (iso.Q + iso.K2 * dm))); }
    ctx.moveTo(X(-iso.dy), Y(-iso.Fy)); ctx.lineTo(X(iso.dy), Y(iso.Fy)); ctx.stroke(); ctx.setLineDash([]);
    if (!c) {
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(-res.eq.d), Y(-res.eq.F)); ctx.lineTo(X(res.eq.d), Y(res.eq.F)); ctx.stroke();
      point(ctx, X(res.eq.d), Y(res.eq.F), COUL['pick-p'], 4.5);
    }
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < t.dIso.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(t.dIso[i]), Y(t.fIso[i]));
    ctx.stroke();
    texte(ctx, `effort (kN) — déplacement (cm) · n° ${etat.vu + 1}`, m.g, 15, COUL.ink, `800 12px ${POLICE}`);
  }

  // Déplacement de l'isolateur et accélération de la superstructure au cours du temps
  function dessinerTemps() {
    const cv = $('#is-temps');
    if (cv.clientWidth < 50 || !etat.res) return;
    if (!etat.temps) return message(cv, 'calculs temporels en cours…');
    const { ctx, W, H } = preparer(cv), res = etat.res, t = etat.temps[etat.vu], c = enExercice(), n = t.acc.length, duree = (n - 1) * t.dt;
    const zones = [[0, H * 0.45], [H * 0.45, H * 0.55]], m = { g: 50, d: 14, h: 30, b: 26 };
    const trace = (vals, X, Y, coul, w) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.beginPath();
      const saut = Math.max(1, Math.floor(n / (2 * (W - m.g - m.d))));
      for (let i = 0; i < n; i += saut) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i * t.dt), Y(vals[i]));
      ctx.stroke();
    };
    // déplacement de l'isolateur
    {
      const [y0, Hz] = zones[0], ymax = 100 * Math.max(t.dMax, c ? 0 : res.eq.d) * 1.15;
      const X = s => m.g + (s / duree) * (W - m.g - m.d), Y = v => y0 + m.h + ((Hz - m.h - m.b) / 2) * (1 - v / ymax);
      axes(ctx, X, v => (v === -ymax ? y0 + Hz - m.b : Y(v)), 0, duree, -ymax, ymax, { fx: v => virg(v, 0), fy: v => virg(v, 0), ny: 4 });
      if (!c) {
        ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(m.g, Y(s * 100 * res.eq.d)); ctx.lineTo(W - m.d, Y(s * 100 * res.eq.d)); ctx.stroke(); }
        ctx.setLineDash([]);
      }
      trace(Array.from(t.dIso, v => 100 * v), X, Y, COUL.blue, 1.4);
      texte(ctx, `déplacement de l'isolateur (cm) · n° ${etat.vu + 1}`, m.g, y0 + 14, COUL.ink, `800 12px ${POLICE}`);
    }
    // accélérations absolues de la superstructure
    {
      const [y0, Hz] = zones[1], ymax = Math.max(t.aFixe, t.aMax) / G * 1.1;
      const X = s => m.g + (s / duree) * (W - m.g - m.d), Y = v => y0 + m.h + ((Hz - m.h - m.b) / 2) * (1 - v / ymax);
      axes(ctx, X, v => (v === -ymax ? y0 + Hz - m.b : Y(v)), 0, duree, -ymax, ymax, { fx: v => virg(v, 0), fy: v => virg(v, 2), ny: 4 });
      ctx.globalAlpha = 0.7; trace(Array.from(t.fixe, v => v / G), X, Y, COUL['pick-p'], 1); ctx.globalAlpha = 1;
      trace(Array.from(t.acc, v => v / G), X, Y, COUL.blue, 1.4);
      texte(ctx, `accélération (g) · fixe ${virg(t.aFixe / G, 2)} · isolée ${virg(t.aMax / G, 2)}`, m.g, y0 + 14, COUL.ink, `800 12px ${POLICE}`);
      texte(ctx, 'temps (s)', W - m.d - 4, y0 + Hz - m.b - 10, COUL.muted, `10.5px ${MONO}`, 'right');
    }
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const res = etat.res, c = enExercice(), e = res.eq, ok = !!etat.temps;
    $('#is-afficheurs').innerHTML = [
      afficheur('Teff', c ? '—' : `${virg(e.Teff, 2)} s`, c ? 'à calculer' : `Tiso = ${virg(res.iso.Tiso, 2)} s, Ts = ${virg(etat.r.Ts, 2)} s`),
      afficheur('ξeff', c ? '—' : pc(e.xi), c ? 'à calculer' : `η = ${virg(Sp.eta(e.xi), 3)}`),
      afficheur('d de calcul', c ? '—' : `${cm(e.d)} cm`, c ? 'à calculer' : `${e.etapes.length} itérations`),
      afficheur('Temporels : d', ok ? `${cm(moyenne('dMax'))} cm` : '…', ok ? `moyenne de ${NB_ACC}` : 'en cours'),
      afficheur('Accélération isolée', ok ? `${virg(moyenne('aMax') / G, 3)} g` : '…', c ? 'temporels' : `linéaire équivalent : ${virg(res.aIso, 3)} g`),
      afficheur('Base fixe', ok ? `${virg(moyenne('aFixe') / G, 3)} g` : '…', `Se(Ts) = ${virg(res.aFixe, 3)} g`),
    ].join('');
  }
  function majTables() {
    const res = etat.res, c = enExercice(), e = res.eq;
    const montrer = e.etapes.length <= 8 ? e.etapes : [...e.etapes.slice(0, 6), null, e.etapes[e.etapes.length - 1]];
    $('#is-iter-table').innerHTML = c ? '<tbody><tr><td>masqué pendant l\'exercice</td></tr></tbody>'
      : `<thead><tr><th>k</th><th>d (cm)</th><th>Keff (kN/m)</th><th>Teff (s)</th><th>ξeff</th><th>demande (cm)</th></tr></thead><tbody>${montrer.map((x, k) => x === null
        ? '<tr><td class="n">…</td><td></td><td></td><td></td><td></td><td></td></tr>'
        : `<tr><td class="n">${k === montrer.length - 1 ? e.etapes.length : k + 1}</td><td class="n">${cm(x.d)}</td><td class="n">${milliers(x.Keff)}</td><td class="n">${virg(x.Teff, 3)}</td><td class="n">${pc(x.xi)}</td><td class="n">${cm(x.suivant)}</td></tr>`).join('')}</tbody>`;
    const t = etat.temps;
    if (!t) { $('#is-temps-table').innerHTML = '<tbody><tr><td>calculs en cours…</td></tr></tbody>'; $('#is-temps-info').textContent = ''; return; }
    $('#is-temps-table').innerHTML = `<thead><tr><th>n°</th><th>facteur</th><th>d max (cm)</th><th>a isolée (g)</th><th>a base fixe (g)</th></tr></thead><tbody>${t.map((x, i) =>
      `<tr class="${i === etat.vu ? 'vu' : ''}" data-is-vu="${i}" tabindex="0"><td class="n">${i + 1}</td><td class="n">×${virg(x.s, 2)}</td><td class="n">${cm(x.dMax)}</td><td class="n">${virg(x.aMax / G, 3)}</td><td class="n">${virg(x.aFixe / G, 3)}</td></tr>`).join('')}</tbody>`;
    $$('[data-is-vu]').forEach(tr => {
      const choisir = () => { etat.vu = +tr.dataset.isVu; majTables(); dessinerBoucle(); dessinerTemps(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choisir(); } });
    });
    $('#is-temps-info').textContent = `Accélérogrammes calés sur Se à 5 % de 0,75 à 1,25·Teff ; la base fixe reçoit le même mouvement. Rapport d temporel / d de calcul : ${c ? '—' : virg(moyenne('dMax') / e.d, 2)} ; accélération divisée par ${virg(moyenne('aFixe') / moyenne('aMax'), 1)}.`;
  }
  function majControles() {
    const r = etat.r;
    $('#is-ts').value = r.Ts; $('#is-ts-v').textContent = `${virg(r.Ts, 2)} s`;
    $('#is-ms').value = r.ms; $('#is-ms-v').textContent = `${milliers(r.ms)} t`;
    $('#is-tiso').value = r.Tiso; $('#is-tiso-v').textContent = `${virg(r.Tiso, 1)} s`;
    $('#is-q').value = r.q; $('#is-q-v').textContent = pc(r.q);
    $('#is-dy').value = r.dy; $('#is-dy-v').textContent = `${virg(100 * r.dy, 1)} cm`;
    $('#is-xiv').value = r.xiV; $('#is-xiv-v').textContent = pc(r.xiV);
    $('#is-ag').value = r.ag; $('#is-ag-v').textContent = `${virg(r.ag, 2)} g`;
    $$('[data-is-sol]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.isSol === r.sol)));
    $$('[data-is-type]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.isType === r.type)));
  }
  function tout() {
    if (!COUL.paper || !etat.res) return;
    majControles(); majAfficheurs(); majTables();
    dessiner();
  }
  function dessiner() { dessinerSpectre(); dessinerPointFixe(); dessinerBoucle(); dessinerTemps(); }
  function recalculer() { calculer(); tout(); }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 120); };

  // ── Exercice : une itération de la linéarisation équivalente ─────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 59), sols = ['A', 'B', 'C', 'D'];
    const r = { ...reglagesDefaut(), Ts: Math.round(u.entre(0.2, 0.8) * 20) / 20, ms: 100 * Math.round(u.entre(400, 2000) / 100), Tiso: Math.round(u.entre(2, 3.5) * 10) / 10,
      q: Math.round(u.entre(0.02, 0.08) * 200) / 200, dy: Math.round(u.entre(0.5, 2) * 2) / 200, xiV: 0.02, sol: sols[Math.floor(u() * 4)], ag: Math.round(u.entre(0.15, 0.4) * 100) / 100, graine: numero };
    etat.r = r; etat.verifie = false;
    recalculer();
    // déplacement supposé : une valeur ronde autour de la solution
    etat.exo = { numero, d: Math.max(2 * r.dy, Math.round(etat.res.eq.d * u.entre(0.6, 1.5) * 100) / 100) };
    $('#is-exo-num').textContent = 'Exercice n° ' + numero;
    for (const id of ['#is-r-keff', '#is-r-xi', '#is-r-teff', '#is-r-d']) $(id).value = '';
    $('#is-corrige').innerHTML = '';
    const res = etat.res, iso = res.iso;
    $('#is-exo-donnees').innerHTML = `<div class="table-defile"><table class="resultats"><tbody>
      ${[['Masse portée M', `${milliers(res.M)} t`], ['Raideur post-élastique K2', `${milliers(iso.K2)} kN/m`], ['Résistance caractéristique Q', `${milliers(iso.Q)} kN`], ['Déplacement de plastification dy', `${virg(100 * iso.dy, 1)} cm`],
        ['Viscosité ξv', pc(r.xiV)], ['Spectre', `type ${r.type}, sol ${r.sol}, ag = ${virg(r.ag, 2)} g`], ['Déplacement supposé d', `<b>${virg(100 * etat.exo.d, 0)} cm</b>`]]
        .map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join('')}</tbody></table></div>`;
    tout();
  }
  function verifier() {
    const res = etat.res, e = Iso.equivalent(res.iso, etat.exo.d, etat.r.xiV), dn = res.se(e.Teff, e.xi) * (e.Teff / (2 * Math.PI)) ** 2;
    const lu = id => parseFloat(String($(id).value).replace(',', '.').replace(/\s/g, ''));
    const k = lu('#is-r-keff'), xi = lu('#is-r-xi'), T = lu('#is-r-teff'), d = lu('#is-r-d');
    const okK = Math.abs(k / e.Keff - 1) <= 0.02, okX = Math.abs(xi / (100 * e.xi) - 1) <= 0.05, okT = Math.abs(T / e.Teff - 1) <= 0.02, okD = Math.abs(d / (100 * dn) - 1) <= 0.05;
    etat.verifie = true;
    const lignes = [
      ['Keff (kN/m)', Number.isFinite(k) ? milliers(k) : '—', milliers(e.Keff), okK, `± 2 % : (Q + K2·d)/d, F = ${milliers(e.F)} kN`],
      ['ξeff (%)', Number.isFinite(xi) ? virg(xi, 1) : '—', virg(100 * e.xi, 1), okX, `± 5 % : ξv + 4Q(d − dy)/(2π·Keff·d²)`],
      ['Teff (s)', Number.isFinite(T) ? virg(T, 3) : '—', virg(e.Teff, 3), okT, '± 2 % : 2π·√(M/Keff)'],
      ['Demande (cm)', Number.isFinite(d) ? virg(d, 1) : '—', cm(dn), okD, `± 5 % : η·Se(Teff)·(Teff/2π)², η = ${virg(Sp.eta(e.xi), 3)}`],
    ];
    $('#is-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([t, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${t}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 4 justes</p>
      <p class="verite">La demande ${dn > etat.exo.d ? 'dépasse' : 'est inférieure à'} le déplacement supposé : on recommence avec ${cm(dn)} cm, jusqu'au point fixe
      d = ${cm(res.eq.d)} cm (${res.eq.etapes.length} itérations, graphique et tableau ci-contre).</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#is-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#is-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#is-panneau-explorer').hidden = m !== 'explorer';
    $('#is-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; recalculer(); }
  }

  // ── Événements ──────────────────────────────────────────────────────────
  function brancher() {
    const curseur = (id, cle, f = parseFloat) => $(id).addEventListener('input', e => { etat.r[cle] = f(e.target.value); majControles(); planifier(); });
    curseur('#is-ts', 'Ts'); curseur('#is-ms', 'ms'); curseur('#is-tiso', 'Tiso'); curseur('#is-q', 'q'); curseur('#is-dy', 'dy'); curseur('#is-xiv', 'xiV'); curseur('#is-ag', 'ag');
    $$('[data-is-sol]').forEach(b => b.addEventListener('click', () => { etat.r.sol = b.dataset.isSol; recalculer(); }));
    $$('[data-is-type]').forEach(b => b.addEventListener('click', () => { etat.r.type = +b.dataset.isType; recalculer(); }));
    $('#is-tirage').addEventListener('click', () => { etat.r.graine = 1 + Math.floor(Math.random() * 1e6); recalculer(); });
    $('#is-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#is-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#is-verifier').addEventListener('click', verifier);
    $('#is-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-isolation').hidden) { lireCouleurs(); dessiner(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#is-spectre', '#is-pointfixe', '#is-boucle', '#is-temps']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'isolation') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); majControles(); setTimeout(recalculer, 30); }
    else tout();
  });
})();
