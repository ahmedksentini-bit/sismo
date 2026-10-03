import Sismo from '../sismo/signal.js';
import Questions01 from './questions-01.js';
import { monterQuiz } from './quiz.js';

// src/cours/lecon-01.js — figures à manipuler de la leçon 1 : sismogramme trois composantes d'un séisme de
// magnitude 4 à la distance choisie (ondes P, S et de surface repérées, distance déduite de S − P), et calcul de la
// magnitude locale. Le signal vient du générateur des bancs (Sismo.generer), sans bruit.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const virg = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const COUL = {};
  const lireCouleurs = () => {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'teal', 'muted', 'ink', 'paper']) COUL[k] = cs.getPropertyValue('--' + k).trim();
  };
  function preparer(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }
  function texte(ctx, t, x, y, coul, police, align = 'left') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }

  // ── Figure 1 : le sismogramme ────────────────────────────────────────────
  const fig1 = { ev: null, delta: 60 };
  function generer() {
    fig1.ev = Sismo.generer({ Mw: 4, delta: fig1.delta, h: 10, baz: 40, graine: 11 });
  }
  function dessinerSismo() {
    const cv = $('#fig-sismo');
    if (!cv || cv.clientWidth < 50 || !fig1.ev) return;
    const { ctx, W, H } = preparer(cv), ev = fig1.ev, tt = ev.tt, m = { g: 34, d: 12, h: 10, b: 26 };
    // fenêtre : 10 s avant P, jusqu'après S (et les ondes de surface quand elles sont visibles)
    const debut = tt.tP - 10, fin = Math.min(ev.t0 + ev.n * ev.dt, Math.max(tt.tSg + 25, fig1.delta > 40 ? tt.tLR + 20 : 0));
    const X = t => m.g + ((t - debut) / (fin - debut)) * (W - m.g - m.d);
    const voies = [['Z', 'verticale (Z)'], ['N', 'nord–sud (N)'], ['E', 'est–ouest (E)']], hv = (H - m.h - m.b) / voies.length;
    // graduations du temps, comptées depuis le début de la fenêtre
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const pasT = fin - debut > 80 ? 20 : 10;
    for (let s = 0; s <= fin - debut; s += pasT) { const x = Math.round(X(debut + s)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.fillText(`${s} s`, x, H - m.b + 6); }
    let amax = 0;
    const i0 = Math.max(0, Math.round((debut - ev.t0) / ev.dt)), i1 = Math.min(ev.n, Math.round((fin - ev.t0) / ev.dt));
    for (const [c] of voies) for (let i = i0; i < i1; i++) amax = Math.max(amax, Math.abs(ev.vit[c][i]));
    voies.forEach(([c, nom], k) => {
      const y0 = m.h + hv * (k + 0.5), Y = v => y0 - (v / amax) * hv * 0.48;
      ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
      const saut = Math.max(1, Math.floor((i1 - i0) / (2 * (W - m.g - m.d))));
      for (let i = i0; i < i1; i += saut) {
        let lo = ev.vit[c][i], hi = lo;
        for (let j = i; j < Math.min(i1, i + saut); j++) { lo = Math.min(lo, ev.vit[c][j]); hi = Math.max(hi, ev.vit[c][j]); }
        const x = X(ev.t0 + i * ev.dt);
        if (i === i0) ctx.moveTo(x, Y(lo)); else ctx.lineTo(x, Y(lo));
        ctx.lineTo(x, Y(hi));
      }
      ctx.stroke();
      texte(ctx, nom, m.g + 4, y0 - hv * 0.38, COUL.muted, `700 11px ${POLICE}`);
    });
    // repères des arrivées
    const repere = (t, nom, coul) => {
      const x = X(t);
      ctx.strokeStyle = coul; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x, m.h + 12); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.setLineDash([]);
      texte(ctx, nom, x + 4, m.h + 6, coul, `800 12px ${POLICE}`);
    };
    repere(tt.tP, 'P', COUL['pick-p']);
    repere(tt.tSg, 'S', COUL['pick-s']);
    if (fig1.delta > 40) repere(tt.tLR, 'ondes de surface', COUL.teal);
    texte(ctx, 'temps (s)', W - m.d, H - m.b - 8, COUL.muted, `10.5px ${MONO}`, 'right');
    // lecture
    const sp = tt.tSg - tt.tP;
    $('#fig-sismo-lecture').innerHTML = `P à <b>${virg(tt.tP - debut)} s</b> · S à <b>${virg(tt.tSg - debut)} s</b> · S − P = <b>${virg(sp)} s</b><br>`
      + `d ≈ ${virg(Sismo.kmS)} × ${virg(sp)} = <b>${virg(Sismo.distanceSP(sp), 0)} km</b> (distance vraie au foyer : ${virg(tt.R, 0)} km)`;
  }

  // ── Figure 2 : la magnitude locale ───────────────────────────────────────
  function majMagnitude() {
    const la = parseFloat($('#fig-a').value), R = parseFloat($('#fig-r').value), A = Math.pow(10, la);
    const corr = 1.11 * Math.log10(R) + 0.00189 * R - 2.09, ml = Sismo.ML(A, R);
    const fa = A >= 1e6 ? `${virg(A / 1e6, A >= 1e7 ? 0 : 1)} mm` : A >= 1e3 ? `${virg(A / 1e3, A >= 1e4 ? 0 : 1)} µm` : `${virg(A, 0)} nm`;
    $('#fig-a-v').textContent = fa; $('#fig-r-v').textContent = `${R} km`;
    $('#fig-ml-lecture').innerHTML = `log10 A = <b>${virg(la, 2)}</b> · correction de distance = 1,11·log10 R + 0,00189·R − 2,09 = <b>${virg(corr, 2)}</b><br>ML = <b>${virg(ml)}</b>`;
  }

  // ── Montage ──────────────────────────────────────────────────────────────
  function monter() {
    lireCouleurs();
    const d = $('#fig-distance');
    d.value = fig1.delta; $('#fig-distance-v').textContent = `${fig1.delta} km`;
    let attente = 0;
    d.addEventListener('input', () => {
      fig1.delta = parseInt(d.value, 10); $('#fig-distance-v').textContent = `${fig1.delta} km`;
      clearTimeout(attente); attente = setTimeout(() => { generer(); dessinerSismo(); }, 60);
    });
    for (const id of ['#fig-a', '#fig-r']) $(id).addEventListener('input', majMagnitude);
    generer(); dessinerSismo(); majMagnitude();
    monterQuiz($('#quiz'), Questions01);
    const redessiner = () => { lireCouleurs(); dessinerSismo(); };
    new ResizeObserver(redessiner).observe($('#fig-sismo'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    window.addEventListener('beforeprint', redessiner);
    $('#imprimer').addEventListener('click', () => window.print());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter); else monter();
})();
