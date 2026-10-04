import Sismo from './sismo/signal.js';
import Teleseisme from './sismo/teleseisme.js';
import { creerAnimation } from './propagation-anim.js';

// src/lecteur-station.js — banc « une station » : état, tracés (canvas), pointés, lectures, exercice ; séisme local
// (croûte du générateur, ML) ou lointain (téléséisme : phases ak135, distance par S − P, profondeur par pP − P, Ms),
// et animation en boucle de la propagation (src/propagation-anim.js).
(() => {
  'use strict';
  const SM = Sismo, TL = Teleseisme;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = (x, d = 0) => {
    if (!Number.isFinite(x)) return '—';
    const s = Math.abs(x).toFixed(d).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (x < 0 ? '−' : '') + s.join(',');
  };
  const STATION = 'XX.SIM1.00';
  const FILTRES = { aucun: null, large: [0.5, 20], local: [1, 10], etroit: [2, 8], tele: [0.5, 2], surface: [0.05, 0.2], ms: TL.FILTRE_MS };
  const NOM_GRANDEUR = { vitesse: 'vitesse', acceleration: 'accélération', deplacement: 'déplacement', wa: 'Wood-Anderson (gain 1)' };
  const distDepuis = v => 5 * Math.pow(120, v / 1000);
  const versCurseurDist = d => Math.round(1000 * Math.log(d / 5) / Math.log(120));
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const ROSE = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  const cardinal = a => ROSE[Math.round((((a % 360) + 360) % 360) / 22.5) % 16];

  const etat = {
    mode: 'explorer', type: 'local',
    explo: { Mw: 3.8, delta: 85, h: 10, baz: 235, bruit: 'standard', graine: 17 },
    exploTele: { Mw: 6.8, delta: 62, h: 35, baz: 235, bruit: 'standard', graine: 17 },
    exo: null,
    capteur: 'HH', grandeur: 'vitesse', filtre: 'aucun', compo: 'ZNE', echelle: 'commune', phases: true,
    outil: null, vue: [0, 1], pointes: { P: null, S: null, pP: null, A: null }, polarite: null, verifie: false,
    ev: null, mlv: null, msv: null, rec: null, aff: null, hodo: null, az: null, sature: null, debutUTC: 0, curseurX: null, lecture: null,
  };
  const tele = () => etat.type === 'tele';
  const explo = () => (tele() ? etat.exploTele : etat.explo);
  const parametres = () => (etat.mode === 'explorer' ? explo() : etat.exo.p);
  const bruitCourant = () => (etat.mode === 'explorer' ? explo().bruit : etat.exo.bruit);
  const vides = () => ({ P: null, S: null, pP: null, A: null });
  const pasEch = () => etat.ev.dt;
  const duree = () => etat.ev.n * etat.ev.dt;

  // ── Petits utilitaires d'interface ─────────────────────────────────────
  let minuteurToast = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function occupe(on) {
    const b = $('#etat-calcul');
    b.classList.toggle('calcul', on);
    b.lastElementChild.textContent = on ? 'Calcul du signal…' : 'Signal prêt';
  }
  function plusTard(fn) {
    occupe(true);
    setTimeout(() => { try { fn(); } finally { occupe(false); } }, 30);
  }
  function horloge(r) {
    let s = etat.debutUTC + r;
    s = ((s % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s - 3600 * h - 60 * m;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0').replace('.', ',')}`;
  }

  // ── Chaîne de calcul : événement → enregistrement → affichage ──────────
  function regenerer() {
    const p = parametres(), q = { Mw: p.Mw, delta: p.delta, h: p.h, baz: p.baz, graine: p.graine };
    if (tele()) { etat.ev = TL.generer(q); etat.mlv = null; etat.msv = TL.msVraie(etat.ev); }
    else { etat.ev = SM.generer(q); etat.mlv = SM.mlVraie(etat.ev); etat.msv = null; }
    const u = SM.aleatoire(p.graine * 13 + 5);
    etat.debutUTC = 3600 * Math.floor(u() * 24) + 60 * Math.floor(u() * 60) + Math.floor(u() * 60);
    etat.vue = [0, duree()];
    etat.pointes = vides();
    etat.az = null; etat.verifie = false;
    if (etat.mode === 'exercice') { etat.polarite = null; majPolarites(); $('#corrige').innerHTML = ''; }
    anim.charger(etat.ev); majAnimation();
    reenregistrer();
  }
  function reenregistrer() {
    const p = parametres();
    etat.rec = SM.enregistrer(etat.ev, etat.capteur, bruitCourant(), p.graine * 31 + 7);
    etat.sature = null;
    if (etat.capteur === 'HH') {
      const lim = SM.CAPTEURS.HH.saturation * 0.999;
      etat.sature = {};
      for (const c of ['Z', 'N', 'E']) {
        const x = etat.rec.series[c], idx = [];
        for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= lim) idx.push(i);
        etat.sature[c] = idx;
      }
    }
    etat.hodo = null;
    if (etat.pointes.P !== null) calculerAzimut();
    reconvertir();
  }
  function filtreCourant() {
    if (etat.filtre === 'perso') {
      const a = parseFloat($('#fmin').value), b = parseFloat($('#fmax').value);
      return a > 0 && b > a ? [a, b] : null;
    }
    return FILTRES[etat.filtre];
  }
  const bazRotation = () => (etat.mode === 'explorer' ? parametres().baz : (etat.az ? etat.az.baz : null));
  function reconvertir() {
    const { rec, ev } = etat, f = filtreCourant(), s = {};
    for (const c of ['Z', 'N', 'E']) s[c] = SM.convertir(rec.series[c], ev.dt, etat.capteur, etat.grandeur, f);
    let noms = ['Z', 'N', 'E'], series = [s.Z, s.N, s.E];
    const baz = bazRotation();
    if (etat.compo === 'ZRT' && baz !== null) {
      const ph = ((baz + 180) * Math.PI) / 180, c = Math.cos(ph), sn = Math.sin(ph), n = s.N.length;
      const R = new Float64Array(n), T = new Float64Array(n);
      for (let i = 0; i < n; i++) { R[i] = s.N[i] * c + s.E[i] * sn; T[i] = -s.N[i] * sn + s.E[i] * c; }
      noms = ['Z', 'R', 'T']; series = [s.Z, R, T];
    } else if (etat.compo === 'ZRT') {
      etat.compo = 'ZNE';
    }
    etat.aff = { noms, series, filtre: f };
    majTout();
  }
  function calculerAzimut() {
    const { rec, ev } = etat;
    if (!etat.hodo) {
      etat.hodo = {};
      for (const c of ['Z', 'N', 'E']) etat.hodo[c] = SM.convertir(rec.series[c], ev.dt, etat.capteur, 'vitesse', ev.tele ? [0.5, 2] : [1, 10]);
    }
    const i0 = Math.max(0, Math.round(etat.pointes.P / ev.dt) - 3), i1 = Math.min(ev.n, i0 + 63);
    const z = etat.hodo.Z.subarray(i0, i1), n = etat.hodo.N.subarray(i0, i1), e = etat.hodo.E.subarray(i0, i1);
    etat.az = Object.assign(SM.azimutP(z, n, e), { z, n, e });
  }

  // ── Tracés ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'phase', 'vrai', 'sature', 'muted', 'ink', 'paper', 'line', 'soft', 'blue', 'cyan', 'soft-line'])
      COUL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function preparer(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx, W, H };
  }
  const MARGES = { g: 10, d: 10, h: 34, b: 26 };
  function geometrie() {
    const cv = $('#traces'), W = cv.clientWidth, H = cv.clientHeight;
    const x0 = MARGES.g, x1 = W - MARGES.d, y0 = MARGES.h, y1 = H - MARGES.b;
    return { x0, x1, y0, y1, hT: (y1 - y0) / 3 };
  }
  const tVersX = (t, g) => g.x0 + ((t - etat.vue[0]) / (etat.vue[1] - etat.vue[0])) * (g.x1 - g.x0);
  const xVersT = (x, g) => etat.vue[0] + ((x - g.x0) / (g.x1 - g.x0)) * (etat.vue[1] - etat.vue[0]);
  function pasTemps(d, largeur) {
    const cible = d / Math.max(2, largeur / 90);
    for (const p of [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600]) if (p >= cible) return p;
    return 1200;
  }
  function amplitudeVisible(x) {
    const i0 = Math.max(0, Math.floor(etat.vue[0] / pasEch())), i1 = Math.min(x.length, Math.ceil(etat.vue[1] / pasEch()) + 1);
    let a = 0;
    for (let i = i0; i < i1; i++) { const v = Math.abs(x[i]); if (v > a) a = v; }
    return a;
  }
  function unite(amax) {
    if (etat.grandeur === 'wa') return { k: 1e9, u: 'nm' };
    const base = { vitesse: 'm/s', acceleration: 'm/s²', deplacement: 'm' }[etat.grandeur];
    for (const [k, p] of [[1e9, 'n'], [1e6, 'µ'], [1e3, 'm']]) if (amax * k < 1000) return { k, u: p + base };
    return { k: 1, u: base };
  }
  function texteHalo(ctx, txt, x, y, couleur) {
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = couleur; ctx.fillText(txt, x, y);
  }
  function tracerSerie(ctx, x, g, yc, ech) {
    const d = pasEch(), i0 = Math.max(0, Math.floor(etat.vue[0] / d)), i1 = Math.min(x.length - 1, Math.ceil(etat.vue[1] / d));
    const px = g.x1 - g.x0, parPx = (i1 - i0) / px;
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x0, yc - g.hT / 2, px, g.hT); ctx.clip();
    ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = COUL.trace; ctx.lineJoin = 'round';
    if (parPx <= 2) {
      for (let i = i0; i <= i1; i++) {
        const X = tVersX(i * d, g), Y = yc - x[i] * ech;
        if (i === i0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
    } else {
      for (let c = 0; c < px; c++) {
        const a = i0 + Math.floor(c * parPx), b = Math.min(i1, i0 + Math.floor((c + 1) * parPx));
        let mn = Infinity, mx = -Infinity;
        for (let i = a; i <= b; i++) { const v = x[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
        const X = g.x0 + c + 0.5;
        if (c === 0) ctx.moveTo(X, yc - mx * ech); else ctx.lineTo(X, yc - mx * ech);
        ctx.lineTo(X, yc - mn * ech);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  function phasesVisibles() {
    if (!(etat.mode === 'explorer' ? etat.phases : etat.verifie)) return [];
    const { tt, t0, p } = etat.ev, L = [];
    if (etat.ev.tele) {
      for (const a of tt.phases) L.push([a.phase, a.temps]);
      L.push(['LQ', tt.tLQ], ['LR', tt.tLR]);
      return L.map(([n, t]) => [n, t - t0]).filter(([, t]) => t < duree()).sort((a, b) => a[1] - b[1]);
    }
    if (tt.tPn !== null) L.push(['Pn', tt.tPn]);
    L.push(['Pg', tt.tPg]);
    if (tt.tSn !== null) L.push(['Sn', tt.tSn]);
    L.push(['Sg', tt.tSg]);
    if (p.delta >= 100) { L.push(['LQ', tt.tLQ]); L.push(['LR', tt.tLR]); }
    return L.map(([n, t]) => [n, t - t0]).sort((a, b) => a[1] - b[1]);
  }
  function ligneVerticale(ctx, x, g, couleur, largeur, tirets) {
    ctx.save();
    ctx.strokeStyle = couleur; ctx.lineWidth = largeur; ctx.setLineDash(tirets || []);
    ctx.beginPath(); ctx.moveTo(x, g.y0 - 2); ctx.lineTo(x, g.y1); ctx.stroke();
    ctx.restore();
  }
  function etiquette(ctx, txt, x, rang, couleur, plein) {
    ctx.font = `800 11px ${POLICE}`;
    const w = ctx.measureText(txt).width + 10, y = 4 + rang * 15;
    ctx.fillStyle = plein ? couleur : COUL.paper;
    ctx.strokeStyle = couleur; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y, w, 14, 4) : ctx.rect(x - w / 2, y, w, 14);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = plein ? COUL.paper : couleur; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 7.5);
  }

  function dessiner() {
    if (!etat.aff) return;
    lireCouleurs();
    const cv = $('#traces'), { ctx, W, H } = preparer(cv), g = geometrie();
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const d = etat.vue[1] - etat.vue[0], pas = pasTemps(d, g.x1 - g.x0);
    // Graduations du temps (secondes depuis le début de l'enregistrement)
    ctx.font = `11px ${MONO}`; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    for (let t = Math.ceil(etat.vue[0] / pas) * pas; t <= etat.vue[1] + 1e-9; t += pas) {
      const x = Math.round(tVersX(t, g)) + 0.5;
      ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
      ctx.fillStyle = COUL.muted;
      ctx.fillText(virg(t, pas < 0.1 ? 2 : pas < 1 ? 1 : 0) + ' s', x, g.y1 + 7);
    }
    // Traces
    const amps = etat.aff.series.map(amplitudeVisible), commun = Math.max(...amps) || 1;
    etat.aff.ech = [];
    etat.aff.series.forEach((x, k) => {
      const yc = g.y0 + g.hT * (k + 0.5), a = etat.echelle === 'commune' ? commun : (amps[k] || 1);
      const ech = (g.hT * 0.46) / a;
      etat.aff.ech[k] = { yc, ech };
      if (k > 0) { ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.x0, Math.round(g.y0 + g.hT * k) + 0.5); ctx.lineTo(g.x1, Math.round(g.y0 + g.hT * k) + 0.5); ctx.stroke(); }
      tracerSerie(ctx, x, g, yc, ech);
      // Saturation du vélocimètre : repères rouges en tête de trace
      const nom = etat.aff.noms[k];
      let sat = [];
      if (etat.sature) sat = nom === 'Z' ? etat.sature.Z : nom === 'N' ? etat.sature.N : nom === 'E' ? etat.sature.E : etat.sature.N.concat(etat.sature.E);
      let dernier = -1, visibles = 0;
      ctx.fillStyle = COUL.sature;
      for (const i of sat) {
        const X = Math.round(tVersX(i * pasEch(), g));
        if (X < g.x0 || X > g.x1 || X === dernier) continue;
        ctx.fillRect(X, yc - g.hT / 2 + 1, 1.5, 6); dernier = X; visibles++;
      }
      // Étiquettes de voie et d'amplitude
      const u = unite(amps[k]);
      ctx.font = `700 12px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const code = `${voieCode()}${nom}`;
      texteHalo(ctx, code, g.x0 + 6, yc - g.hT / 2 + 5, COUL.ink);
      if (sat.length) { ctx.font = `800 11px ${POLICE}`; texteHalo(ctx, 'saturé', g.x0 + 6 + ctx.measureText(code).width + 22, yc - g.hT / 2 + 6, COUL.sature); }
      ctx.font = `11px ${MONO}`; ctx.textAlign = 'right';
      let txt = `max ${milliers(amps[k] * u.k, amps[k] * u.k < 10 ? 2 : amps[k] * u.k < 100 ? 1 : 0)} ${u.u}`;
      if (etat.grandeur === 'acceleration') txt += ` · ${virg(amps[k] / 9.81, amps[k] / 9.81 < 0.01 ? 4 : 3)} g`;
      texteHalo(ctx, txt, g.x1 - 6, yc - g.hT / 2 + 5, COUL.muted);
    });
    // Phases théoriques et arrivées vraies (corrigé)
    const rangs = [];
    const placer = x => { let r = 0; while (rangs.some(([xx, rr]) => rr === r && Math.abs(xx - x) < 30)) r++; rangs.push([x, r]); return r; };
    for (const [nom, t] of phasesVisibles()) {
      const x = tVersX(t, g);
      if (x < g.x0 || x > g.x1) continue;
      ligneVerticale(ctx, Math.round(x) + 0.5, g, COUL.phase, 1, [4, 4]);
      etiquette(ctx, nom, x, placer(x), COUL.phase, false);
    }
    if (etat.verifie) {
      const { tt, t0 } = etat.ev, vrais = etat.ev.tele ? [['P vrai', tt.tP - t0], ['S vrai', tt.tS - t0]] : [['P vrai', tt.tPg - t0], ['S vrai', tt.tSg - t0]];
      const pP = etat.ev.tele && tt.phases.find(a => a.phase === 'pP');
      if (pP && etat.exo && etat.exo.profond) vrais.push(['pP vrai', pP.temps - t0]);
      for (const [nom, t] of vrais) {
        if (!Number.isFinite(t)) continue;
        const x = tVersX(t, g);
        if (x < g.x0 || x > g.x1) continue;
        ligneVerticale(ctx, Math.round(x) + 0.5, g, COUL.vrai, 1.5, [2, 3]);
        etiquette(ctx, nom, x, placer(x), COUL.vrai, false);
      }
    }
    // Pointés de l'utilisateur
    for (const [cle, coul] of [['P', COUL['pick-p']], ['S', COUL['pick-s']], ['pP', COUL.cyan]]) {
      const t = etat.pointes[cle];
      if (t === null) continue;
      const x = tVersX(t, g);
      if (x < g.x0 - 1 || x > g.x1 + 1) continue;
      ligneVerticale(ctx, Math.round(x) + 0.5, g, coul, 2);
      etiquette(ctx, cle, x, placer(x), coul, true);
    }
    const A = etat.pointes.A;
    if (A && etat.grandeur === (etat.ev.tele ? 'deplacement' : 'wa')) {
      const k = etat.aff.noms.indexOf(A.nom);
      if (k >= 0) {
        const x = tVersX(A.t, g), { yc, ech } = etat.aff.ech[k], y = yc - A.val * ech;
        if (x >= g.x0 && x <= g.x1) {
          ctx.strokeStyle = COUL.amp; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.stroke();
          ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, yc); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = `800 12px ${MONO}`; ctx.textAlign = x > (g.x0 + g.x1) / 2 ? 'right' : 'left'; ctx.textBaseline = 'middle';
          texteHalo(ctx, `A = ${milliers(A.Anm)} nm${A.T ? `, T = ${virg(A.T, 1)} s` : ''}`, x + (ctx.textAlign === 'right' ? -10 : 10), y, COUL.amp);
        }
      }
    }
    // Curseur
    if (etat.curseurX !== null && etat.curseurX >= g.x0 && etat.curseurX <= g.x1) {
      ctx.save(); ctx.globalAlpha = 0.55;
      ligneVerticale(ctx, Math.round(etat.curseurX) + 0.5, g, COUL.muted, 1);
      ctx.restore();
    }
  }

  function dessinerApercu() {
    if (!etat.aff) return;
    const cv = $('#apercu'), { ctx, W, H } = preparer(cv), x = etat.aff.series[0], n = x.length;
    let a = 0;
    for (let i = 0; i < n; i++) a = Math.max(a, Math.abs(x[i]));
    const ech = (H / 2 - 4) / (a || 1), yc = H / 2;
    ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 0; c < W; c++) {
      const i0 = Math.floor((c * n) / W), i1 = Math.max(i0 + 1, Math.floor(((c + 1) * n) / W));
      let mn = Infinity, mx = -Infinity;
      for (let i = i0; i < Math.min(n, i1); i++) { if (x[i] < mn) mn = x[i]; if (x[i] > mx) mx = x[i]; }
      if (c === 0) ctx.moveTo(c + 0.5, yc - mx * ech); else ctx.lineTo(c + 0.5, yc - mx * ech);
      ctx.lineTo(c + 0.5, yc - mn * ech);
    }
    ctx.stroke();
    const T = duree(), xa = (etat.vue[0] / T) * W, xb = (etat.vue[1] / T) * W;
    ctx.fillStyle = COUL.paper; ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, xa, H); ctx.fillRect(xb, 0, W - xb, H);
    ctx.globalAlpha = 1; ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2;
    ctx.strokeRect(xa + 1, 1, Math.max(2, xb - xa - 2), H - 2);
    for (const [cle, coul] of [['P', COUL['pick-p']], ['S', COUL['pick-s']], ['pP', COUL.cyan]]) {
      const t = etat.pointes[cle];
      if (t === null) continue;
      ctx.fillStyle = coul; ctx.fillRect((t / T) * W - 1, 0, 2, H);
    }
  }

  // ── Vue : zoom et déplacement ───────────────────────────────────────────
  function fixerVue(a, b) {
    const T = duree(), d = Math.min(T, Math.max(0.5, b - a));
    a = Math.min(Math.max(0, a), T - d);
    etat.vue = [a, a + d];
  }
  function zoomer(facteur, tc) {
    const [a, b] = etat.vue, c = tc === undefined ? (a + b) / 2 : tc, r = (c - a) / (b - a), d = (b - a) * facteur;
    fixerVue(c - r * d, c - r * d + d);
    dessiner(); dessinerApercu();
  }

  // ── Outils de lecture ───────────────────────────────────────────────────
  function choisirOutil(o) {
    if (o === 'pP' && !etat.ev.tele) return;
    etat.outil = etat.outil === o ? null : o;
    // ML se mesure sur le Wood-Anderson sans filtre ; Ms sur le déplacement vertical filtré de 18 à 22 s
    const [g, f, msg] = etat.ev.tele ? ['deplacement', 'ms', 'Déplacement filtré de 18 à 22 s : Ms se mesure sur la verticale (Z).'] : ['wa', 'aucun', 'Affichage Wood-Anderson sans filtre : ML se mesure sur cette trace.'];
    if (etat.outil === 'A' && (etat.grandeur !== g || etat.filtre !== f)) {
      etat.grandeur = g; etat.filtre = f;
      $('#grandeur').value = g; $('#filtre').value = f; $('#perso').hidden = true;
      toast(msg);
      reconvertir();
    }
    majOutils(); majAide();
  }
  function clic(x, y) {
    const g = geometrie(), t = xVersT(x, g);
    if (!etat.outil) return;
    if (etat.outil === 'P' || etat.outil === 'S') {
      etat.pointes[etat.outil] = Math.max(0, Math.min(duree(), t));
      if (etat.outil === 'P') {
        calculerAzimut();
        if (etat.compo === 'ZRT' && etat.mode === 'exercice') { reconvertir(); }
        if (etat.pointes.S === null) etat.outil = 'S';
      } else {
        etat.outil = null;
      }
      if (etat.pointes.P !== null && etat.pointes.S !== null && etat.pointes.S <= etat.pointes.P) toast('S doit arriver après P : vérifiez vos pointés.');
    } else if (etat.outil === 'pP') {
      etat.pointes.pP = Math.max(0, Math.min(duree(), t));
      etat.outil = null;
      if (etat.pointes.P !== null && etat.pointes.pP <= etat.pointes.P) toast('pP arrive après P : vérifiez vos pointés.');
    } else if (etat.outil === 'A') {
      const k = Math.max(0, Math.min(2, Math.floor((y - g.y0) / g.hT)));
      const nom = etat.aff.noms[k], loin = etat.ev.tele;
      if (!loin && nom === 'Z') { toast('ML se mesure sur une composante horizontale (N, E, R ou T).'); return; }
      if (loin && nom !== 'Z') { toast('Ms se mesure sur la composante verticale (Z), sur l\'onde de Rayleigh.'); return; }
      // ±0,5 s autour du clic pour ML ; ±10 s (une demi-période) pour Ms
      const xs = etat.aff.series[k], d = pasEch(), w = loin ? 10 : 0.5;
      const i0 = Math.max(0, Math.round((t - w) / d)), i1 = Math.min(xs.length - 1, Math.round((t + w) / d));
      let im = i0;
      for (let i = i0; i <= i1; i++) if (Math.abs(xs[i]) > Math.abs(xs[im])) im = i;
      etat.pointes.A = { t: im * d, nom, val: xs[im], Anm: Math.abs(xs[im]) * 1e9, T: loin ? TL.periodeAutour(xs, im, d) : null };
    }
    if (etat.mode === 'exercice' && etat.verifie) { etat.verifie = false; $('#corrige').innerHTML = ''; }
    majTout();
  }

  // ── Panneaux : lectures, hodogramme, aide, vérité ───────────────────────
  function lectures() {
    const { P: tP, S: tS, pP: tpP, A } = etat.pointes, r = { tP, tS, tpP, A };
    if (tP !== null && tS !== null && tS > tP) {
      r.dts = tS - tP;
      if (etat.ev.tele) {
        // Δ dans les tables ak135 (S − P), h par pP − P, t0 = tP − T_P(Δ, h) ; lecture mémorisée (rais coûteux)
        const cle = `${tP}|${tS}|${tpP}`;
        if (!etat.lecture || etat.lecture.cle !== cle) etat.lecture = { cle, ...TL.lire({ tP, tS, tpP }) };
        Object.assign(r, { distance: etat.lecture.distance, h: etat.lecture.h, hLu: etat.lecture.hLu, t0: etat.lecture.t0 });
        if (A && A.T && Number.isFinite(r.distance)) r.Ms = TL.Ms(A.Anm, A.T, r.distance);
      } else {
        r.R = SM.distanceSP(r.dts); r.t0 = SM.origineDepuis(tP, r.dts);
        if (A) r.ML = SM.ML(A.Anm, r.R);
      }
    }
    return r;
  }
  const minsec = t => { const m = Math.floor(t / 60); return m ? `${m} min ${virg(t - 60 * m, 1)} s` : `${virg(t, 1)} s`; };
  function afficheur(titre, valeur, detail) {
    const vide = valeur === '—';
    return `<div class="afficheur${vide ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majLectures() {
    const r = lectures(), az = etat.az;
    if (etat.ev.tele) return majLecturesTele(r, az);
    $('#afficheurs').innerHTML = [
      afficheur('Arrivée P', r.tP !== null ? virg(r.tP, 2) + ' s' : '—', r.tP !== null ? horloge(r.tP) + ' UTC' : 'outil « Pointer P »'),
      afficheur('Arrivée S', r.tS !== null ? virg(r.tS, 2) + ' s' : '—', r.tS !== null ? horloge(r.tS) + ' UTC' : 'outil « Pointer S »'),
      afficheur('Écart S − P', r.dts ? virg(r.dts, 2) + ' s' : '—', ''),
      afficheur('Distance hypocentrale', r.R ? virg(r.R, 1) + ' km' : '—', r.R ? '8,4 km/s × (tS − tP)' : ''),
      afficheur("Heure d'origine", r.t0 !== undefined ? horloge(r.t0) : '—', r.t0 !== undefined ? 'UTC' : ''),
      afficheur('Amplitude Wood-Anderson', r.A ? milliers(r.A.Anm) + ' nm' : '—', r.A ? `${virg(r.A.Anm * SM.WA.gain * 1e-6, 2)} mm sur l'enregistreur (×${SM.WA.gain})` : 'outil « Mesurer A »'),
      afficheur('Magnitude locale', r.ML !== undefined ? 'ML ' + virg(r.ML, 1) : '—', r.ML !== undefined ? 'IASPEI 2013' : (r.A ? 'pointez P et S' : '')),
      afficheur('Azimut de la source', az ? Math.round(az.baz) + '° ' + cardinal(az.baz) : '—', az ? 'rectilinéarité ' + virg(az.rectilinearite, 2) : 'après le pointé P'),
    ].join('');
    const vp = SM.MODELE.vp1, vs = SM.MODELE.vs1, e = [];
    e.push(['1', 'Distance par l\'écart S − P',
      `Les deux ondes partent ensemble ; la S (Vs = ${virg(vs, 1)} km/s) prend du retard sur la P (Vp = ${virg(vp, 1)} km/s).`,
      r.R ? `R = (tS − tP) · Vp·Vs / (Vp − Vs) = ${virg(r.dts, 2)} s × ${virg(SM.kmS, 2)} km/s = <b>${virg(r.R, 1)} km</b>` : 'R = (tS − tP) · Vp·Vs / (Vp − Vs) ≈ 8,4 km/s × (tS − tP)']);
    e.push(['2', "Heure d'origine",
      'La P a mis R / Vp pour arriver : on remonte le temps depuis tP.',
      r.t0 !== undefined ? `t₀ = tP − (tS − tP) · Vs / (Vp − Vs) = ${horloge(r.tP)} − ${virg(r.dts * vs / (vp - vs), 2)} s = <b>${horloge(r.t0)} UTC</b>` : 't₀ = tP − (tS − tP) · Vs / (Vp − Vs) ≈ tP − 1,4 × (tS − tP)']);
    e.push(['3', 'Magnitude locale',
      'Amplitude maximale (zéro-crête) du Wood-Anderson simulé, en nm, sur une horizontale.',
      r.ML !== undefined ? `ML = log A + 1,11 log R + 0,00189 R − 2,09 = log ${milliers(r.A.Anm)} + 1,11 log ${virg(r.R, 1)} + 0,00189 × ${virg(r.R, 1)} − 2,09 = <b>${virg(r.ML, 2)}</b>` : 'ML = log A + 1,11 log R + 0,00189 R − 2,09']);
    $('#etapes').innerHTML = e.map(([n, h, p, f]) => `<div class="etape"><span>${n}</span><div><h4>${h}</h4><p>${p}</p><div class="formule">${f}</div></div></div>`).join('');
  }
  // Téléséisme : distance en degrés par les tables ak135, origine, profondeur par pP − P, Ms.
  function majLecturesTele(r, az) {
    const ok = Number.isFinite(r.distance), km = d => milliers(d * Math.PI / 180 * 6371);
    $('#afficheurs').innerHTML = [
      afficheur('Arrivée P', r.tP !== null ? virg(r.tP, 2) + ' s' : '—', r.tP !== null ? horloge(r.tP) + ' UTC' : 'outil « Pointer P »'),
      afficheur('Arrivée S', r.tS !== null ? virg(r.tS, 2) + ' s' : '—', r.tS !== null ? horloge(r.tS) + ' UTC' : 'outil « Pointer S »'),
      afficheur('Écart S − P', r.dts ? minsec(r.dts) : '—', ''),
      afficheur('Distance épicentrale', ok ? virg(r.distance, 1) + '°' : '—', ok ? `${km(r.distance)} km · table ak135` : r.dts ? 'hors des tables (10° à 95°)' : ''),
      afficheur("Heure d'origine", Number.isFinite(r.t0) ? horloge(r.t0) : '—', Number.isFinite(r.t0) ? 'UTC · t₀ = tP − T_P(Δ, h)' : ''),
      afficheur('Profondeur du foyer', r.hLu ? virg(r.hLu, 0) + ' km' : '—', r.tpP !== null && r.tP !== null ? `pP − P = ${virg(r.tpP - r.tP, 1)} s` : 'outil « Pointer pP »'),
      afficheur('Amplitude A (Z, 18 – 22 s)', r.A ? milliers(r.A.Anm) + ' nm' : '—', r.A ? `période T = ${virg(r.A.T, 1)} s` : 'outil « Mesurer A »'),
      afficheur('Magnitude des ondes de surface', r.Ms !== undefined ? 'Ms ' + virg(r.Ms, 1) : '—', r.Ms !== undefined ? 'IASPEI 2013' : (r.A ? 'pointez P et S' : '')),
      afficheur('Azimut de la source', az ? Math.round(az.baz) + '° ' + cardinal(az.baz) : '—', az ? 'rectilinéarité ' + virg(az.rectilinearite, 2) : 'après le pointé P'),
    ].join('');
    const e = [], TP = ok ? r.tP - r.t0 : null;
    e.push(['1', 'Distance par l\'écart S − P',
      'Les rais P et S plongent dans le manteau, où les vitesses croissent avec la profondeur : la règle 8,4 km/s × (tS − tP) ne vaut plus. On lit Δ dans la table de temps de trajet ak135 (chapitre 6), à la profondeur du foyer.',
      ok ? `S − P = ${minsec(r.dts)} → Δ = <b>${virg(r.distance, 1)}°</b> = ${km(r.distance)} km (foyer à ${virg(r.h, 0)} km${r.hLu ? ', lu par pP' : ', supposé'})` : 'S − P → Δ lue dans la table ak135 (foyer supposé à 33 km tant que pP n\'est pas pointée)']);
    e.push(['2', "Heure d'origine",
      'La P a mis T_P(Δ, h) pour arriver ; on le lit dans la même table et on remonte le temps depuis tP.',
      ok ? `t₀ = tP − T_P = ${horloge(r.tP)} − ${minsec(TP)} = <b>${horloge(r.t0)} UTC</b>` : 't₀ = tP − T_P(Δ, h)']);
    e.push(['3', 'Profondeur par pP − P',
      'pP part vers le haut, se réfléchit sous la surface au-dessus du foyer, puis suit presque le chemin de P : son retard sur P croît avec la profondeur, presque sans dépendre de la distance.',
      r.hLu ? `pP − P = ${virg(r.tpP - r.tP, 1)} s à Δ = ${virg(r.distance, 1)}° → h = <b>${virg(r.hLu, 0)} km</b>` : 'pP − P (s) et Δ → h, rais ak135 (valable de 40° à 95°)']);
    e.push(['4', 'Magnitude Ms',
      'Amplitude zéro-crête A (nm) du déplacement vertical de l\'onde de Rayleigh, de période T entre 18 et 22 s ; foyer à moins de 60 km, 20° ≤ Δ ≤ 160°.',
      r.Ms !== undefined ? `Ms = log(A/T) + 1,66 log Δ + 0,3 = log(${milliers(r.A.Anm)}/${virg(r.A.T, 1)}) + 1,66 log ${virg(r.distance, 1)} + 0,3 = <b>${virg(r.Ms, 2)}</b>` : 'Ms = log(A/T) + 1,66 log Δ + 0,3']);
    $('#etapes').innerHTML = e.map(([n, h, p, f]) => `<div class="etape"><span>${n}</span><div><h4>${h}</h4><p>${p}</p><div class="formule">${f}</div></div></div>`).join('');
  }
  function majHodo() {
    lireCouleurs();
    const cv = $('#hodo');
    if (cv.clientWidth < 60) return;
    const { ctx, W, H } = preparer(cv), cx = W / 2, cy = H / 2, R = W / 2 - 22;
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.fillStyle = COUL.muted; ctx.font = `800 11px ${POLICE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, 9); ctx.fillText('S', cx, H - 9); ctx.fillText('E', W - 9, cy); ctx.fillText('O', 9, cy);
    const az = etat.az, txt = $('#hodo-texte');
    if (!az) {
      txt.innerHTML = `<p>Pointez l'arrivée P : le mouvement du sol des ${etat.ev.tele ? '3' : '0,6'} premières secondes s'affiche ici.</p><p>Une onde P fait vibrer le sol dans la direction de propagation : le tracé N-E est alors une ellipse très aplatie, alignée sur l'axe station-source${etat.ev.tele ? ' (pour un téléséisme, la P arrive presque à la verticale : la composante horizontale est faible)' : ''}.</p>`;
      return;
    }
    let m = 0;
    for (let i = 0; i < az.n.length; i++) m = Math.max(m, Math.hypot(az.n[i], az.e[i]));
    const k = (R * 0.92) / (m || 1);
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < az.n.length; i++) {
      const X = cx + az.e[i] * k, Y = cy - az.n[i] * k;
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    const a = (az.baz * Math.PI) / 180, ex = cx + Math.sin(a) * R, ey = cy - Math.cos(a) * R;
    ctx.strokeStyle = COUL['pick-p']; ctx.fillStyle = COUL['pick-p']; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    const t1 = a + Math.PI * 0.86, t2 = a - Math.PI * 0.86;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.sin(t1) * 11, ey - Math.cos(t1) * 11); ctx.lineTo(ex + Math.sin(t2) * 11, ey - Math.cos(t2) * 11); ctx.closePath(); ctx.fill();
    if (etat.mode === 'explorer' || etat.verifie) {
      const b = (etat.ev.p.baz * Math.PI) / 180;
      ctx.save(); ctx.strokeStyle = COUL.vrai; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(b) * R, cy - Math.cos(b) * R); ctx.stroke(); ctx.restore();
    }
    const qualite = az.rectilinearite >= 0.75 ? 'mouvement bien polarisé, lecture fiable' : az.rectilinearite >= 0.5 ? 'polarisation moyenne : vérifiez le pointé P' : 'mouvement peu polarisé : pointé trop tardif, ou bruit dominant';
    txt.innerHTML = `<p><strong>Source vers ${Math.round(az.baz)}° (${cardinal(az.baz)})</strong> — flèche orangée.</p>
      <p>Rectilinéarité ${virg(az.rectilinearite, 2)} : ${qualite}.</p>
      <p>L'axe du mouvement donne la direction à 180° près ; le signe de Z lève l'ambiguïté : quand Z monte (compression), le sol s'éloigne de la source.</p>
      ${etat.mode === 'explorer' || etat.verifie ? `<p>Tirets verts : azimut vrai, ${etat.ev.p.baz}°.</p>` : ''}`;
  }
  function majAide() {
    const sat = etat.sature && (etat.sature.Z.length || etat.sature.N.length || etat.sature.E.length);
    const textes = etat.ev && etat.ev.tele ? {
      P: '<strong>Pointer P.</strong> Cliquez au début de la première arrivée sur Z. Filtrez 0,5 – 2 Hz pour sortir la P du bruit de la houle (microséisme, 0,1 – 0,3 Hz), puis zoomez (double-clic).',
      S: '<strong>Pointer S.</strong> Sur les horizontales (T de préférence), cherchez l\'arrivée de plus longue période, plusieurs minutes après P. Au-delà de 85°, SKS peut la précéder sur R.',
      pP: '<strong>Pointer pP.</strong> Seconde impulsion sur Z après P, souvent de signe opposé : de quelques secondes (foyer superficiel) à plus de deux minutes (foyer à 600 km) après P.',
      A: '<strong>Mesurer A.</strong> Cliquez près du plus grand pic de l\'onde de Rayleigh sur Z : le lecteur retient le maximum à ±10 s et mesure sa période entre deux passages par zéro.',
    } : {
      P: '<strong>Pointer P.</strong> Cliquez au début du premier mouvement net, de préférence sur Z. Double-cliquez pour zoomer et viser au centième de seconde.',
      S: '<strong>Pointer S.</strong> Sur les horizontales, cherchez la reprise d\'amplitude, souvent à plus basse fréquence, qui suit la coda de la P.',
      A: '<strong>Mesurer A.</strong> Cliquez près du plus grand pic d\'une horizontale : le lecteur retient le maximum à ±0,5 s du clic.',
    };
    let h = textes[etat.outil] || 'Glissez pour vous déplacer, double-cliquez pour zoomer (Ctrl + molette ou pincement aussi). Choisissez un outil pour pointer.';
    if (sat) h += ' <strong>Saturation :</strong> le vélocimètre plafonne vers 1,5 cm/s ; passez sur l\'accéléromètre (HN) pour lire le mouvement fort.';
    if (etat.capteur === 'HN' && etat.ev && amplitudeMaxBrute() < 20 * SM.CAPTEURS.HN.bruit) h += ' <strong>Accéléromètre :</strong> ce séisme est à peine au-dessus du bruit propre du capteur ; le vélocimètre est fait pour les petits mouvements.';
    $('#aide').innerHTML = h;
  }
  function amplitudeMaxBrute() {
    let a = 0;
    for (const c of ['Z', 'N', 'E']) for (const v of etat.ev.acc[c]) a = Math.max(a, Math.abs(v));
    return a;
  }
  // Code de voie : HH/HN à 100 Hz (local), BH/BN à 20 Hz (téléséisme, large bande).
  const voieCode = () => (etat.ev && etat.ev.tele ? { HH: 'BH', HN: 'BN' }[etat.capteur] : etat.capteur);
  function majVoie() {
    const f = etat.aff.filtre, cap = SM.CAPTEURS[etat.capteur].nom.toLowerCase();
    const filtre = !f ? 'sans filtre' : f[1] < 0.1 ? `filtre ${virg(1 / f[1], 0)}–${virg(1 / f[0], 0)} s` : `filtre ${virg(f[0], f[0] < 0.1 ? 2 : 1)}–${virg(f[1], 1)} Hz`;
    $('#voie').innerHTML = `<span><b>${STATION}.${voieCode()}${etat.aff.noms.join('/')}</b></span><span>${cap}, ${Math.round(1 / etat.ev.dt)} Hz</span>`
      + `<span>${NOM_GRANDEUR[etat.grandeur]}</span><span>${filtre}</span>`
      + `<span>début ${horloge(0)} UTC</span>`;
  }
  function majVeriteExplo() {
    if (etat.mode !== 'explorer') return;
    if (etat.ev.tele) return majVeriteTele();
    const { tt, t0, p } = etat.ev, v = etat.ev.verite, m = etat.mlv;
    let h = `<b>Vérité terrain.</b> P à <b>${virg(tt.tP - t0, 2)} s</b>, S à <b>${virg(tt.tS - t0, 2)} s</b>, R = <b>${virg(tt.R, 1)} km</b>. `
      + `ML sans bruit : <b>${virg(m.mN, 1)}</b> (N) / <b>${virg(m.mE, 1)}</b> (E) pour Mw ${virg(p.Mw, 1)}. `
      + `Premier mouvement ${v.sP > 0 ? 'vers le haut (compression)' : 'vers le bas (dilatation)'}${v.polariteLisible ? '' : ', faible : station proche d\'un plan nodal'}.`;
    if (tt.tPn !== null && tt.tPn < tt.tPg) h += ` <br><b>Attention :</b> à cette distance la première P est <b>Pn</b> (réfractée sous le Moho). Avec Sg, l'écart S − P donne ${virg(SM.distanceSP(tt.tSg - tt.tPn), 0)} km au lieu de ${virg(tt.R, 0)} km.`;
    $('#verite-explo').innerHTML = h;
  }
  function majVeriteTele() {
    const { tt, t0, p } = etat.ev, v = etat.ev.verite, ms = etat.msv, prem = tt.phases.find(a => Math.abs(a.temps - tt.tP) < 1e-6);
    const pP = tt.phases.find(a => a.phase === 'pP');
    let h = `<b>Vérité terrain.</b> ${prem ? prem.phase : 'P'} à <b>${virg(tt.tP - t0, 1)} s</b>${tt.tS !== null ? `, S à <b>${virg(tt.tS - t0, 1)} s</b>` : ''}`
      + `${pP ? `, pP à <b>${virg(pP.temps - t0, 1)} s</b> (pP − P = ${virg(pP.temps - tt.tP, 1)} s)` : ''} ; Δ = <b>${p.delta}°</b> (${milliers(tt.x)} km), h = <b>${p.h} km</b>, origine à ${horloge(-t0)} UTC. `
      + `Ms sans bruit : <b>${virg(ms.Ms, 1)}</b> (T = ${virg(ms.T, 1)} s) pour Mw ${virg(p.Mw, 1)}. `
      + `Premier mouvement ${v.sP > 0 ? 'vers le haut (compression)' : 'vers le bas (dilatation)'}${v.polariteLisible ? '' : ', faible : rai proche d\'un plan nodal'}.`;
    if (tt.tS === null) h += ' <br><b>Zone d\'ombre :</b> au-delà de 100°, P et S directes n\'arrivent plus (le noyau les dévie) ; seules les phases du noyau (PKIKP, PKP, SKS) atteignent la station.';
    if (p.h > 60) h += ' <br><b>Foyer profond :</b> ondes de surface faibles, Ms ne s\'applique pas (h ≤ 60 km) ; la profondeur se lit par pP − P.';
    if (p.Mw >= 7.6) h += ' <br><b>Saturation :</b> au-delà de Mw 7,5, la fréquence coin passe sous 0,05 Hz : Ms, mesurée à 20 s, sous-estime la taille du séisme.';
    $('#verite-explo').innerHTML = h;
  }
  function majAnimation() {
    const cache = etat.mode === 'exercice' && !etat.verifie;
    anim.masquer(cache, cache ? 'La propagation s\'affiche après « Vérifier » : elle donnerait la distance et la profondeur.' : '');
    $('#propagation-sous-titre').textContent = tele()
      ? 'Coupe du globe (ak135) : fronts P (orangés) et S (bleus) ; en trait fin, les fronts pP et sS réfléchis sous la surface au-dessus du foyer ; en tirets, PcP et ScS réfléchis sur le noyau. Rais vers la station avec leur point mobile, ondes de surface en brun le long de la surface ; en bas, le sismogramme s\'écrit à mesure que les ondes arrivent. Animation en boucle.'
      : 'Coupe de la croûte : fronts P (orangés) et S (bleus) directs, réfléchis sur le Moho (tirets), transmis dans le manteau, ondes coniques Pn et Sn au-delà du point critique ; en bas, le sismogramme s\'écrit à mesure que les ondes arrivent. Animation en boucle.';
  }
  function majOutils() {
    $$('[data-outil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.outil === etat.outil)));
  }
  function majSegments() {
    $$('[data-capteur]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.capteur === etat.capteur)));
    $$('[data-compo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.compo === etat.compo)));
    $$('[data-echelle]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.echelle === etat.echelle)));
    const zrt = $('#btn-zrt'), ok = bazRotation() !== null;
    zrt.disabled = !ok;
    zrt.title = ok ? 'R : radiale (de la source vers la station), T : transverse' : 'Pointez P : la rotation utilise l\'azimut estimé';
  }
  function majPolarites() {
    $$('[data-polarite]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.polarite === etat.polarite)));
  }
  function majTout() {
    majSegments(); majOutils(); majVoie(); dessiner(); dessinerApercu(); majLectures(); majHodo(); majAide(); majVeriteExplo();
  }

  // ── Exercice ────────────────────────────────────────────────────────────
  function majEnonce() {
    $('#enonce-station').innerHTML = tele()
      ? 'Un séisme lointain est enregistré à la station <b>XX.SIM1</b> (large bande, 20 Hz). Pointez P puis S ; lisez la distance dans les tables. Si les ondes de surface sont fortes (foyer superficiel), mesurez Ms sur la verticale ; si elles manquent (foyer profond), pointez pP pour la profondeur. Indiquez enfin la polarité de la P sur la verticale.'
      : 'Un séisme local est enregistré à la station <b>XX.SIM1</b>. Pointez l\'arrivée P puis l\'arrivée S, mesurez l\'amplitude maximale du Wood-Anderson sur une composante horizontale, puis indiquez la polarité de la P sur la verticale.';
  }
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 7919 + 1);
    if (tele()) {
      // un foyer sur deux est profond (profondeur demandée par pP − P, de 40° à 90°), l'autre superficiel (Ms demandée)
      const profond = u() < 0.5;
      etat.exo = {
        numero, type: 'tele', profond, bruit: ['calme', 'standard'][Math.floor(u() * 2)],
        p: { Mw: Math.round(u.entre(profond ? 6.2 : 6.0, 7.4) * 10) / 10, delta: Math.round(u.entre(profond ? 40 : 30, 90)), h: profond ? 5 * Math.round(u.entre(80, 600) / 5) : Math.round(u.entre(10, 40)), baz: Math.floor(u() * 360), graine: numero },
      };
    } else etat.exo = {
      numero, type: 'local', bruit: ['calme', 'standard', 'standard', 'urbain'][Math.floor(u() * 4)],
      p: { Mw: Math.round(u.entre(2.6, 4.8) * 10) / 10, delta: Math.round(u.entre(18, 135)), h: Math.round(u.entre(4, 20)), baz: Math.floor(u() * 360), graine: numero },
    };
    etat.capteur = 'HH'; etat.grandeur = 'vitesse'; etat.filtre = 'aucun'; etat.compo = 'ZNE'; etat.outil = 'P';
    $('#grandeur').value = 'vitesse'; $('#filtre').value = 'aucun'; $('#perso').hidden = true;
    $('#exo-num').textContent = 'Exercice n° ' + numero;
    $('#corrige').innerHTML = '';
    plusTard(regenerer);
  }
  function verifier() {
    if (etat.ev.tele) return verifierTele();
    const ev = etat.ev, { tt, t0, p, verite } = ev, r = lectures(), m = etat.mlv;
    const vrai = { tP: tt.tPg - t0, tS: tt.tSg - t0 };
    const ecartAz = etat.az ? Math.abs(((etat.az.baz - p.baz + 540) % 360) - 180) : null;
    const polVraie = verite.sP > 0 ? 'haut' : 'bas';
    const NOM_POL = { haut: '↑ haut', bas: '↓ bas', indet: 'indécis' };
    const lignes = [
      ['Arrivée P', r.tP !== null ? virg(r.tP, 2) + ' s' : '—', virg(vrai.tP, 2) + ' s', r.tP !== null && Math.abs(r.tP - vrai.tP) <= 0.25, '± 0,25 s'],
      ['Arrivée S', r.tS !== null ? virg(r.tS, 2) + ' s' : '—', virg(vrai.tS, 2) + ' s', r.tS !== null && Math.abs(r.tS - vrai.tS) <= 0.6, '± 0,6 s'],
      ['Distance hypocentrale', r.R ? virg(r.R, 1) + ' km' : '—', virg(tt.R, 1) + ' km', !!r.R && Math.abs(r.R - tt.R) <= Math.max(5, 0.08 * tt.R), '± 8 %'],
      ['Magnitude locale', r.ML !== undefined ? virg(r.ML, 1) : '—', `${virg(Math.min(m.mN, m.mE), 1)} à ${virg(Math.max(m.mN, m.mE), 1)}`, r.ML !== undefined && r.ML >= Math.min(m.mN, m.mE) - 0.3 && r.ML <= Math.max(m.mN, m.mE) + 0.3, '± 0,3'],
      ['Polarité de P', etat.polarite ? NOM_POL[etat.polarite] : '—', NOM_POL[polVraie] + (verite.polariteLisible ? '' : ' (faible)'), etat.polarite === polVraie || (!verite.polariteLisible && etat.polarite === 'indet'), ''],
      ['Azimut de la source', etat.az ? Math.round(etat.az.baz) + '°' : '—', p.baz + '°', ecartAz !== null && ecartAz <= 20, '± 20°'],
    ];
    const score = lignes.filter(l => l[3]).length;
    etat.verifie = true;
    $('#corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Vrai</th></tr></thead><tbody>
      ${lignes.map(([n, v, w, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}${tol ? `<br><small style="color:var(--muted)">tolérance ${tol}</small>` : ''}</td><td class="n">${v}</td><td class="n">${w}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${score} / 6 lectures justes</p>
      <p class="verite"><b>Le séisme :</b> Mw ${virg(p.Mw, 1)}, Δ = ${p.delta} km, h = ${p.h} km, origine à ${horloge(-t0)} UTC.
      La vraie ML vient du Wood-Anderson calculé sans bruit ; ML et Mw ne coïncident pas forcément.
      Les arrivées vraies et les phases théoriques sont maintenant tracées en vert et en cyan.</p>`;
    majTout(); majAnimation();
  }
  function verifierTele() {
    const ev = etat.ev, { tt, t0, p, verite } = ev, r = lectures(), ms = etat.msv, profond = etat.exo.profond;
    const vrai = { tP: tt.tP - t0, tS: tt.tS - t0, t0: -t0 }, pP = tt.phases.find(a => a.phase === 'pP');
    const ecartAz = etat.az ? Math.abs(((etat.az.baz - p.baz + 540) % 360) - 180) : null, polVraie = verite.sP > 0 ? 'haut' : 'bas';
    const NOM_POL = { haut: '↑ haut', bas: '↓ bas', indet: 'indécis' }, ok = Number.isFinite(r.distance);
    const lignes = [
      ['Arrivée P', r.tP !== null ? virg(r.tP, 1) + ' s' : '—', virg(vrai.tP, 1) + ' s', r.tP !== null && Math.abs(r.tP - vrai.tP) <= 1, '± 1 s'],
      ['Arrivée S', r.tS !== null ? virg(r.tS, 1) + ' s' : '—', virg(vrai.tS, 1) + ' s', r.tS !== null && Math.abs(r.tS - vrai.tS) <= 3, '± 3 s'],
      ['Distance épicentrale', ok ? virg(r.distance, 1) + '°' : '—', p.delta + '°', ok && Math.abs(r.distance - p.delta) <= 2, '± 2°'],
      ["Heure d'origine", Number.isFinite(r.t0) ? horloge(r.t0) : '—', horloge(vrai.t0), Number.isFinite(r.t0) && Math.abs(r.t0 - vrai.t0) <= 8, '± 8 s'],
      profond
        ? ['Profondeur (pP − P)', r.hLu ? virg(r.hLu, 0) + ' km' : '—', `${p.h} km`, !!r.hLu && Math.abs(r.hLu - p.h) <= Math.max(20, 0.15 * p.h), `± 15 % ; pP − P vrai : ${virg(pP.temps - tt.tP, 1)} s`]
        : ['Magnitude Ms', r.Ms !== undefined ? virg(r.Ms, 1) : '—', virg(ms.Ms, 1), r.Ms !== undefined && Math.abs(r.Ms - ms.Ms) <= 0.3, '± 0,3'],
      ['Polarité de P', etat.polarite ? NOM_POL[etat.polarite] : '—', NOM_POL[polVraie] + (verite.polariteLisible ? '' : ' (faible)'), etat.polarite === polVraie || (!verite.polariteLisible && etat.polarite === 'indet'), ''],
      ['Azimut de la source', etat.az ? Math.round(etat.az.baz) + '°' : '—', p.baz + '°', ecartAz !== null && ecartAz <= 20, '± 20°'],
    ];
    etat.verifie = true;
    $('#corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Vrai</th></tr></thead><tbody>
      ${lignes.map(([n, v, w, okL, tol]) => `<tr class="${okL ? 'ok' : 'ko'}"><td><span class="verdict ${okL ? 'ok' : 'ko'}">${okL ? '✓' : '✗'}</span> ${n}${tol ? `<br><small style="color:var(--muted)">tolérance ${tol}</small>` : ''}</td><td class="n">${v}</td><td class="n">${w}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / ${lignes.length} lectures justes</p>
      <p class="verite"><b>Le séisme :</b> Mw ${virg(p.Mw, 1)}, Δ = ${p.delta}° (${milliers(tt.x)} km), h = ${p.h} km, origine à ${horloge(vrai.t0)} UTC.
      ${profond ? 'Foyer profond : les ondes de surface sont faibles et Ms ne s\'applique pas ; la profondeur se lit par pP − P.' : `Ms mesurée sans bruit : ${virg(ms.Ms, 1)} (A = ${milliers(ms.A)} nm, T = ${virg(ms.T, 1)} s) ; Ms et Mw ne coïncident pas forcément.`}
      Les arrivées vraies et les phases théoriques sont maintenant tracées, et l'animation de la propagation est affichée.</p>`;
    majTout(); majAnimation();
  }

  // ── Événements ──────────────────────────────────────────────────────────
  let attente = 0;
  function planifier() { clearTimeout(attente); attente = setTimeout(() => plusTard(regenerer), 250); }
  function majCurseursExplo() {
    const e = etat.explo, t = etat.exploTele, c = explo();
    $('#mw').value = e.Mw; $('#mw-v').textContent = virg(e.Mw, 1);
    $('#dist').value = versCurseurDist(e.delta); $('#dist-v').textContent = Math.round(e.delta) + ' km';
    $('#prof').value = e.h; $('#prof-v').textContent = e.h + ' km';
    $('#mw-t').value = t.Mw; $('#mw-t-v').textContent = virg(t.Mw, 1);
    $('#dist-t').value = t.delta; $('#dist-t-v').textContent = `${t.delta}° (${milliers(t.delta * Math.PI / 180 * 6371)} km)`;
    $('#prof-t').value = t.h; $('#prof-t-v').textContent = t.h + ' km';
    $('#baz').value = c.baz; $('#baz-v').textContent = c.baz + '° ' + cardinal(c.baz);
    $('#bruit').value = c.bruit;
  }
  // Type de séisme : local (croûte du générateur) ou lointain (téléséisme) ; vaut pour les deux modes.
  function changerType(t) {
    if (etat.type === t) return;
    etat.type = t;
    $$('[data-type-seisme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.typeSeisme === t)));
    $('#reglages-local').hidden = t !== 'local'; $('#reglages-tele').hidden = t !== 'tele';
    $('[data-outil="pP"]').hidden = t !== 'tele';
    $('#phases-liste').textContent = t === 'tele' ? 'P, pP, sP, PcP, PKP, S, ScS, SKS, ondes de surface' : 'Pn, Pg, Sn, Sg, ondes de surface';
    majTypeAide();
    etat.capteur = 'HH'; etat.grandeur = 'vitesse'; etat.filtre = 'aucun'; etat.compo = 'ZNE'; etat.outil = null; etat.lecture = null;
    $('#grandeur').value = 'vitesse'; $('#filtre').value = 'aucun'; $('#perso').hidden = true;
    majCurseursExplo(); majEnonce();
    if (etat.mode === 'exercice') nouvelExercice(); else plusTard(regenerer);
  }
  function majTypeAide() {
    $('#type-aide').textContent = tele()
      ? 'Station à 15° – 160° du foyer (1° ≈ 111 km) : rais dans le globe (ak135), distance par les tables, profondeur par pP − P, magnitude Ms. Enregistrement de 30 à 90 minutes.'
      : 'Station à moins de 600 km : ondes dans la croûte (Pg, Sg) et sous le Moho (Pn, Sn), distance par 8,4 km/s × (tS − tP), magnitude locale ML.';
    $('#hodo-sous-titre').textContent = tele() ? 'Composantes N et E filtrées 0,5 – 2 Hz, 3 s après votre pointé P' : 'Composantes N et E filtrées 1–10 Hz, 0,6 s après votre pointé P';
  }
  function brancher() {
    $('#mw').addEventListener('input', e => { etat.explo.Mw = parseFloat(e.target.value); majCurseursExplo(); planifier(); });
    $('#dist').addEventListener('input', e => { etat.explo.delta = Math.round(distDepuis(parseFloat(e.target.value))); majCurseursExplo(); planifier(); });
    $('#prof').addEventListener('input', e => { etat.explo.h = parseInt(e.target.value, 10); majCurseursExplo(); planifier(); });
    $('#mw-t').addEventListener('input', e => { etat.exploTele.Mw = parseFloat(e.target.value); majCurseursExplo(); planifier(); });
    $('#dist-t').addEventListener('input', e => { etat.exploTele.delta = parseInt(e.target.value, 10); majCurseursExplo(); planifier(); });
    $('#prof-t').addEventListener('input', e => { etat.exploTele.h = parseInt(e.target.value, 10); majCurseursExplo(); planifier(); });
    $('#baz').addEventListener('input', e => { explo().baz = parseInt(e.target.value, 10); majCurseursExplo(); planifier(); });
    $('#bruit').addEventListener('change', e => { explo().bruit = e.target.value; plusTard(reenregistrer); });
    $('#tirage').addEventListener('click', () => { explo().graine = 1 + Math.floor(Math.random() * 1e6); plusTard(regenerer); });
    $$('[data-type-seisme]').forEach(b => b.addEventListener('click', () => changerType(b.dataset.typeSeisme)));

    $('#mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#verifier').addEventListener('click', verifier);
    $('#nouvel-exo').addEventListener('click', nouvelExercice);
    $$('[data-polarite]').forEach(b => b.addEventListener('click', () => { etat.polarite = b.dataset.polarite; majPolarites(); }));

    $$('[data-outil]').forEach(b => b.addEventListener('click', () => choisirOutil(b.dataset.outil)));
    $$('[data-capteur]').forEach(b => b.addEventListener('click', () => { if (etat.capteur === b.dataset.capteur) return; etat.capteur = b.dataset.capteur; plusTard(reenregistrer); }));
    $$('[data-compo]').forEach(b => b.addEventListener('click', () => { etat.compo = b.dataset.compo; plusTard(reconvertir); }));
    $$('[data-echelle]').forEach(b => b.addEventListener('click', () => { etat.echelle = b.dataset.echelle; majSegments(); dessiner(); }));
    $('#grandeur').addEventListener('change', e => { etat.grandeur = e.target.value; plusTard(reconvertir); });
    $('#filtre').addEventListener('change', e => { etat.filtre = e.target.value; $('#perso').hidden = etat.filtre !== 'perso'; plusTard(reconvertir); });
    for (const id of ['#fmin', '#fmax']) $(id).addEventListener('change', () => { if (etat.filtre === 'perso') plusTard(reconvertir); });
    $('#phases').addEventListener('change', e => { etat.phases = e.target.checked; dessiner(); });

    $('#zoom-plus').addEventListener('click', () => zoomer(0.5));
    $('#zoom-moins').addEventListener('click', () => zoomer(2));
    $('#zoom-tout').addEventListener('click', () => { etat.vue = [0, duree()]; dessiner(); dessinerApercu(); });
    $('#effacer').addEventListener('click', () => {
      etat.pointes = vides(); etat.az = null;
      if (etat.compo === 'ZRT' && etat.mode === 'exercice') etat.compo = 'ZNE';
      if (etat.verifie) { etat.verifie = false; $('#corrige').innerHTML = ''; }
      plusTard(reconvertir);
    });

    const cv = $('#traces');
    let glisse = null;
    cv.addEventListener('pointerdown', e => {
      cv.focus({ preventScroll: true });
      cv.setPointerCapture(e.pointerId);
      glisse = { x: e.offsetX, vue: etat.vue.slice(), bouge: false };
    });
    cv.addEventListener('pointermove', e => {
      etat.curseurX = e.offsetX;
      if (etat.ev) {
        const t = xVersT(e.offsetX, geometrie());
        $('#curseur').textContent = `t = ${virg(t, 2)} s · ${horloge(t)} UTC`;
      }
      if (glisse) {
        const dx = e.offsetX - glisse.x;
        if (Math.abs(dx) > 4) glisse.bouge = true;
        if (glisse.bouge) {
          const g = geometrie(), dT = (dx / (g.x1 - g.x0)) * (glisse.vue[1] - glisse.vue[0]);
          fixerVue(glisse.vue[0] - dT, glisse.vue[1] - dT);
          cv.classList.add('glisse');
          dessinerApercu();
        }
      }
      dessiner();
    });
    const fin = e => {
      if (glisse && !glisse.bouge && e.type === 'pointerup') clic(e.offsetX, e.offsetY);
      glisse = null; cv.classList.remove('glisse');
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
    cv.addEventListener('pointerleave', () => { etat.curseurX = null; dessiner(); });
    cv.addEventListener('dblclick', e => zoomer(0.4, xVersT(e.offsetX, geometrie())));
    cv.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.shiftKey) return;
      e.preventDefault();
      const g = geometrie();
      if (e.ctrlKey) zoomer(e.deltaY > 0 ? 1.25 : 0.8, xVersT(e.offsetX, g));
      else { const d = etat.vue[1] - etat.vue[0], s = Math.sign(e.deltaY || e.deltaX) * d * 0.1; fixerVue(etat.vue[0] + s, etat.vue[1] + s); dessiner(); dessinerApercu(); }
    }, { passive: false });
    cv.addEventListener('keydown', e => {
      const k = e.key.toLowerCase(), d = etat.vue[1] - etat.vue[0];
      if (k === 'p') choisirOutil('P');
      else if (k === 's') choisirOutil('S');
      else if (k === 'a') choisirOutil('A');
      else if (k === 'd' && etat.ev.tele) choisirOutil('pP');
      else if (k === 'escape') { etat.outil = null; majOutils(); majAide(); }
      else if (k === 'arrowleft' || k === 'arrowright') { const s = (k === 'arrowleft' ? -0.2 : 0.2) * d; fixerVue(etat.vue[0] + s, etat.vue[1] + s); dessiner(); dessinerApercu(); }
      else if (k === '+' || k === '=') zoomer(0.5);
      else if (k === '-') zoomer(2);
      else return;
      e.preventDefault();
    });

    const ap = $('#apercu');
    let tireApercu = false;
    const centrer = e => {
      const t = (e.offsetX / ap.clientWidth) * duree(), d = etat.vue[1] - etat.vue[0];
      fixerVue(t - d / 2, t + d / 2); dessiner(); dessinerApercu();
    };
    ap.addEventListener('pointerdown', e => { tireApercu = true; ap.setPointerCapture(e.pointerId); centrer(e); });
    ap.addEventListener('pointermove', e => { if (tireApercu) centrer(e); });
    ap.addEventListener('pointerup', () => { tireApercu = false; });
    ap.addEventListener('pointercancel', () => { tireApercu = false; });

    const redessiner = () => { if (etat.aff && !$('#banc-station').hidden) { dessiner(); dessinerApercu(); majHodo(); } };
    new ResizeObserver(redessiner).observe($('#traces'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#panneau-explorer').hidden = m !== 'explorer';
    $('#panneau-exercice').hidden = m !== 'exercice';
    $('#case-phases').hidden = m !== 'explorer';
    etat.compo = 'ZNE';
    if (m === 'exercice') nouvelExercice();
    else { etat.outil = null; plusTard(regenerer); }
    majAnimation();
  }

  const anim = creerAnimation({ canvas: $('#propagation'), bouton: $('#anim-lecture'), vitesse: $('#anim-vitesse'), legende: $('#anim-legende') });
  brancher();
  majCurseursExplo(); majEnonce(); majTypeAide();
  plusTard(regenerer);
})();
