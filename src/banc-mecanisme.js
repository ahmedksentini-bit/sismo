import Sismo from './sismo/signal.js';
import Mecanisme from './sismo/mecanisme.js';
import Direct from './sismo/direct.js';
import Localisation from './sismo/localisation.js';
import Reel from './sismo/reel.js';
import SeismeReel from './seisme-reel.js';

// src/banc-mecanisme.js — banc « mécanisme » : un séisme et son réseau ; premières arrivées P sur les verticales,
// polarités reportées sur la sphère focale (projection de Schmidt, hémisphère inférieur) ; on cherche les deux plans
// nodaux à la main ou par recherche exhaustive. Calcul dans src/sismo/mecanisme.js (vérifié contre ObsPy). Mode
// « Séisme réel » : le fichier partagé avec le TP de localisation (src/seisme-reel.js), verticales filtrées de 1 à 10 Hz
// (causal), pointé P du banc « réseau », de l'étudiant ou automatique, angles de départ de la table de la localisation.
(() => {
  'use strict';
  const Me = Mecanisme, RAD = Math.PI / 180;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 0) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const TYPES = {
    normale: () => ({ pendage: [45, 70], glissement: [-110, -70] }),
    inverse: () => ({ pendage: [25, 55], glissement: [70, 110] }),
    decrochement: () => ({ pendage: [70, 90], glissement: [-15, 15] }),
    oblique: () => ({ pendage: [35, 75], glissement: [25, 55] }),
  };
  const BRUIT = 0.08, H = 10, AVANT = 1.5, APRES = 2.5; // fenêtre des traces réelles autour du pointé P (s)
  const etat = {
    pret: false, mode: 'explorer', type: 'normale', n: 18, graine: 7, vrai: null, stations: [], modele: { azimut: 0, pendage: 45, glissement: -90 }, inv: null, montrer: false, vu: null, exo: null, verifie: false, rep: null,
    // séisme réel : version lue de l'état partagé, fichier, foyer choisi, polarités et pointés de l'étudiant (par station du fichier)
    version: -1, dossier: null, foyer: 'localisation', F: null, manuelles: new Map(), pointesMain: new Map(), message: '',
  };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;
  const reel = () => etat.mode === 'reel';
  const donnees = () => (reel() ? etat.stations.length > 0 : !!etat.vrai);

  // ── Données : mécanisme vrai, réseau, sismogrammes et lectures ──────────
  function generer() {
    const u = Sismo.aleatoire(etat.graine), t = TYPES[etat.type]();
    etat.vrai = { azimut: Math.round(u() * 359), pendage: Math.round(u.entre(...t.pendage)), glissement: Math.round(u.entre(...t.glissement)) };
    const M = Me.tenseur(etat.vrai.azimut, etat.vrai.pendage, etat.vrai.glissement);
    etat.stations = Array.from({ length: etat.n }, (_, k) => {
      const az = (k * 360) / etat.n + u.entre(-12, 12), delta = Math.exp(u.entre(Math.log(12), Math.log(320))), e = Me.emergence(delta, H);
      const amp = Me.rayonnementP(M, e.i, (az + 360) % 360);
      // vitesse verticale autour de l'arrivée : impulsion causale de signe et d'amplitude du rayonnement, plus du bruit
      const dt = 0.005, n = 120, i0 = 40, trace = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        const tt = (j - i0) * dt;
        trace[j] = (tt >= 0 ? amp * Math.sin((2 * Math.PI * tt) / 0.16) * Math.exp(-tt / 0.1) : 0) + BRUIT * u.gauss() * 0.6;
      }
      // lecture de l'analyste : signe du premier extrême après l'arrivée (fenêtre de 40 ms)
      let ext = 0;
      for (let j = i0; j < i0 + 8; j++) if (Math.abs(trace[j]) > Math.abs(ext)) ext = trace[j];
      return { code: `ST${String(k + 1).padStart(2, '0')}`, az: (az + 360) % 360, delta, ...e, amp, trace, i0, dt, polarite: ext >= 0 ? 1 : -1 };
    });
    etat.inv = null;
  }
  const lectures = () => etat.stations.filter(s => s.polarite).map(s => ({ az: s.az, i: s.i, polarite: s.polarite }));

  // ── Séisme réel : stations du fichier partagé, pointés, polarités ───────
  function construireReel() {
    const c = SeismeReel.courant();
    etat.stations = []; etat.inv = null; etat.vrai = null; etat.message = '';
    etat.version = c ? c.version : -1;
    if (!c) return;
    if (c.dossier !== etat.dossier) { etat.dossier = c.dossier; etat.manuelles = new Map(); etat.pointesMain = new Map(); }
    const d = c.dossier, dt = d.dt, fs = 1 / dt, sos = Direct.butterPasseBande(2, 1, Math.min(10, 0.45 * fs), fs);
    etat.F = SeismeReel.foyer(etat.foyer);
    const rais = SeismeReel.rais(etat.F);
    etat.stations = d.stations.map((st, k) => {
      const g = rais[k];
      if (!g || g.i === null || g.tP === null) return null;
      const z = Direct.filtrer(st.series[0], sos), pr = c.pointes[k].P, main = etat.pointesMain.get(k);
      const auto = main === undefined && pr === null ? Reel.pointerP(z, dt, g.tP) : null;
      const tP = main ?? pr ?? (auto ? auto.t : g.tP), origine = main !== undefined ? 'vous' : pr !== null ? 'réseau' : auto ? 'auto' : 'prévu';
      const i0a = Math.max(0, Math.round((tP - AVANT) / dt)), s = {
        code: st.station, k, az: g.azimut, delta: Localisation.km(g.distance), i: g.i, onde: g.i > 90 ? 'Pg' : g.distance < 15 ? 'Pn' : 'P',
        z, dt, ta: i0a * dt, trace: z.subarray(i0a, Math.min(z.length, Math.round((tP + APRES) / dt))), origine,
      };
      placerPointe(s, tP);
      s.polarite = etat.manuelles.has(k) ? etat.manuelles.get(k) : c.polarites[k] || Reel.polarite(z, dt, tP);
      return s;
    }).filter(Boolean);
  }
  // Pointé P d'une station réelle : indice dans la fenêtre affichée, échelle de la trace (du bruit à la seconde qui suit).
  function placerPointe(s, tP) {
    s.tP = tP; s.i0 = Math.round((tP - s.ta) / s.dt);
    let e = 0;
    for (let j = Math.max(0, s.i0 - Math.round(0.5 / s.dt)); j < Math.min(s.trace.length, s.i0 + Math.round(1 / s.dt)); j++) e = Math.max(e, Math.abs(s.trace[j]));
    s.echelle = e || 1;
  }
  // Polarités (et pointés de l'étudiant) rendues au banc « réseau » par l'état partagé.
  function publier(pointes = false) {
    const c = SeismeReel.courant();
    if (!c) return;
    const pol = c.polarites.slice(), pts = pointes ? c.pointes.map(p => ({ ...p })) : null;
    for (const s of etat.stations) { pol[s.k] = s.polarite; if (pts && s.origine === 'vous') pts[s.k].P = s.tP; }
    etat.version = SeismeReel.publier(pts ? { polarites: pol, pointes: pts } : { polarites: pol });
  }
  async function chargerFichier(f) {
    $('#me-reel-info').textContent = 'Lecture du fichier…';
    try { await SeismeReel.charger(f); construireReel(); tout(); } catch (err) { $('#me-reel-info').textContent = `Fichier refusé : ${err.message || err}.`; }
  }

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft', 'teal', 'line'])
      COUL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function preparer(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, Hh);
    return { ctx, W, H: Hh, dpr };
  }
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }
  // Grand cercle d'un plan nodal sur l'hémisphère inférieur
  function planNodal(ctx, cx, cy, R, mec) {
    const f = mec.azimut * RAD, d = mec.pendage * RAD, s = [Math.cos(f), Math.sin(f), 0], b = [-Math.cos(d) * Math.sin(f), Math.cos(d) * Math.cos(f), Math.sin(d)];
    ctx.beginPath();
    for (let k = 0; k <= 90; k++) {
      const th = (k * Math.PI) / 90, v = [0, 1, 2].map(j => Math.cos(th) * s[j] + Math.sin(th) * b[j]);
      const i = Math.acos(Math.max(-1, Math.min(1, v[2]))) / RAD, phi = Math.atan2(v[1], v[0]) / RAD, p = Me.projection(i, phi);
      (k ? ctx.lineTo : ctx.moveTo).call(ctx, cx + R * p.x, cy - R * p.y);
    }
    ctx.stroke();
  }
  // Canevas sans données (séisme réel pas encore chargé) : un message au centre.
  function vide(cv, msg) {
    const { ctx, W, H: Hh } = preparer(cv);
    texte(ctx, msg, W / 2, Hh / 2, COUL.muted, `700 12px ${POLICE}`, 'center');
  }
  const MSG_VIDE = 'Chargez un fichier de séisme (panneau « Séisme réel »).';
  function dessinerSphere() {
    const cv = $('#me-sphere');
    if (cv.clientWidth < 50) return;
    if (!donnees()) { if (reel()) vide(cv, MSG_VIDE); return; }
    const { ctx, W, H: Hh } = preparer(cv), R = Math.min(W, Hh) / 2 - 34, cx = W / 2, cy = Hh / 2 + 6, mec = etat.modele;
    const M = Me.tenseur(mec.azimut, mec.pendage, mec.glissement);
    // quadrants en compression du modèle (trame de 3 px)
    ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.22;
    for (let y = -R; y <= R; y += 3) for (let x = -R; x <= R; x += 3) {
      const d = Me.projectionInverse(x / R, -y / R);
      if (d && Me.rayonnementP(M, d.i, d.phi) > 0) ctx.fillRect(cx + x - 1.5, cy + y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    texte(ctx, 'N', cx, cy - R - 12, COUL.ink, `800 12px ${POLICE}`, 'center');
    // familles de solutions de l'inversion
    if (etat.inv && !enExercice()) {
      ctx.strokeStyle = COUL.amp; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.35;
      for (const s of etat.inv.solutions.slice(0, 200)) { planNodal(ctx, cx, cy, R, s); planNodal(ctx, cx, cy, R, Me.planAuxiliaire(s.azimut, s.pendage, s.glissement)); }
      ctx.globalAlpha = 1;
    }
    if (etat.montrer && etat.vrai && !enExercice()) {
      ctx.strokeStyle = COUL.teal; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
      planNodal(ctx, cx, cy, R, etat.vrai); planNodal(ctx, cx, cy, R, Me.planAuxiliaire(etat.vrai.azimut, etat.vrai.pendage, etat.vrai.glissement));
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2.2;
    planNodal(ctx, cx, cy, R, mec); planNodal(ctx, cx, cy, R, Me.planAuxiliaire(mec.azimut, mec.pendage, mec.glissement));
    // axes P et T du modèle
    const ax = Me.axes(M);
    for (const [nom, a] of [['P', ax.P], ['T', ax.T]]) { const p = Me.projection(90 - a.plongement, a.azimut); texte(ctx, nom, cx + R * p.x, cy - R * p.y, COUL.ink, `900 14px ${POLICE}`, 'center'); }
    // polarités lues
    for (const s of etat.stations) {
      if (!s.polarite) continue; // polarité illisible : écartée
      const p = Me.projection(s.i, s.az), x = cx + R * p.x, y = cy - R * p.y, accord = Math.sign(Me.rayonnementP(M, s.i, s.az)) === s.polarite;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI);
      if (s.polarite > 0) { ctx.fillStyle = COUL.ink; ctx.fill(); } else { ctx.fillStyle = COUL.paper; ctx.fill(); ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.6; ctx.stroke(); }
      if (!accord) { ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI); ctx.stroke(); }
      if (etat.vu === s.code) { ctx.strokeStyle = COUL.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, 2 * Math.PI); ctx.stroke(); }
    }
    const nd = Me.desaccords(mec, lectures());
    texte(ctx, `${mec.azimut}° / ${mec.pendage}° / ${mec.glissement}° · ${nd} désaccord${nd > 1 ? 's' : ''} sur ${lectures().length}`, 10, 14, nd ? COUL['pick-p'] : COUL.ink, `800 12px ${POLICE}`);
  }
  function dessinerTraces() {
    const cv = $('#me-traces');
    if (cv.clientWidth < 50) return;
    if (!donnees()) { if (reel()) vide(cv, MSG_VIDE); return; }
    const { ctx, W, H: Hh } = preparer(cv), st = [...etat.stations].sort((a, b) => a.az - b.az);
    const cols = W < 600 ? 2 : 3, lignes = Math.ceil(st.length / cols), cw = W / cols, ch = (Hh - 8) / lignes;
    st.forEach((s, k) => {
      // séisme réel : chaque trace à sa propre échelle (bruit et première seconde de la P), écrêtée au-delà
      const c = k % cols, l = Math.floor(k / cols), x0 = c * cw + 8, y0 = 4 + l * ch, w = cw - 16, yc = y0 + ch * 0.62, amp = reel() ? s.echelle * 1.1 : 0.9;
      const X = j => x0 + (j / (s.trace.length - 1)) * w, Y = v => yc - (Math.max(-1.6, Math.min(1.6, v / amp)) * ch * 0.32);
      ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x0 + w, yc); ctx.stroke();
      ctx.strokeStyle = reel() && (s.origine === 'auto' || s.origine === 'prévu') ? COUL.amp : COUL['pick-p']; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(X(s.i0), yc - ch * 0.3); ctx.lineTo(X(s.i0), yc + ch * 0.3); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = etat.vu === s.code ? COUL.cyan : COUL.trace; ctx.lineWidth = 1.3; ctx.beginPath();
      s.trace.forEach((v, j) => (j ? ctx.lineTo : ctx.moveTo).call(ctx, X(j), Y(v)));
      ctx.stroke();
      const lettre = s.polarite > 0 ? 'C' : s.polarite < 0 ? 'D' : '?';
      // étiquette raccourcie si la colonne est étroite (téléphone), pour ne pas chevaucher la lettre C/D
      ctx.font = `10.5px ${MONO}`;
      const km = `${Math.round(s.delta).toLocaleString('fr-FR')} km`, etiquette = [`${s.code} · ${virg(s.az)}° · ${km} · ${s.onde}`, `${s.code} · ${virg(s.az)}° · ${km}`, `${s.code} · ${km}`].find(t => ctx.measureText(t).width < w - 16) || s.code;
      texte(ctx, etiquette, x0, y0 + 9, COUL.muted, `10.5px ${MONO}`);
      texte(ctx, lettre, x0 + w - 2, y0 + 9, s.polarite > 0 ? COUL.blue : s.polarite < 0 ? COUL['pick-p'] : COUL.muted, `900 12px ${MONO}`, 'right');
      s.zone = { x0, y0, x1: x0 + w, y1: y0 + ch };
    });
  }
  function dessinerCarte() {
    const cv = $(reel() ? '#me-carte-reel' : '#me-carte');
    if (cv.clientWidth < 50 || !donnees()) return;
    // séisme réel : rayon de la carte à la station la plus lointaine
    const Dmax = reel() ? Math.max(30, ...etat.stations.map(s => s.delta)) * 1.1 : 330, cercles = reel() ? [10, 30, 100, 300, 1000, 3000].filter(d => d < Dmax) : [10, 50, 150, 300];
    const { ctx, W, H: Hh } = preparer(cv), cx = W / 2, cy = Hh / 2, Rm = Math.min(W, Hh) / 2 - 22;
    const P = (az, d) => { const r = (Math.log(1 + d) / Math.log(1 + Dmax)) * Rm; return [cx + r * Math.sin(az * RAD), cy - r * Math.cos(az * RAD)]; };
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.fillStyle = COUL.muted; ctx.font = `10.5px ${MONO}`;
    for (const d of cercles) { const r = (Math.log(1 + d) / Math.log(1 + Dmax)) * Rm; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${d} km`, cx, cy - r - 1); }
    for (const s of etat.stations) {
      const [x, y] = P(s.az, s.delta);
      ctx.fillStyle = s.polarite > 0 ? COUL.ink : s.polarite < 0 ? COUL.paper : COUL.grid; ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5.5, y + 4); ctx.lineTo(x - 5.5, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fill();
    texte(ctx, `distances en échelle log. · ▲ C · △ D${reel() ? ' · gris : ?' : ''}`, 8, Hh - 10, COUL.muted, `10.5px ${MONO}`);
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const m = etat.modele, aux = Me.planAuxiliaire(m.azimut, m.pendage, m.glissement), ax = Me.axes(Me.tenseur(m.azimut, m.pendage, m.glissement));
    const l = lectures(), nd = Me.desaccords(m, l), nPn = etat.stations.filter(s => s.onde === 'Pn').length, F = etat.F;
    const inv = etat.inv && !enExercice() ? etat.inv : null;
    $('#me-afficheurs').innerHTML = [
      afficheur('Désaccords', `${nd} / ${l.length}`, 'polarités contraires au modèle'),
      // en exercice, le type de faille est demandé : seul le glissement du plan réglé est rappelé
      afficheur('Type', enExercice() ? '—' : Me.typeFaille(m.glissement), `glissement ${virg(m.glissement)}°`),
      afficheur('Plan auxiliaire', `${virg(aux.azimut)}/${virg(aux.pendage)}/${virg(aux.glissement)}`, 'azimut / pendage / glissement'),
      afficheur('Axes P et T', `P ${virg(ax.P.azimut)}°↓${virg(ax.P.plongement)}°`, `T ${virg(ax.T.azimut)}°↓${virg(ax.T.plongement)}°`),
      afficheur('Inversion', inv ? `${inv.desaccords} désaccord${inv.desaccords > 1 ? 's' : ''}` : '—', inv ? `${inv.solutions.length} solution${inv.solutions.length > 1 ? 's' : ''} au pas de 10°` : etat.message || 'recherche exhaustive'),
      reel()
        ? afficheur('Réseau', F ? `${etat.stations.length} stations` : '—', F ? `${l.length} polarités ; foyer ${F.source === 'geofon' ? `du catalogue (${c.dossier.seisme.catalogue || 'GEOFON'})` : 'de votre localisation'} à ${virg(F.h)} km` : 'aucun fichier')
        : afficheur('Réseau', `${etat.n} stations`, `${nPn} en Pn (émergence ${virg(Me.emergence(300, H).i)}°), foyer à ${H} km`),
    ].join('');
  }
  function majControles() {
    const m = etat.modele;
    $('#me-az').value = m.azimut; $('#me-az-v').textContent = `${m.azimut}°`;
    $('#me-pd').value = m.pendage; $('#me-pd-v').textContent = `${m.pendage}°`;
    $('#me-gl').value = m.glissement; $('#me-gl-v').textContent = `${virg(m.glissement)}°`;
    $('#me-n').value = etat.n; $('#me-n-v').textContent = String(etat.n);
    $('#me-montrer').checked = etat.montrer;
    $('#me-inverser').disabled = enExercice(); // l'inversion donnerait la réponse
    $$('[data-me-type]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.meType === etat.type)));
    $('#me-legende-vraie').hidden = reel(); // un séisme réel n'a pas de solution vraie
    $('#me-traces-legende').textContent = reel()
      ? `Vitesse verticale filtrée de 1 à 10 Hz (causal), ${virg(AVANT, 1)} s avant et ${virg(APRES, 1)} s après le pointé P (tirets rouges : banc « réseau » ou le vôtre, orangés : automatique), stations rangées par azimut, chacune à sa propre échelle ; un clic sur une trace y place votre pointé`
      : 'Vitesse verticale, 0,2 s avant et 0,4 s après l\'arrivée (tirets), stations rangées par azimut ; C : compression, D : dilatation, lues sur le premier extrême ; un clic repère la station sur la sphère';
  }
  // Panneau « Séisme réel » : fichier, foyer, polarités par station.
  function majReel() {
    if (!reel()) return;
    const c = SeismeReel.courant(), F = etat.F, info = $('#me-reel-info');
    $$('[data-me-foyer]').forEach(b => {
      b.disabled = b.dataset.meFoyer === 'localisation' && !(c && c.solution);
      b.setAttribute('aria-pressed', String(!!F && b.dataset.meFoyer === (F.source === 'geofon' ? 'geofon' : 'localisation')));
    });
    $('#me-lire-pol').disabled = !c;
    if (!c) { info.textContent = 'Aucun fichier chargé : chargez-en un ici ou dans le banc « réseau ».'; $('#me-pol-stations').innerHTML = ''; return; }
    const e = c.dossier.seisme, d = new Date(e.temps).toISOString(), hors = c.dossier.stations.length - etat.stations.length;
    info.innerHTML = `<b>${e.region || 'Séisme'}</b>, ${d.slice(0, 10)} à ${d.slice(11, 19)} UTC, M ${virg(e.mag, 1)} ${e.typeMag || ''} (${e.catalogue || 'GEOFON'}) · ${etat.stations.length} stations${hors ? ` (${hors} hors de la table, écartée${hors > 1 ? 's' : ''})` : ''}.
      Foyer ${F.source === 'geofon' ? `du catalogue (${e.catalogue || 'GEOFON'})` : 'de votre localisation (banc « réseau »)'} : ${virg(F.lat, 2)}° N, ${virg(F.lon, 2)}° E, h = ${virg(F.h)} km${F.hCatalogue > 40 ? ` (le catalogue donne ${virg(F.hCatalogue)} km ; la table s'arrête à 40 km : angles de départ approchés)` : ''}.${c.solution ? '' : ' Localisez-le dans le banc « réseau » pour utiliser votre propre foyer.'}`;
    const div = $('#me-pol-stations');
    div.innerHTML = [...etat.stations].sort((a, b) => a.az - b.az).map(s => {
      const b = (v, t) => `<button type="button" class="outil${v === 1 ? ' p' : v === -1 ? ' s' : ' neutre'}" data-me-pol="${s.k}" data-v="${v}" aria-pressed="${s.polarite === v}">${t}</button>`;
      return `<div class="pol-ligne"><b>${s.code}</b><small>az. ${Math.round(s.az)}° · i ${Math.round(s.i)}° · pointé ${s.origine}</small><span>${b(1, 'C')}${b(-1, 'D')}${b(0, '?')}</span></div>`;
    }).join('');
    div.querySelectorAll('[data-me-pol]').forEach(x => x.addEventListener('click', () => {
      const s = etat.stations.find(q => q.k === +x.dataset.mePol);
      s.polarite = +x.dataset.v; etat.manuelles.set(s.k, s.polarite); etat.inv = null; etat.message = '';
      publier(); tout();
    }));
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majAfficheurs(); majReel();
    dessinerSphere(); dessinerTraces(); dessinerCarte();
  }
  function nouveauSeisme() { generer(); tout(); }

  // ── Exercice : retrouver le mécanisme ───────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 41), types = Object.keys(TYPES);
    etat.type = types[Math.floor(u() * types.length)]; etat.graine = numero; etat.n = 16 + Math.floor(u() * 8);
    etat.exo = { numero }; etat.verifie = false; etat.rep = null; etat.montrer = false;
    etat.modele = { azimut: 0, pendage: 45, glissement: 0 };
    $('#me-exo-num').textContent = 'Exercice n° ' + numero; $('#me-corrige').innerHTML = '';
    $$('[data-me-rep]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    generer(); tout();
  }
  function verifier() {
    const inv = Me.inverser(lectures(), 10), nd = Me.desaccords(etat.modele, lectures()), ecart = Me.ecartAxes(etat.modele, etat.vrai);
    const typeVrai = Me.typeFaille(etat.vrai.glissement), typeVu = { normale: 'normale', inverse: 'inverse', decrochement: 'décrochement' }[etat.rep];
    const okD = nd <= inv.desaccords + 1, okA = ecart <= 25, okT = typeVu === typeVrai;
    etat.verifie = true; etat.inv = inv; etat.montrer = true;
    const v = etat.vrai, aux = Me.planAuxiliaire(v.azimut, v.pendage, v.glissement);
    const lignes = [
      ['Désaccords du modèle', `${nd}`, `${inv.desaccords} au mieux`, okD, 'au plus un de plus que la meilleure solution'],
      ['Axes P et T', `écart ${virg(ecart)}°`, '≤ 25°', okA, `vrai : ${virg(v.azimut)}/${virg(v.pendage)}/${virg(v.glissement)} ou ${virg(aux.azimut)}/${virg(aux.pendage)}/${virg(aux.glissement)}`],
      ['Type de faille', typeVu || '—', typeVrai, okT, 'normale −150° < λ < −30°, inverse 30° < λ < 150°'],
    ];
    $('#me-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Attendu</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">Les polarités ne distinguent pas le plan de faille de son plan auxiliaire : il faut la géologie, les répliques ou la directivité.</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#me-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#me-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#me-mode-reel').setAttribute('aria-pressed', String(m === 'reel'));
    $('#me-panneau-exercice').hidden = m !== 'exercice';
    $('#me-panneau-reel').hidden = m !== 'reel';
    $('#me-reglages-seisme').hidden = m !== 'explorer';
    etat.vu = null;
    if (m === 'reel') { etat.verifie = false; etat.montrer = false; construireReel(); tout(); }
    else if (m === 'exercice') nouvelExercice();
    else { etat.verifie = false; etat.type = 'normale'; etat.n = 18; etat.graine = 7; etat.montrer = false; generer(); tout(); }
  }

  function brancher() {
    const regle = (id, cle) => $(id).addEventListener('input', e => { etat.modele[cle] = parseInt(e.target.value, 10); etat.vu = null; tout(); });
    regle('#me-az', 'azimut'); regle('#me-pd', 'pendage'); regle('#me-gl', 'glissement');
    $('#me-n').addEventListener('input', e => { etat.n = parseInt(e.target.value, 10); generer(); tout(); });
    $$('[data-me-type]').forEach(b => b.addEventListener('click', () => { etat.type = b.dataset.meType; etat.graine = 1 + Math.floor(Math.random() * 1e6); generer(); tout(); }));
    $('#me-nouveau').addEventListener('click', () => { etat.graine = 1 + Math.floor(Math.random() * 1e6); nouveauSeisme(); });
    $('#me-montrer').addEventListener('change', e => { etat.montrer = e.target.checked; tout(); });
    $('#me-inverser').addEventListener('click', () => {
      if (reel() && lectures().length < 6) { etat.inv = null; etat.message = `il faut 6 polarités au moins (${lectures().length})`; tout(); return; }
      etat.inv = Me.inverser(lectures(), 10); etat.message = '';
      if (!enExercice()) etat.modele = { ...etat.inv.solutions[Math.floor(etat.inv.solutions.length / 2)] };
      tout();
    });
    $('#me-traces').addEventListener('click', e => {
      const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const s = etat.stations.find(q => q.zone && x >= q.zone.x0 && x <= q.zone.x1 && y >= q.zone.y0 && y <= q.zone.y1);
      etat.vu = s ? s.code : null;
      if (s && reel()) {
        // séisme réel : pointé P de l'étudiant à l'endroit du clic, polarité relue
        const j = Math.round(((x - s.zone.x0) / (s.zone.x1 - s.zone.x0)) * (s.trace.length - 1)), t = s.ta + j * s.dt;
        placerPointe(s, t); s.origine = 'vous'; etat.pointesMain.set(s.k, t); etat.manuelles.delete(s.k);
        s.polarite = Reel.polarite(s.z, s.dt, t); etat.inv = null; etat.message = '';
        publier(true); tout(); return;
      }
      dessinerSphere(); dessinerTraces();
    });
    $('#me-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#me-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#me-mode-reel').addEventListener('click', () => changerMode('reel'));
    $('#me-fichier').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) chargerFichier(f); });
    $$('[data-me-foyer]').forEach(b => b.addEventListener('click', () => { etat.foyer = b.dataset.meFoyer; construireReel(); tout(); }));
    $('#me-lire-pol').addEventListener('click', () => {
      etat.manuelles.clear();
      for (const s of etat.stations) s.polarite = Reel.polarite(s.z, s.dt, s.tP);
      etat.inv = null; etat.message = ''; publier(); tout();
    });
    $$('[data-me-rep]').forEach(b => b.addEventListener('click', () => { etat.rep = b.dataset.meRep; $$('[data-me-rep]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $('#me-verifier').addEventListener('click', verifier);
    $('#me-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-mecanisme').hidden && (etat.vrai || reel())) { lireCouleurs(); tout(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#me-sphere', '#me-traces', '#me-carte', '#me-carte-reel']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'mecanisme') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); generer(); tout(); return; }
    // séisme réel : fichier, pointés ou localisation modifiés dans un autre banc
    const c = SeismeReel.courant();
    if (reel() && (c ? c.version : -1) !== etat.version) construireReel();
    tout();
  });
})();
