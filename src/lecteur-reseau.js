import Sismo from './sismo/signal.js';
import Direct from './sismo/direct.js';
import Localisation from './sismo/localisation.js';
import Reel from './sismo/reel.js';
import SeismeReel from './seisme-reel.js';
import Mecanisme from './sismo/mecanisme.js';

// src/lecteur-reseau.js — banc « réseau » : quatre stations, pointés P/S, cercles, Wadati, localisation sur grille.
// Mode « Séisme réel » : un fichier enregistré par la page « En direct » (src/sismo/dossier.js) remplace les quatre
// stations simulées ; la localisation se fait sur la sphère (src/sismo/localisation.js) et se compare au catalogue du
// fichier (EMSC, ou GEOFON).
(() => {
  'use strict';
  const SM = Sismo;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const signe = (x, d = 2) => Number.isFinite(x) ? (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ',') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const FILTRES = { aucun: null, large: [0.5, 5], local: [1, 10], etroit: [2, 8] };
  // Stations en km : x vers l'est, y vers le nord, origine en SIM1. En mode « Séisme réel », STATIONS devient la liste
  // des stations du fichier (latitude, longitude, voies).
  const SIMULEES = [
    { nom: 'SIM1', x: 0, y: 0 }, { nom: 'SIM2', x: 58, y: 22 }, { nom: 'SIM3', x: 22, y: -52 }, { nom: 'SIM4', x: -46, y: -14 },
  ];
  let STATIONS = SIMULEES;
  const CARTE = { cx: 6, cy: -12, demi: 130 };

  const etat = {
    pret: false, mode: 'explorer',
    explo: { x: 16, y: -8, h: 10, Mw: 3.6, bruit: 'standard', graine: 41 },
    exo: null, auto: false, phases: true, // pointés automatiques décochés : l'étudiant pointe lui-même
    filtre: 'aucun', outil: 'P', vue: [0, 1], pointes: STATIONS.map(() => ({ P: null, S: null })), evs: [], recs: [], series: [],
    t0: 0, n: 0, dt: 0.01, debutUTC: 0, loc: null, wad: null, verifie: false, curseurX: null,
    reel: null, table: null, cotes: null, wa: null, polarites: [], meca: null, messageMeca: '', version: 0, // version lue de l'état partagé
  };
  const reel = () => etat.mode === 'reel';
  const parametres = () => (etat.mode === 'explorer' ? etat.explo : etat.exo.p);
  const bruitCourant = () => (etat.mode === 'explorer' ? etat.explo.bruit : etat.exo.bruit);
  const duree = () => etat.n * etat.dt;
  const vide = () => STATIONS.map(() => ({ P: null, S: null }));

  function occupe(on) {
    const b = $('#etat-calcul');
    b.classList.toggle('calcul', on);
    b.lastElementChild.textContent = on ? 'Calcul des signaux…' : 'Signal prêt';
  }
  function plusTard(fn) { occupe(true); setTimeout(() => { try { fn(); } finally { occupe(false); } }, 30); }
  function horloge(r) {
    let s = etat.debutUTC + r;
    s = ((s % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s - 3600 * h - 60 * m;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0').replace('.', ',')}`;
  }
  const geo = p => STATIONS.map(s => ({ delta: Math.max(0.5, Math.hypot(p.x - s.x, p.y - s.y)), baz: SM.azimut(p.x - s.x, p.y - s.y) }));

  // ── Chaîne de calcul ────────────────────────────────────────────────────
  function regenerer() {
    const p = parametres(), g = geo(p), tts = g.map(q => SM.temps(q.delta, p.h));
    const t0 = Math.min(...tts.map(t => t.tP)) - 12;
    const fin = Math.max(...tts.map(t => t.tSg)) + 35 + 8 * Math.max(0, p.Mw - 3);
    etat.evs = g.map((q, k) => SM.generer({ Mw: p.Mw, delta: q.delta, h: p.h, baz: q.baz, graine: p.graine * 10 + k, t0, fin }));
    etat.t0 = t0; etat.dt = etat.evs[0].dt; etat.n = etat.evs[0].n;
    const u = SM.aleatoire(p.graine * 17 + 3);
    etat.debutUTC = 3600 * Math.floor(u() * 24) + 60 * Math.floor(u() * 60) + Math.floor(u() * 60);
    etat.vue = [0, duree()];
    etat.recs = etat.evs.map((ev, k) => SM.enregistrer(ev, 'HH', bruitCourant(), p.graine * 31 + 11 * k + 7));
    etat.pointes = vide(); etat.verifie = false;
    if (etat.mode === 'explorer' && etat.auto) pointesAutomatiques();
    if (etat.mode === 'exercice') $('#r-corrige').innerHTML = '';
    reconvertir();
  }
  // Arrivées vraies dans l'échelle de l'enregistrement : P = première arrivée, S = Sg.
  const vraies = () => etat.evs.map(ev => ({ P: ev.tt.tP - ev.t0, S: ev.tt.tSg - ev.t0 }));
  function pointesAutomatiques() {
    const u = SM.aleatoire(parametres().graine * 7 + 1);
    etat.pointes = vraies().map(v => ({ P: v.P + 0.05 * u.gauss(), S: v.S + 0.15 * u.gauss() }));
  }
  function reconvertir() {
    const f = FILTRES[etat.filtre];
    if (reel()) {
      // séisme réel : vitesse du sol déjà en m/s ; filtre de Butterworth causal (ordre 2), borné sous la fréquence de Nyquist
      const fs = 1 / etat.dt, sos = f ? Direct.butterPasseBande(2, f[0], Math.min(f[1], 0.45 * fs), fs) : null;
      etat.series = etat.reel.stations.map(st => st.series.map(x => (sos ? Direct.filtrer(x, sos) : x)));
    } else etat.series = etat.recs.map(rec => ['Z', 'N', 'E'].map(c => SM.convertir(rec.series[c], etat.dt, 'HH', 'vitesse', f)));
    relocaliser();
  }
  function relocaliser() {
    const lec = etat.pointes.map(p => ({ tP: p.P, tS: p.S !== null && p.P !== null && p.S > p.P ? p.S : null }));
    etat.loc = reel() ? (etat.table ? Localisation.localiser(STATIONS, lec, etat.table) : null) : SM.localiser(STATIONS, lec);
    if (reel()) {
      etat.meca = null; // la géométrie des rais a changé : inversion à refaire
      etat.version = SeismeReel.publier({ pointes: etat.pointes, polarites: etat.polarites, solution: etat.loc });
    }
    etat.wad = SM.wadati(lec);
    tout();
  }

  // ── Tracés des stations ─────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'phase', 'vrai', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft-line'])
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
  const geometrie = cv => {
    const W = cv.clientWidth, H = cv.clientHeight, x0 = 10, x1 = W - 10, y0 = 34, y1 = H - 18;
    return { x0, x1, y0, y1, hT: (y1 - y0) / 3 };
  };
  const tVersX = (t, g) => g.x0 + ((t - etat.vue[0]) / (etat.vue[1] - etat.vue[0])) * (g.x1 - g.x0);
  const xVersT = (x, g) => etat.vue[0] + ((x - g.x0) / (g.x1 - g.x0)) * (etat.vue[1] - etat.vue[0]);
  function pasTemps(d, largeur) {
    const cible = d / Math.max(2, largeur / 90);
    for (const p of [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60]) if (p >= cible) return p;
    return 120;
  }
  function texteHalo(ctx, txt, x, y, couleur) {
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y); ctx.fillStyle = couleur; ctx.fillText(txt, x, y);
  }
  function etiquette(ctx, txt, x, rang, couleur, plein) {
    ctx.font = `800 10.5px ${POLICE}`;
    const w = ctx.measureText(txt).width + 9, y = 3 + rang * 15;
    ctx.fillStyle = plein ? couleur : COUL.paper; ctx.strokeStyle = couleur; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y, w, 14, 4) : ctx.rect(x - w / 2, y, w, 14);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = plein ? COUL.paper : couleur; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 7.5);
  }
  function ligne(ctx, x, g, couleur, l, tirets) {
    ctx.save(); ctx.strokeStyle = couleur; ctx.lineWidth = l; ctx.setLineDash(tirets || []);
    ctx.beginPath(); ctx.moveTo(x, g.y0 - 3); ctx.lineTo(x, g.y1); ctx.stroke(); ctx.restore();
  }
  function tracerSerie(ctx, x, g, yc, ech) {
    const d = etat.dt, i0 = Math.max(0, Math.floor(etat.vue[0] / d)), i1 = Math.min(x.length - 1, Math.ceil(etat.vue[1] / d));
    const px = g.x1 - g.x0, parPx = (i1 - i0) / px;
    ctx.save(); ctx.beginPath(); ctx.rect(g.x0, yc - g.hT / 2, px, g.hT); ctx.clip();
    ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = COUL.trace;
    if (parPx <= 2) {
      for (let i = i0; i <= i1; i++) { const X = tVersX(i * d, g), Y = yc - x[i] * ech; if (i === i0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
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
    ctx.stroke(); ctx.restore();
  }
  function dessinerStation(k) {
    const cv = $(`#r-cv-${k}`);
    if (!cv || !etat.series.length) return;
    const { ctx, W, H } = preparer(cv), g = geometrie(cv);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const d = etat.vue[1] - etat.vue[0], pas = pasTemps(d, g.x1 - g.x0);
    ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = Math.ceil(etat.vue[0] / pas) * pas; t <= etat.vue[1] + 1e-9; t += pas) {
      const x = Math.round(tVersX(t, g)) + 0.5;
      ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
      ctx.fillStyle = COUL.muted; ctx.fillText(virg(t, pas < 0.1 ? 2 : pas < 1 ? 1 : 0) + ' s', x, g.y1 + 4);
    }
    // Échelle commune aux trois composantes d'une station (les stations ont chacune la leur).
    const xs = etat.series[k], i0 = Math.max(0, Math.floor(etat.vue[0] / etat.dt)), i1 = Math.min(etat.n, Math.ceil(etat.vue[1] / etat.dt) + 1);
    let a = 0;
    for (const x of xs) for (let i = i0; i < i1; i++) a = Math.max(a, Math.abs(x[i]));
    const ech = (g.hT * 0.46) / (a || 1);
    ['Z', 'N', 'E'].forEach((nom, j) => {
      const yc = g.y0 + g.hT * (j + 0.5);
      tracerSerie(ctx, xs[j], g, yc, ech);
      ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      texteHalo(ctx, reel() ? STATIONS[k].voies[j] || `${nom} absente` : 'HH' + nom, g.x0 + 4, yc - g.hT / 2 + 8, COUL.muted);
    });
    ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    texteHalo(ctx, `max ${virg(a * 1e6, a * 1e6 < 10 ? 2 : a * 1e6 < 100 ? 1 : 0)} µm/s`, g.x1 - 4, g.y0 + 7, COUL.muted);
    // Phases théoriques (exploration) ou arrivées vraies (après vérification)
    const ev = etat.evs[k];
    if (reel()) {
      if (etat.verifie) for (const [nom, t] of Object.entries(prevuesGeofon()[k])) {
        if (t === null) continue;
        const x = tVersX(t, g);
        if (x >= g.x0 && x <= g.x1) { ligne(ctx, Math.round(x) + 0.5, g, COUL.vrai, 1.5, [2, 3]); etiquette(ctx, nom, x, 0, COUL.vrai, false); }
      }
    } else if ((etat.mode === 'explorer' && etat.phases) || etat.verifie) {
      const L = [];
      if (etat.mode === 'explorer') {
        if (ev.tt.tPn !== null) L.push(['Pn', ev.tt.tPn]);
        L.push(['Pg', ev.tt.tPg]);
        if (ev.tt.tSn !== null) L.push(['Sn', ev.tt.tSn]);
        L.push(['Sg', ev.tt.tSg]);
        for (const [nom, t] of L) { const x = tVersX(t - ev.t0, g); if (x >= g.x0 && x <= g.x1) { ligne(ctx, Math.round(x) + 0.5, g, COUL.phase, 1, [4, 4]); etiquette(ctx, nom, x, 0, COUL.phase, false); } }
      } else {
        const v = vraies()[k];
        for (const [nom, t] of [['P', v.P], ['S', v.S]]) { const x = tVersX(t, g); if (x >= g.x0 && x <= g.x1) { ligne(ctx, Math.round(x) + 0.5, g, COUL.vrai, 1.5, [2, 3]); etiquette(ctx, nom, x, 0, COUL.vrai, false); } }
      }
    }
    for (const [cle, coul] of [['P', COUL['pick-p']], ['S', COUL['pick-s']]]) {
      const t = etat.pointes[k][cle];
      if (t === null) continue;
      const x = tVersX(t, g);
      if (x < g.x0 - 1 || x > g.x1 + 1) continue;
      ligne(ctx, Math.round(x) + 0.5, g, coul, 2);
      etiquette(ctx, cle, x, 1, coul, true);
    }
    if (etat.curseurX !== null && etat.curseurX >= g.x0 && etat.curseurX <= g.x1) {
      ctx.save(); ctx.globalAlpha = 0.55; ligne(ctx, Math.round(etat.curseurX) + 0.5, g, COUL.muted, 1); ctx.restore();
    }
  }
  function dessinerTraces() { lireCouleurs(); STATIONS.forEach((s, k) => dessinerStation(k)); }

  // ── Carte ───────────────────────────────────────────────────────────────
  function carteGeo(cv) {
    const W = cv.clientWidth, H = cv.clientHeight, m = 26, cote = Math.min(W, H) - 2 * m;
    const k = cote / (2 * CARTE.demi), ox = (W - cote) / 2, oy = (H - cote) / 2;
    return {
      W, H, k, m,
      X: x => ox + (x - (CARTE.cx - CARTE.demi)) * k,
      Y: y => oy + ((CARTE.cy + CARTE.demi) - y) * k,
      versKm: (px, py) => [CARTE.cx - CARTE.demi + (px - ox) / k, CARTE.cy + CARTE.demi - (py - oy) / k],
      ox, oy, cote,
    };
  }
  function etoile(ctx, x, y, r, couleur) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      const px = x + rr * Math.cos(a), py = y + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = couleur; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = COUL.paper; ctx.stroke();
  }
  function dessinerCarte() {
    if (reel()) { dessinerCarteReelle(); return; }
    lireCouleurs();
    const cv = $('#r-carte'), { ctx, W, H } = preparer(cv), c = carteGeo(cv);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    // Quadrillage tous les 20 km, cotes tous les 40 km
    ctx.font = `10px ${MONO}`; ctx.fillStyle = COUL.muted;
    const x0 = CARTE.cx - CARTE.demi, x1 = CARTE.cx + CARTE.demi, y0 = CARTE.cy - CARTE.demi, y1 = CARTE.cy + CARTE.demi;
    for (let v = Math.ceil(x0 / 20) * 20; v <= x1; v += 20) {
      ctx.strokeStyle = v === 0 ? COUL['grid-strong'] : COUL.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(c.X(v)) + 0.5, c.Y(y1)); ctx.lineTo(Math.round(c.X(v)) + 0.5, c.Y(y0)); ctx.stroke();
      if (v % 40 === 0) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(v).replace('-', '−'), c.X(v), c.Y(y0) + 4); }
    }
    for (let v = Math.ceil(y0 / 20) * 20; v <= y1; v += 20) {
      ctx.strokeStyle = v === 0 ? COUL['grid-strong'] : COUL.grid;
      ctx.beginPath(); ctx.moveTo(c.X(x0), Math.round(c.Y(v)) + 0.5); ctx.lineTo(c.X(x1), Math.round(c.Y(v)) + 0.5); ctx.stroke();
      if (v % 40 === 0) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(v).replace('-', '−'), c.X(x0) - 4, c.Y(v)); }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('km', c.X(x1) - 16, c.Y(y0) - 2);
    // Nord
    const nx = c.X(x1) - 14, ny = c.Y(y1) + 10;
    ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx - 6, ny + 16); ctx.lineTo(nx + 6, ny + 16); ctx.closePath(); ctx.fill();
    ctx.font = `800 11px ${POLICE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('N', nx, ny + 18);
    ctx.save(); ctx.beginPath(); ctx.rect(c.ox, c.oy, c.cote, c.cote); ctx.clip();
    // Zone compatible
    const L = etat.loc;
    if (L) {
      ctx.fillStyle = COUL.amp; ctx.globalAlpha = 0.22;
      for (const [x, y] of L.zone) ctx.fillRect(c.X(x - 0.5), c.Y(y + 0.5), Math.max(1, c.k), Math.max(1, c.k));
      ctx.globalAlpha = 1;
    }
    // Cercles de distance hypocentrale
    STATIONS.forEach((s, k) => {
      const p = etat.pointes[k];
      if (p.P === null || p.S === null || p.S <= p.P) return;
      const R = SM.distanceSP(p.S - p.P);
      ctx.save(); ctx.strokeStyle = COUL.blue; ctx.globalAlpha = 0.75; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(c.X(s.x), c.Y(s.y), R * c.k, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    });
    ctx.restore();
    // Épicentres
    const montrerVrai = etat.mode === 'explorer' || etat.verifie, p = parametres();
    if (L) etoile(ctx, c.X(L.x), c.Y(L.y), 9, COUL.amp);
    if (montrerVrai) etoile(ctx, c.X(p.x), c.Y(p.y), 9, COUL.vrai);
    // Stations
    STATIONS.forEach(s => {
      const X = c.X(s.x), Y = c.Y(s.y);
      ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.moveTo(X, Y - 8); ctx.lineTo(X - 7, Y + 5); ctx.lineTo(X + 7, Y + 5); ctx.closePath(); ctx.fill();
      ctx.font = `800 11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      texteHalo(ctx, s.nom, X + 9, Y - 1, COUL.ink);
    });
    $('#r-carte-legende').innerHTML = `Cercles bleus : R tirée de S − P · <span style="color:var(--amp)">★ solution</span>${montrerVrai ? ' · <span style="color:var(--vrai)">★ épicentre vrai</span>' : ''}${etat.mode === 'explorer' ? ' (glissez-la)' : ''}`;
  }

  // ── Séisme réel : carte en latitude et longitude, arrivées prévues à la solution du catalogue ─────────────────
  // Catalogue de référence du fichier : celui de la liste de la page « En direct » (EMSC, ou GEOFON en secours et pour les
  // fichiers plus anciens).
  const nomCat = e => (e && e.catalogue) || 'GEOFON';
  // Heure d'origine du catalogue dans l'échelle des traces (s depuis le début du fichier) et arrivées P et S prévues à
  // chaque station pour sa solution (table de la localisation).
  const origineGeofon = () => (etat.reel.seisme.temps - etat.reel.debut) / 1000;
  function prevuesGeofon() {
    const e = etat.reel.seisme, t0 = origineGeofon(), h = Math.max(0, Math.min(40, e.h || 10));
    return STATIONS.map(s => {
      const d = Localisation.distanceAzimut(e.lat, e.lon, s.lat, s.lon).distance, p = etat.table && Localisation.temps(etat.table, 'P', h, d), q = etat.table && Localisation.temps(etat.table, 'S', h, d);
      return { P: p ? t0 + p : null, S: q ? t0 + q : null };
    });
  }
  // Point à la distance d (°) et à l'azimut az (°) d'un point (sphère).
  function destination(lat, lon, d, az) {
    const r = Math.PI / 180, p1 = lat * r, l1 = lon * r, dr = d * r, a = az * r;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(a));
    return [p2 / r, (l1 + Math.atan2(Math.sin(a) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2))) / r];
  }
  function dessinerCarteReelle() {
    lireCouleurs();
    const cv = $('#r-carte'), { ctx, W, H } = preparer(cv), L = etat.loc, e = etat.reel ? etat.reel.seisme : null;
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    if (!etat.reel) { ctx.fillStyle = COUL.muted; ctx.font = `700 12px ${POLICE}`; ctx.textAlign = 'center'; ctx.fillText('Chargez un fichier de séisme.', W / 2, H / 2); return; }
    // cadre : stations, solution et (après comparaison) celle du catalogue, avec une marge
    const pts = [...STATIONS.map(s => [s.lat, s.lon]), ...(L ? [[L.lat, L.lon]] : []), ...(etat.verifie ? [[e.lat, e.lon]] : [])];
    let la0 = Math.min(...pts.map(p => p[0])), la1 = Math.max(...pts.map(p => p[0])), lo0 = Math.min(...pts.map(p => p[1])), lo1 = Math.max(...pts.map(p => p[1]));
    const latc = (la0 + la1) / 2, kx = Math.cos((latc * Math.PI) / 180), m = 26;
    const etendue = Math.max(2, (la1 - la0) * 1.25, (lo1 - lo0) * kx * 1.25);
    const k = Math.min(W - 2 * m, H - 2 * m) / etendue, cx = (lo0 + lo1) / 2, cy = latc;
    const X = lon => W / 2 + (lon - cx) * kx * k, Y = lat => H / 2 - (lat - cy) * k;
    // graticule
    const pas = etendue > 30 ? 10 : etendue > 12 ? 5 : etendue > 5 ? 2 : 1;
    ctx.font = `10px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.lineWidth = 1;
    const la = [cy - (H / 2) / k, cy + (H / 2) / k], lo = [cx - (W / 2) / (kx * k), cx + (W / 2) / (kx * k)];
    for (let v = Math.ceil(lo[0] / pas) * pas; v <= lo[1]; v += pas) { ctx.strokeStyle = COUL.grid; ctx.beginPath(); ctx.moveTo(Math.round(X(v)) + 0.5, 0); ctx.lineTo(Math.round(X(v)) + 0.5, H); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.abs(v)}°${v < 0 ? 'O' : 'E'}`, X(v), H - 3); }
    for (let v = Math.ceil(la[0] / pas) * pas; v <= la[1]; v += pas) { ctx.strokeStyle = COUL.grid; ctx.beginPath(); ctx.moveTo(0, Math.round(Y(v)) + 0.5); ctx.lineTo(W, Math.round(Y(v)) + 0.5); ctx.stroke(); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.abs(v)}°${v < 0 ? 'S' : 'N'}`, 3, Y(v) - 1); }
    // côtes (Natural Earth, bassin méditerranéen)
    if (etat.cotes) {
      ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.beginPath();
      for (const l of etat.cotes.cotes) for (let i = 0; i < l.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(l[i]), Y(l[i + 1]));
      ctx.stroke();
    }
    // zone compatible
    if (L) {
      ctx.fillStyle = COUL.amp; ctx.globalAlpha = 0.22;
      const c = Math.max(1, 0.05 * k);
      for (const [a, b] of L.zone) ctx.fillRect(X(b) - (c * kx) / 2, Y(a) - c / 2, Math.max(1, c * kx), c);
      ctx.globalAlpha = 1;
    }
    // cercles : distance épicentrale tirée de S − P (table, foyer à la profondeur trouvée, 10 km sinon)
    STATIONS.forEach((s, j) => {
      const p = etat.pointes[j];
      if (p.P === null || p.S === null || p.S <= p.P) return;
      const d = Localisation.distanceSP(etat.table, p.S - p.P, L ? L.h : 10);
      if (d === null) return;
      ctx.save(); ctx.strokeStyle = COUL.blue; ctx.globalAlpha = 0.75; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const [a, b] = destination(s.lat, s.lon, d, i * 3); (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(b), Y(a)); }
      ctx.stroke(); ctx.restore();
    });
    if (L) etoile(ctx, X(L.lon), Y(L.lat), 9, COUL.amp);
    if (etat.verifie) etoile(ctx, X(e.lon), Y(e.lat), 9, COUL.vrai);
    STATIONS.forEach(s => {
      const x = X(s.lon), y = Y(s.lat);
      ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 7, y + 5); ctx.lineTo(x + 7, y + 5); ctx.closePath(); ctx.fill();
      ctx.font = `800 11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      texteHalo(ctx, s.nom, x + 9, y - 1, COUL.ink);
    });
    $('#r-carte-legende').innerHTML = `Cercles bleus : distance épicentrale tirée de S − P · <span style="color:var(--amp)">★ votre solution</span>${etat.verifie ? ` · <span style="color:var(--vrai)">★ ${nomCat(etat.reel.seisme)}</span>` : ''}`;
  }

  // ── Wadati ──────────────────────────────────────────────────────────────
  function dessinerWadati() {
    lireCouleurs();
    const cv = $('#r-wadati'), { ctx, W, H } = preparer(cv), m = { g: 40, d: 12, h: 12, b: 30 };
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const pts = etat.pointes.map((p, k) => (p.P !== null && p.S !== null && p.S > p.P ? [p.P, p.S - p.P, k] : null)).filter(Boolean);
    const w = etat.wad, txt = $('#r-wadati-texte');
    if (!pts.length) { txt.textContent = 'Pointez P et S sur au moins deux stations.'; }
    const xsMin = Math.min(...pts.map(q => q[0]), w ? w.t0 : Infinity), xsMax = Math.max(...pts.map(q => q[0]));
    const xa = pts.length ? Math.floor(Math.min(xsMin, xsMax - 5) - 1) : 0, xb = pts.length ? Math.ceil(xsMax + 2) : 30;
    const yb = pts.length ? Math.ceil(Math.max(...pts.map(q => q[1])) * 1.15 + 0.5) : 10;
    const X = x => m.g + ((x - xa) / (xb - xa)) * (W - m.g - m.d), Y = y => H - m.b - (y / yb) * (H - m.b - m.h);
    ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.g, m.h); ctx.lineTo(m.g, H - m.b); ctx.lineTo(W - m.d, H - m.b); ctx.stroke();
    ctx.font = `10px ${MONO}`; ctx.fillStyle = COUL.muted;
    const px = pasTemps(xb - xa, W - m.g - m.d), py = pasTemps(yb, (H - m.b - m.h) * 1.6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(xa / px) * px; v <= xb; v += px) { ctx.fillText(virg(v, px < 1 ? 1 : 0), X(v), H - m.b + 4); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = 0; v <= yb; v += py) { ctx.fillText(virg(v, py < 1 ? 1 : 0), m.g - 5, Y(v)); ctx.strokeStyle = COUL.grid; ctx.beginPath(); ctx.moveTo(m.g + 1, Y(v)); ctx.lineTo(W - m.d, Y(v)); ctx.stroke(); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('tP (s)', W - m.d, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('tS − tP (s)', m.g + 6, m.h + 2);
    if (w) {
      ctx.strokeStyle = COUL.cyan; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(w.t0), Y(0)); ctx.lineTo(X(xb), Y(w.pente * (xb - w.t0))); ctx.stroke();
      ctx.fillStyle = COUL.cyan; ctx.beginPath(); ctx.arc(X(w.t0), Y(0), 4, 0, 2 * Math.PI); ctx.fill();
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = `800 10.5px ${POLICE}`; ctx.fillText('t₀', X(w.t0) + 5, Y(0) - 3);
      txt.innerHTML = `Pente ${virg(w.pente, 3)} → <b>Vp/Vs = ${virg(w.vpvs, 2)}</b> (modèle : ${virg(SM.MODELE.vp1 / SM.MODELE.vs1, 2)}) · <b>t₀ = ${horloge(w.t0)} UTC</b>.`
        + (Math.abs(w.vpvs - SM.MODELE.vp1 / SM.MODELE.vs1) > 0.08 ? ' Écart notable au modèle : un pointé S ou P est sans doute mal placé, ou la première P est une Pn.' : '');
    } else if (pts.length) txt.textContent = 'Il faut au moins deux stations avec P et S, à des distances différentes.';
    for (const [x, y, k] of pts) {
      ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.arc(X(x), Y(y), 4, 0, 2 * Math.PI); ctx.fill();
      ctx.font = `700 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; texteHalo(ctx, STATIONS[k].nom, X(x) + 5, Y(y) - 2, COUL.ink);
    }
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majResultats() {
    const L = etat.loc, w = etat.wad;
    const qualiteGap = g => (g <= 180 ? 'séisme dans le réseau' : 'séisme hors du réseau');
    $('#r-afficheurs').innerHTML = [
      reel()
        ? afficheur('Épicentre', L ? `${virg(L.lat, 2)}° N ; ${virg(L.lon, 2)}° E` : '—', L ? 'latitude ; longitude' : 'P sur 3 stations au moins')
        : afficheur('Épicentre (x ; y)', L ? `${virg(L.x, 1)} ; ${virg(L.y, 1)}` : '—', L ? 'km depuis SIM1, x vers l\'est' : 'P sur 3 stations au moins'),
      afficheur('Profondeur', L ? virg(L.h, 1) + ' km' : '—', L ? (reel() ? 'cherchée de 0 à 40 km, mal contrainte' : 'souvent mal contrainte') : ''),
      afficheur("Heure d'origine", L ? horloge(L.t0) : '—', L ? 'UTC, ajustée' : ''),
      afficheur('Résidu quadratique', L ? virg(L.rms, 2) + ' s' : '—', L ? `${L.nObs} lectures` : ''),
      afficheur('Gap azimutal', L ? Math.round(L.gap) + '°' : '—', L ? qualiteGap(L.gap) : ''),
      afficheur('Vp/Vs (Wadati)', w ? virg(w.vpvs, 2) : '—', w ? 'modèle : 1,71' : '2 stations P et S'),
      afficheur('t₀ (Wadati)', w ? horloge(w.t0) : '—', w ? 'UTC' : ''),
      afficheur('Stations pointées', `${etat.pointes.filter(p => p.P !== null).length} P · ${etat.pointes.filter(p => p.S !== null).length} S`, `sur ${STATIONS.length}`),
    ].join('');
    const lignes = STATIONS.map((s, k) => {
      const p = etat.pointes[k], r = L ? L.residus[k] : null, dts = p.P !== null && p.S !== null && p.S > p.P ? p.S - p.P : null;
      const ecart = v => (v !== null && Math.abs(v) > 0.5 ? ' class="n ecart"' : ' class="n"');
      return `<tr><td><b>${s.nom}</b></td><td class="n">${p.P !== null ? virg(p.P, 2) : '—'}</td><td class="n">${p.S !== null ? virg(p.S, 2) : '—'}</td>`
        + `<td class="n">${dts !== null ? virg(dts, 2) : '—'}</td><td class="n">${dts !== null ? virg(distanceSP(dts), dts > 30 ? 0 : 1) : '—'}</td>`
        + `<td${ecart(r && r.dP)}>${r && r.dP !== null ? signe(r.dP) : '—'}</td><td${ecart(r && r.dS)}>${r && r.dS !== null ? signe(r.dS) : '—'}</td></tr>`;
    });
    $('#r-residus').innerHTML = `<thead><tr><th>Station</th><th>tP (s)</th><th>tS (s)</th><th>S − P</th><th>${reel() ? 'Δ (km)' : 'R (km)'}</th><th>Résidu P</th><th>Résidu S</th></tr></thead><tbody>${lignes.join('')}</tbody>`;
  }
  // Distance tirée de S − P : hypocentrale par la croûte du cours (réseau simulé), épicentrale par la table (réel).
  function distanceSP(dts) {
    if (!reel()) return SM.distanceSP(dts);
    const d = etat.table ? Localisation.distanceSP(etat.table, dts, etat.loc ? etat.loc.h : 10) : null;
    return d === null ? null : Localisation.km(d);
  }
  function majVoie() {
    const f = FILTRES[etat.filtre];
    if (reel()) {
      const r = etat.reel;
      if (!r) { $('#r-voie').innerHTML = '<span>Aucun fichier chargé</span>'; return; }
      $('#r-voie').innerHTML = `<span><b>${[...new Set(STATIONS.map(st => st.reseau))].join(', ')} · ${STATIONS.length} stations</b></span><span>vitesse du sol, trois composantes</span><span>${f ? `filtre ${virg(f[0], f[0] < 1 ? 1 : 0)}–${virg(f[1], 0)} Hz` : 'sans filtre'}</span><span>début ${new Date(r.debut).toISOString().slice(0, 10)} ${horloge(0)} UTC</span>`;
      STATIONS.forEach((st, k) => {
        const el = $(`#r-info-${k}`);
        if (!el) return;
        const d = etat.verifie ? Localisation.distanceAzimut(r.seisme.lat, r.seisme.lon, st.lat, st.lon).distance : null;
        el.textContent = `${st.pays || ''}${st.pays ? ' · ' : ''}${virg(st.lat, 2)}° N, ${virg(st.lon, 2)}° E${d !== null ? ` · Δ = ${virg(d, 2)}° (${Math.round(Localisation.km(d))} km) de l'épicentre de ${nomCat(etat.reel.seisme)}` : ''}`;
      });
      return;
    }
    $('#r-voie').innerHTML = `<span><b>XX.SIM1…SIM4.00.HH?</b></span><span>vélocimètres large bande, vitesse</span><span>${f ? `filtre ${virg(f[0], 0)}–${virg(f[1], 0)} Hz` : 'sans filtre'}</span><span>début ${horloge(0)} UTC</span>`;
    STATIONS.forEach((s, k) => {
      const ev = etat.evs[k], el = $(`#r-info-${k}`);
      if (!el || !ev) return;
      el.textContent = etat.mode === 'explorer' || etat.verifie ? `Δ = ${virg(ev.p.delta, 1)} km · azimut du séisme ${Math.round(ev.p.baz)}°` : '';
    });
  }
  function majAide() {
    const t = {
      P: '<strong>Pointer P</strong> sur la station où vous cliquez. Après un P, l\'outil passe à S. Double-clic pour zoomer : toutes les stations suivent.',
      S: '<strong>Pointer S</strong> : sur les horizontales (N, E), la reprise d\'amplitude après la coda de la P. Après un S, l\'outil revient à P pour la station suivante.',
    }[etat.outil] || 'Glissez pour vous déplacer, double-cliquez pour zoomer. Toutes les stations partagent le même axe des temps.';
    $('#r-aide').innerHTML = t;
  }
  function majVerite() {
    if (reel()) {
      const r = etat.reel;
      $('#r-reel-info').innerHTML = r ? `<b>Fichier chargé :</b> séisme du ${new Date(r.seisme.temps).toISOString().slice(0, 10)} (${r.seisme.region || 'région inconnue'}), ${STATIONS.length} stations${r.ecartees.length ? ` (${r.ecartees.join(', ')} sans verticale, écartée${r.ecartees.length > 1 ? 's' : ''})` : ''}. Fenêtre de ${Math.round((r.fin - r.debut) / 60000)} min.` : 'Aucun fichier chargé.';
      return;
    }
    if (etat.mode !== 'explorer') return;
    const p = etat.explo, t0 = etat.t0;
    $('#r-verite').innerHTML = `<b>Vérité terrain.</b> Épicentre (${virg(p.x, 1)} ; ${virg(p.y, 1)}) km, h = ${p.h} km, Mw ${virg(p.Mw, 1)}, origine à <b>${horloge(-t0)} UTC</b>.`
      + (etat.evs.some(ev => ev.tt.tPn !== null && ev.tt.tPn < ev.tt.tPg) ? ' <br><b>Attention :</b> une station au moins reçoit la Pn en premier ; Wadati et S − P en sont faussés.' : '');
  }
  function majOutils() { $$('[data-r-outil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rOutil === etat.outil))); }
  function tout() { majOutils(); majVoie(); dessinerTraces(); dessinerCarte(); dessinerWadati(); majResultats(); majAide(); majVerite(); majReel(); }

  // ── Exercice ────────────────────────────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 104729 + 3);
    let x, y;
    do { x = u.entre(-85, 105); y = u.entre(-100, 75); } while (Math.max(...STATIONS.map(s => Math.hypot(x - s.x, y - s.y))) > 135);
    etat.exo = {
      numero, bruit: ['calme', 'standard', 'standard', 'urbain'][Math.floor(u() * 4)],
      p: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, h: Math.round(u.entre(4, 20)), Mw: Math.round(u.entre(3.0, 4.4) * 10) / 10, graine: numero },
    };
    etat.outil = 'P'; etat.filtre = 'aucun'; $('#r-filtre').value = 'aucun';
    $('#r-exo-num').textContent = 'Exercice n° ' + numero;
    $('#r-corrige').innerHTML = '';
    plusTard(regenerer);
  }
  function verifier() {
    const v = vraies(), p = etat.exo.p, L = etat.loc, ok = [];
    const lignes = STATIONS.map((s, k) => {
      const q = etat.pointes[k], okP = q.P !== null && Math.abs(q.P - v[k].P) <= 0.25, okS = q.S !== null && Math.abs(q.S - v[k].S) <= 0.6;
      ok.push(okP, okS);
      const cel = (t, vrai, b) => `<td class="n"><span class="verdict ${b ? 'ok' : 'ko'}">${b ? '✓' : '✗'}</span> ${t !== null ? signe(t - vrai) + ' s' : '—'}</td>`;
      return `<tr class="${okP && okS ? 'ok' : 'ko'}"><td><b>${s.nom}</b></td>${cel(q.P, v[k].P, okP)}${cel(q.S, v[k].S, okS)}</tr>`;
    });
    const errEpi = L ? Math.hypot(L.x - p.x, L.y - p.y) : null, errT0 = L ? L.t0 - -etat.t0 : null;
    const okEpi = errEpi !== null && errEpi <= 5, okT0 = errT0 !== null && Math.abs(errT0) <= 0.5;
    ok.push(okEpi, okT0);
    etat.verifie = true;
    $('#r-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Station</th><th>Écart P</th><th>Écart S</th></tr></thead><tbody>${lignes.join('')}
      <tr class="${okEpi ? 'ok' : 'ko'}"><td><span class="verdict ${okEpi ? 'ok' : 'ko'}">${okEpi ? '✓' : '✗'}</span> Épicentre</td><td class="n" colspan="2">${errEpi !== null ? virg(errEpi, 1) + ' km d\'erreur' : '—'}<br><small style="color:var(--muted)">tolérance 5 km</small></td></tr>
      <tr class="${okT0 ? 'ok' : 'ko'}"><td><span class="verdict ${okT0 ? 'ok' : 'ko'}">${okT0 ? '✓' : '✗'}</span> Heure d'origine</td><td class="n" colspan="2">${errT0 !== null ? signe(errT0) + ' s' : '—'}<br><small style="color:var(--muted)">tolérance 0,5 s</small></td></tr>
      </tbody></table></div>
      <p class="score">${ok.filter(Boolean).length} / ${ok.length} justes</p>
      <p class="verite"><b>Le séisme :</b> épicentre (${virg(p.x, 1)} ; ${virg(p.y, 1)}) km, h = ${p.h} km${L ? ` (calculée : ${virg(L.h, 1)} km, non notée)` : ''}, Mw ${virg(p.Mw, 1)}, origine à ${horloge(-etat.t0)} UTC.
      Tolérances des pointés : ±0,25 s en P, ±0,6 s en S. L'étoile verte et les arrivées vraies (étiquettes P et S vertes) sont maintenant affichées.</p>`;
    tout();
  }

  // ── Séisme réel : chargement du fichier, comparaison au catalogue ─────────────────────────────────────────────
  async function chargerFichier(fichier) {
    const info = $('#r-reel-info');
    try {
      if (fichier.size > 40 * 1024 * 1024) throw new Error('fichier trop gros (40 Mo au plus)');
      info.textContent = 'Lecture du fichier…';
      // fichier partagé avec les bancs « mécanisme » et « source » (src/seisme-reel.js)
      const [c, cotes] = await Promise.all([SeismeReel.charger(fichier), etat.cotes || chargerCotes()]);
      etat.table = c.table; etat.cotes = cotes; etat.reel = c.dossier;
      activerReel();
    } catch (err) {
      info.textContent = `Fichier refusé : ${err.message || err}.`;
    }
  }
  const chargerCotes = () => fetch('data/cotes-mediterranee.json').then(r => r.json()).catch(() => null);
  // Séisme chargé ou polarités modifiées dans un autre banc : reprise de l'état partagé (pointés et polarités compris).
  function reprendre() {
    const c = SeismeReel.courant();
    if (!c || c.version === etat.version) return false;
    if (c.dossier !== etat.reel) {
      etat.reel = c.dossier; etat.table = c.table;
      if (!etat.cotes) chargerCotes().then(x => { etat.cotes = x; if (reel()) dessinerCarte(); });
      activerReel();
    } else { etat.pointes = c.pointes.map(p => ({ ...p })); etat.polarites = c.polarites.slice(); etat.version = c.version; relocaliser(); }
    return true;
  }
  function activerReel() {
    const f = etat.reel, c = SeismeReel.courant(), partage = c && c.dossier === f;
    STATIONS = f.stations.map(st => ({ nom: st.station, reseau: st.reseau, lat: st.lat, lon: st.lon, pays: st.pays, voies: st.voies }));
    etat.dt = f.dt; etat.n = f.n; etat.t0 = 0; etat.evs = [];
    etat.debutUTC = (((f.debut % 86400000) + 86400000) % 86400000) / 1000;
    etat.vue = [0, duree()]; etat.pointes = partage ? c.pointes.map(p => ({ ...p })) : vide(); etat.verifie = false; etat.outil = 'P';
    // Wood-Anderson des horizontales, sans filtre (ML se mesure ainsi), une fois pour toutes
    etat.wa = f.stations.map(st => [SM.woodAndersonVitesse(st.series[1], f.dt), SM.woodAndersonVitesse(st.series[2], f.dt)]);
    etat.polarites = partage ? c.polarites.slice() : STATIONS.map(() => 0); etat.meca = null;
    if (partage) etat.version = c.version;
    $('#r-corrige-reel').innerHTML = '';
    construireTraces(); reconvertir();
  }
  function comparer() {
    const r = etat.reel, L = etat.loc;
    if (!r) return;
    const e = r.seisme, t0 = origineGeofon(), prev = prevuesGeofon();
    const lignes = STATIONS.map((st, k) => {
      const q = etat.pointes[k], cel = (t, v) => `<td class="n">${t !== null && v !== null ? signe(t - v) + ' s' : '—'}</td>`;
      return `<tr><td><b>${st.nom}</b></td>${cel(q.P, prev[k].P)}${cel(q.S, prev[k].S)}</tr>`;
    });
    const dEpi = L ? Localisation.km(Localisation.distanceAzimut(L.lat, L.lon, e.lat, e.lon).distance) : null, dT0 = L ? L.t0 - t0 : null;
    const okEpi = dEpi !== null && dEpi <= 30, okT0 = dT0 !== null && Math.abs(dT0) <= 3;
    etat.verifie = true;
    $('#r-corrige-reel').innerHTML = `<div class="separateur"></div><p class="sous-titre">Comparaison au catalogue (${nomCat(e)})</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Station</th><th>P − P prévue</th><th>S − S prévue</th></tr></thead><tbody>${lignes.join('')}
      <tr class="${okEpi ? 'ok' : 'ko'}"><td><span class="verdict ${okEpi ? 'ok' : 'ko'}">${okEpi ? '✓' : '✗'}</span> Épicentre</td><td class="n" colspan="2">${dEpi !== null ? `${Math.round(dEpi)} km de celui de ${nomCat(e)}` : '—'}<br><small style="color:var(--muted)">repère : 30 km</small></td></tr>
      <tr class="${okT0 ? 'ok' : 'ko'}"><td><span class="verdict ${okT0 ? 'ok' : 'ko'}">${okT0 ? '✓' : '✗'}</span> Heure d'origine</td><td class="n" colspan="2">${dT0 !== null ? signe(dT0, 1) + ' s' : '—'}<br><small style="color:var(--muted)">repère : 3 s</small></td></tr>
      </tbody></table></div>
      <p class="verite"><b>${nomCat(e)} :</b> ${virg(e.lat, 2)}° N, ${virg(e.lon, 2)}° E, h = ${virg(e.h, 0)} km, origine à ${horloge(t0)} UTC, M ${virg(e.mag, 1)} ${e.typeMag || ''} (${e.region || ''}, identifiant ${e.id}).
      Les arrivées prévues pour cette solution (table de la croûte du cours puis ak135) sont maintenant tracées en vert : un écart de quelques
      secondes est normal (modèle de Terre moyen, pointés). ${nomCat(e)} localise avec bien plus de stations : sa solution n'est pas exacte non plus.</p>`;
    tout();
  }

  // ── Séisme réel : magnitude locale et mécanisme au foyer ─────────────────────────────────────────────────
  // Distance (°), distance hypocentrale (km), azimut depuis l'épicentre et arrivées prévues d'une station, pour la
  // solution de l'étudiant (ou, faute de solution, rien).
  const geometrieReelle = k => (etat.loc && etat.table ? Localisation.rai(etat.table, etat.loc, STATIONS[k]) : null);
  function majReel() {
    const r = reel();
    $('#r-carte-ml').hidden = !r; $('#r-carte-meca').hidden = !r;
    if (!r) return;
    majMagnitude(); majMecanisme();
  }
  // ML : Wood-Anderson des deux horizontales, de P à la fin de la coda de S (S + 1,5 (S − P), 30 s au moins) ; pointés
  // de l'étudiant, sinon arrivées prévues pour sa solution.
  function majMagnitude() {
    const div = $('#r-ml');
    if (!etat.reel || !etat.loc) { div.innerHTML = '<p class="aide">Localisez d\'abord le séisme (pointés P et S) : la magnitude demande la distance de chaque station.</p>'; return; }
    const res = STATIONS.map((st, k) => {
      const g = geometrieReelle(k), p = etat.pointes[k], tP = p.P ?? g.tP, tS = p.S ?? g.tS;
      if (tP === null || tS === null) return null;
      return { st, ...Reel.magnitudeStation(etat.wa[k], etat.dt, tP - 1, tS + Math.max(30, 1.5 * (tS - tP)), g.R) };
    });
    const reseau = Reel.magnitudeReseau(res), e = etat.reel.seisme, mil = x => Math.round(x).toLocaleString('fr-FR');
    const lignes = res.map((m, k) => (m ? `<tr class="${m.domaine ? '' : 'hors'}"><td><b>${STATIONS[k].nom}</b>${etat.reel.stations[k].approchee ? ' <small title="sensibilité de la verticale">≈</small>' : ''}</td><td class="n">${mil(m.R)}</td><td class="n">${mil(m.N.Anm)}</td><td class="n">${mil(m.E.Anm)}</td><td class="n">${m.domaine ? virg(m.ML, 2) : `<small>hors domaine (${virg(m.ML, 1)})</small>`}</td></tr>` : `<tr><td><b>${STATIONS[k].nom}</b></td><td class="n" colspan="4">—</td></tr>`));
    div.innerHTML = `<div class="afficheurs deux">${afficheur('ML du réseau', reseau ? virg(reseau.ML, 1) : '—', reseau ? `${reseau.n} station${reseau.n > 1 ? 's' : ''}${reseau.ecart !== null ? `, écart type ${virg(reseau.ecart, 2)}` : ''}` : `aucune station entre ${Reel.RMIN} et ${Reel.RMAX} km`)}${afficheur(nomCat(e), etat.verifie ? `${virg(e.mag, 1)} ${e.typeMag || ''}` : '—', etat.verifie ? 'magnitude du catalogue' : 'après « Comparer au catalogue »')}</div>
      <div class="table-defile" style="margin-top:10px"><table class="resultats"><thead><tr><th>Station</th><th>R (km)</th><th>A N (nm)</th><th>A E (nm)</th><th>ML</th></tr></thead><tbody>${lignes.join('')}</tbody></table></div>
      <p class="formule">ML = log A + 1,11 log R + 0,00189 R − 2,09 (A : amplitude maximale du Wood-Anderson en nm, R : distance hypocentrale en km), moyenne des deux horizontales, puis des stations de ${Reel.RMIN} à ${Reel.RMAX} km.</p>
      ${etat.verifie ? `<p class="aide">${nomCat(e)} publie souvent mb, Mw ou la ML de son propre réseau : quelques dixièmes d'écart sont normaux. Au-delà de 600 km, la loi de ML ne vaut plus.</p>` : ''}`;
  }
  // Mécanisme : polarités de la première P (C : le sol monte, D : il descend) placées sur la sphère focale par l'azimut et
  // l'angle de départ de chaque rai (solution de l'étudiant), puis recherche exhaustive des plans nodaux.
  const lecturesMeca = () => STATIONS.map((st, k) => {
    const g = geometrieReelle(k), p = etat.polarites[k];
    return g && g.i !== null && p ? { az: g.azimut, i: g.i, polarite: p, k } : null;
  }).filter(Boolean);
  function majMecanisme() {
    const div = $('#r-meca-stations');
    if (!etat.reel) return;
    div.innerHTML = STATIONS.map((st, k) => {
      const g = geometrieReelle(k), p = etat.polarites[k];
      const b = (v, t) => `<button type="button" class="outil${v === 1 ? ' p' : v === -1 ? ' s' : ' neutre'}" data-r-pol="${k}" data-v="${v}" aria-pressed="${p === v}">${t}</button>`;
      return `<div class="pol-ligne"><b>${st.nom}</b><small>${g ? `az. ${Math.round(g.azimut)}° · i ${g.i !== null ? Math.round(g.i) : '—'}°` : 'localisez d\'abord'}</small><span>${b(1, 'C')}${b(-1, 'D')}${b(0, '?')}</span></div>`;
    }).join('');
    div.querySelectorAll('[data-r-pol]').forEach(x => x.addEventListener('click', () => { etat.polarites[+x.dataset.rPol] = +x.dataset.v; etat.meca = null; etat.messageMeca = ''; publierPolarites(); majMecanisme(); }));
    dessinerSphereReelle();
  }
  const publierPolarites = () => { etat.version = SeismeReel.publier({ polarites: etat.polarites }); };
  function lirePolarites() {
    let n = 0, pointees = 0;
    STATIONS.forEach((st, k) => {
      const p = etat.pointes[k].P;
      if (p === null) return;
      pointees++;
      etat.polarites[k] = Reel.polarite(etat.reel.stations[k].series[0], etat.dt, p);
      if (etat.polarites[k]) n++;
    });
    etat.meca = null; publierPolarites();
    etat.messageMeca = !pointees ? 'Pointez d\'abord P : la polarité se lit juste après le pointé.'
      : `${n} polarité${n > 1 ? 's' : ''} lue${n > 1 ? 's' : ''} sur ${pointees} pointé${pointees > 1 ? 's' : ''} P (premier écart de plus de trois fois le bruit, dans la seconde qui suit)${n < pointees ? ' ; ailleurs rien ne sort du bruit : pointez P au tout début de l\'arrivée, ou lisez à l\'œil' : ''}. Vérifiez chacune en zoomant sur l'arrivée.`;
    majMecanisme();
  }
  function inverserMeca() {
    const l = lecturesMeca();
    if (l.length < 6) { etat.messageMeca = `Il faut au moins 6 polarités (${l.length} pour l'instant), autour du foyer.`; dessinerSphereReelle(); return; }
    etat.meca = Mecanisme.inverser(l, 10); etat.messageMeca = '';
    dessinerSphereReelle();
  }
  function dessinerSphereReelle() {
    lireCouleurs();
    const cv = $('#r-sphere');
    if (!cv || cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), R = Math.min(W, H) / 2 - 26, cx = W / 2, cy = H / 2 + 4, RAD = Math.PI / 180;
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const planNodal = mec => {
      const f = mec.azimut * RAD, d = mec.pendage * RAD, a = [Math.cos(f), Math.sin(f), 0], b = [-Math.cos(d) * Math.sin(f), Math.cos(d) * Math.cos(f), Math.sin(d)];
      ctx.beginPath();
      for (let k = 0; k <= 90; k++) {
        const th = (k * Math.PI) / 90, v = [0, 1, 2].map(j => Math.cos(th) * a[j] + Math.sin(th) * b[j]);
        const p = Mecanisme.projection(Math.acos(Math.max(-1, Math.min(1, v[2]))) / RAD, Math.atan2(v[1], v[0]) / RAD);
        (k ? ctx.lineTo : ctx.moveTo).call(ctx, cx + R * p.x, cy - R * p.y);
      }
      ctx.stroke();
    };
    const m = etat.meca, l = lecturesMeca(), best = m && m.solutions.length ? m.solutions[0] : null;
    if (best) {
      // quadrants en compression de la première solution (trame), famille des solutions équivalentes, plans nodaux
      const M = Mecanisme.tenseur(best.azimut, best.pendage, best.glissement);
      ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.2;
      for (let y = -R; y <= R; y += 3) for (let x = -R; x <= R; x += 3) { const q = Mecanisme.projectionInverse(x / R, -y / R); if (q && Mecanisme.rayonnementP(M, q.i, q.phi) > 0) ctx.fillRect(cx + x - 1.5, cy + y - 1.5, 3, 3); }
      ctx.globalAlpha = 0.3; ctx.strokeStyle = COUL.amp; ctx.lineWidth = 0.6;
      for (const sol of m.solutions.slice(0, 150)) { planNodal(sol); planNodal(Mecanisme.planAuxiliaire(sol.azimut, sol.pendage, sol.glissement)); }
      ctx.globalAlpha = 1; ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2;
      planNodal(best); planNodal(Mecanisme.planAuxiliaire(best.azimut, best.pendage, best.glissement));
      const ax = Mecanisme.axes(M);
      ctx.font = `900 14px ${POLICE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [nom, a] of [['P', ax.P], ['T', ax.T]]) { const p = Mecanisme.projection(90 - a.plongement, a.azimut); texteHalo(ctx, nom, cx + R * p.x, cy - R * p.y, COUL.ink); }
    }
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.font = `800 12px ${POLICE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; texteHalo(ctx, 'N', cx, cy - R - 6, COUL.ink);
    for (const q of l) {
      const p = Mecanisme.projection(q.i, q.az), x = cx + R * p.x, y = cy - R * p.y;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI);
      if (q.polarite > 0) { ctx.fillStyle = COUL.ink; ctx.fill(); } else { ctx.fillStyle = COUL.paper; ctx.fill(); ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.6; ctx.stroke(); }
      ctx.font = `700 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; texteHalo(ctx, STATIONS[q.k].nom, x + 8, y, COUL.muted);
    }
    const txt = $('#r-meca-texte');
    if (best) {
      const aux = Mecanisme.planAuxiliaire(best.azimut, best.pendage, best.glissement);
      txt.innerHTML = `<b>${m.desaccords} désaccord${m.desaccords > 1 ? 's' : ''}</b> sur ${l.length} polarités ; ${m.solutions.length} mécanisme${m.solutions.length > 1 ? 's' : ''} les atteignent au pas de 10° (traits orangés). Premier : plan ${best.azimut}° / ${best.pendage}° / ${best.glissement}°, plan auxiliaire ${Math.round(aux.azimut)}° / ${Math.round(aux.pendage)}° / ${Math.round(aux.glissement)}° : faille <b>${Mecanisme.typeFaille(best.glissement)}</b>${m.solutions.length > 20 ? '. Les solutions sont nombreuses : ajoutez des polarités, surtout dans les directions vides' : ''}.`;
    } else txt.textContent = etat.messageMeca || (l.length ? `${l.length} polarité${l.length > 1 ? 's' : ''} sur la sphère (hémisphère inférieur, projection de Schmidt). « Inverser » cherche les plans nodaux.` : 'Indiquez la polarité de la première P à chaque station (C : le sol monte, D : il descend), ou « Lire les polarités ».');
  }

  // ── Construction et événements ──────────────────────────────────────────
  function construireTraces() {
    if (!STATIONS.length) { $('#r-traces').innerHTML = '<p class="aide">Chargez un fichier de séisme dans le panneau « Séisme réel ».</p>'; return; }
    $('#r-traces').innerHTML = STATIONS.map((s, k) => `<div class="r-station"><p class="voie"><b>${s.reseau || 'XX'}.${s.nom}</b><span id="r-info-${k}"></span></p>`
      + `<canvas class="r-canvas" id="r-cv-${k}" data-k="${k}" tabindex="0" aria-label="Station ${s.nom}, trois composantes"></canvas></div>`).join('');
    $$('.r-canvas').forEach(cv => brancherTrace(cv, parseInt(cv.dataset.k, 10)));
  }
  function fixerVue(a, b) {
    const T = duree(), d = Math.min(T, Math.max(0.5, b - a));
    a = Math.min(Math.max(0, a), T - d);
    etat.vue = [a, a + d];
  }
  function zoomer(f, tc) {
    const [a, b] = etat.vue, c = tc === undefined ? (a + b) / 2 : tc, r = (c - a) / (b - a), d = (b - a) * f;
    fixerVue(c - r * d, c - r * d + d); dessinerTraces();
  }
  function choisirOutil(o) { etat.outil = etat.outil === o ? null : o; majOutils(); majAide(); }
  function brancherTrace(cv, k) {
    let glisse = null;
    cv.addEventListener('pointerdown', e => { cv.focus({ preventScroll: true }); cv.setPointerCapture(e.pointerId); glisse = { x: e.offsetX, vue: etat.vue.slice(), bouge: false }; });
    cv.addEventListener('pointermove', e => {
      etat.curseurX = e.offsetX;
      const t = xVersT(e.offsetX, geometrie(cv));
      $('#r-curseur').textContent = `t = ${virg(t, 2)} s · ${horloge(t)} UTC`;
      if (glisse) {
        const dx = e.offsetX - glisse.x;
        if (Math.abs(dx) > 4) glisse.bouge = true;
        if (glisse.bouge) { const g = geometrie(cv), dT = (dx / (g.x1 - g.x0)) * (glisse.vue[1] - glisse.vue[0]); fixerVue(glisse.vue[0] - dT, glisse.vue[1] - dT); cv.classList.add('glisse'); }
      }
      dessinerTraces();
    });
    const fin = e => {
      if (glisse && !glisse.bouge && e.type === 'pointerup' && etat.outil) {
        const t = Math.max(0, Math.min(duree(), xVersT(e.offsetX, geometrie(cv))));
        etat.pointes[k][etat.outil] = t;
        etat.outil = etat.outil === 'P' ? 'S' : 'P';
        if (etat.verifie) { etat.verifie = false; $('#r-corrige').innerHTML = ''; $('#r-corrige-reel').innerHTML = ''; }
        relocaliser();
      }
      glisse = null; cv.classList.remove('glisse');
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
    cv.addEventListener('pointerleave', () => { etat.curseurX = null; dessinerTraces(); });
    cv.addEventListener('dblclick', e => zoomer(0.4, xVersT(e.offsetX, geometrie(cv))));
    cv.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.shiftKey) return;
      e.preventDefault();
      if (e.ctrlKey) zoomer(e.deltaY > 0 ? 1.25 : 0.8, xVersT(e.offsetX, geometrie(cv)));
      else { const d = etat.vue[1] - etat.vue[0], s = Math.sign(e.deltaY || e.deltaX) * d * 0.1; fixerVue(etat.vue[0] + s, etat.vue[1] + s); dessinerTraces(); }
    }, { passive: false });
    cv.addEventListener('keydown', e => {
      const c = e.key.toLowerCase(), d = etat.vue[1] - etat.vue[0];
      if (c === 'p') choisirOutil('P');
      else if (c === 's') choisirOutil('S');
      else if (c === 'escape') choisirOutil(etat.outil);
      else if (c === 'arrowleft' || c === 'arrowright') { const s = (c === 'arrowleft' ? -0.2 : 0.2) * d; fixerVue(etat.vue[0] + s, etat.vue[1] + s); dessinerTraces(); }
      else if (c === '+' || c === '=') zoomer(0.5);
      else if (c === '-') zoomer(2);
      else return;
      e.preventDefault();
    });
  }
  function majCurseurs() {
    const e = etat.explo;
    $('#r-mw').value = e.Mw; $('#r-mw-v').textContent = virg(e.Mw, 1);
    $('#r-prof').value = e.h; $('#r-prof-v').textContent = e.h + ' km';
    $('#r-bruit').value = e.bruit;
  }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(() => plusTard(regenerer), 250); };
  function brancher() {
    $('#r-mw').addEventListener('input', e => { etat.explo.Mw = parseFloat(e.target.value); majCurseurs(); planifier(); });
    $('#r-prof').addEventListener('input', e => { etat.explo.h = parseInt(e.target.value, 10); majCurseurs(); planifier(); });
    $('#r-bruit').addEventListener('change', e => { etat.explo.bruit = e.target.value; plusTard(regenerer); });
    $('#r-tirage').addEventListener('click', () => { etat.explo.graine = 1 + Math.floor(Math.random() * 1e5); plusTard(regenerer); });
    $('#r-auto').addEventListener('change', e => { etat.auto = e.target.checked; if (etat.auto) pointesAutomatiques(); else etat.pointes = vide(); relocaliser(); });
    $('#r-phases').addEventListener('change', e => { etat.phases = e.target.checked; dessinerTraces(); });
    $('#r-filtre').addEventListener('change', e => { etat.filtre = e.target.value; plusTard(reconvertir); });
    $$('[data-r-outil]').forEach(b => b.addEventListener('click', () => choisirOutil(b.dataset.rOutil)));
    $('#r-zoom-plus').addEventListener('click', () => zoomer(0.5));
    $('#r-zoom-moins').addEventListener('click', () => zoomer(2));
    $('#r-zoom-tout').addEventListener('click', () => { etat.vue = [0, duree()]; dessinerTraces(); });
    $('#r-effacer').addEventListener('click', () => {
      etat.pointes = vide(); etat.outil = 'P';
      if (etat.mode === 'explorer') { etat.auto = false; $('#r-auto').checked = false; }
      if (etat.verifie) { etat.verifie = false; $('#r-corrige').innerHTML = ''; $('#r-corrige-reel').innerHTML = ''; }
      relocaliser();
    });
    $('#r-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#r-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#r-mode-reel').addEventListener('click', () => changerMode('reel'));
    $('#r-fichier').addEventListener('change', e => { if (e.target.files && e.target.files[0]) chargerFichier(e.target.files[0]); e.target.value = ''; });
    $('#r-comparer').addEventListener('click', comparer);
    $('#r-lire-pol').addEventListener('click', lirePolarites);
    $('#r-inverser').addEventListener('click', inverserMeca);
    $('#r-verifier').addEventListener('click', verifier);
    $('#r-nouvel-exo').addEventListener('click', nouvelExercice);

    // Déplacer l'épicentre sur la carte (exploration)
    const carte = $('#r-carte');
    let tire = false;
    const position = e => {
      const c = carteGeo(carte), [x, y] = c.versKm(e.offsetX, e.offsetY);
      const lim = CARTE.demi - 4;
      etat.explo.x = Math.round(Math.max(CARTE.cx - lim, Math.min(CARTE.cx + lim, x)) * 10) / 10;
      etat.explo.y = Math.round(Math.max(CARTE.cy - lim, Math.min(CARTE.cy + lim, y)) * 10) / 10;
    };
    carte.addEventListener('pointerdown', e => {
      if (etat.mode !== 'explorer') return;
      tire = true; carte.setPointerCapture(e.pointerId); position(e); dessinerCarte();
    });
    carte.addEventListener('pointermove', e => { if (tire) { position(e); dessinerCarte(); } });
    const lacher = () => { if (tire) { tire = false; plusTard(regenerer); } };
    carte.addEventListener('pointerup', lacher);
    carte.addEventListener('pointercancel', lacher);

    const redessiner = () => { if ((etat.evs.length || reel()) && !$('#banc-reseau').hidden) tout(); };
    const ro = new ResizeObserver(redessiner);
    ro.observe($('#r-traces')); ro.observe($('#r-carte')); ro.observe($('#r-sphere'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    const quitteReel = etat.mode === 'reel';
    etat.mode = m;
    $('#r-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#r-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#r-mode-reel').setAttribute('aria-pressed', String(m === 'reel'));
    $('#r-panneau-explorer').hidden = m !== 'explorer';
    $('#r-panneau-exercice').hidden = m !== 'exercice';
    $('#r-panneau-reel').hidden = m !== 'reel';
    $('#r-carte').classList.toggle('deplacable', m === 'explorer');
    etat.verifie = false;
    if (m === 'reel') {
      const c = SeismeReel.courant();
      if (c && c.dossier !== etat.reel) { etat.reel = c.dossier; etat.table = c.table; if (!etat.cotes) chargerCotes().then(x => { etat.cotes = x; if (reel()) dessinerCarte(); }); }
      if (etat.reel) activerReel();
      else { STATIONS = []; etat.series = []; etat.pointes = []; etat.evs = []; etat.loc = null; construireTraces(); tout(); }
      return;
    }
    if (quitteReel) { STATIONS = SIMULEES; construireTraces(); }
    if (m === 'exercice') nouvelExercice();
    else { etat.outil = 'P'; plusTard(regenerer); }
  }

  // ── Ouverture du banc : les onglets sont gérés par src/onglets.js ─────
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'reseau') return;
    if (!etat.pret) {
      etat.pret = true;
      construireTraces(); brancher(); majCurseurs();
      $('#r-carte').classList.add('deplacable');
      plusTard(regenerer);
    } else if (!(reel() && reprendre())) {
      tout();
    }
  });
})();
