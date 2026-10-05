import Sismo from './sismo/signal.js';
import Source from './sismo/source.js';
import Reel from './sismo/reel.js';
import SeismeReel from './seisme-reel.js';

// src/banc-source.js — banc « source » : un séisme enregistré par quatre stations ; spectre de déplacement des
// ondes S, corrigé du trajet et du site, et modèle de Brune (Ω0, fc) ajusté à la main ou automatiquement ;
// moment sismique, Mw et chute de contrainte, face à ML. Calcul dans src/sismo/source.js ; la vérité est
// celle du générateur. Mode « Séisme réel » : le fichier partagé avec le TP de localisation (src/seisme-reel.js),
// horizontales des stations de 10 à 600 km, fenêtre S depuis le pointé S du banc « réseau » ou l'arrivée prévue,
// fenêtre de bruit avant la P ; ML par le Wood-Anderson simulé, comme au banc « réseau ».
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sci = x => { if (!(x > 0)) return '—'; const e = Math.floor(Math.log10(x)); return `${virg(x / Math.pow(10, e), 2)}·10${String(e).split('').map(c => SUP[c]).join('')}`; };
  const DISTANCES = [30, 60, 100, 140];
  const reglagesDefaut = () => ({ Mw: 4.8, dsigma: 6, graine: 11 });
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), stations: [], vu: 0, manuel: null, exo: null, verifie: false, version: -1, foyer: 'localisation', F: null };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;
  const reel = () => etat.mode === 'reel';

  function calculer() {
    const r = etat.r;
    etat.stations = DISTANCES.map((d, k) => {
      const ev = Sismo.generer({ Mw: r.Mw, delta: d, h: 10, baz: 25 + 83 * k, graine: r.graine * 10 + k, modele: { dsigma: 10 * r.dsigma } });
      const a = Source.analyser(ev, { m: { ...Sismo.MODELE, dsigma: 10 * r.dsigma } }), ml = Sismo.mlVraie(ev).ML;
      return { code: `ST${k + 1}`, d, ev, a, ml };
    });
    etat.manuel = etat.stations.map(s => ({ omega0: s.a.omega0 * 3, fc: Math.max(0.1, s.a.fc / 2.5) }));
    if (!enExercice()) etat.manuel = etat.stations.map(s => ({ omega0: s.a.omega0, fc: s.a.fc }));
  }
  // Séisme réel : stations du fichier partagé entre 10 et 600 km (hypocentrales) ayant leurs deux horizontales.
  function calculerReel() {
    const c = SeismeReel.courant();
    etat.version = c ? c.version : -1; etat.stations = []; etat.manuel = []; etat.vu = 0; etat.F = null;
    if (!c) return;
    const d = c.dossier, dt = d.dt, fmax = Math.min(15, 0.4 / dt);
    etat.F = SeismeReel.foyer(etat.foyer);
    const rais = SeismeReel.rais(etat.F);
    etat.stations = d.stations.map((st, k) => {
      const g = rais[k];
      if (!g || !st.voies[1] || !st.voies[2] || g.tP === null || g.tS === null || g.R < Reel.RMIN || g.R > Reel.RMAX) return null;
      const p = c.pointes[k], tP = p.P ?? g.tP, tS = p.S !== null && p.S > tP ? p.S : g.tS;
      const a = Source.analyserSerie(st.series[1], st.series[2], dt, { R: g.R, iS: Math.round((tS - 0.5) / dt), iP: Math.round(tP / dt), entree: 'vitesse', fmax });
      const wa = [Sismo.woodAndersonVitesse(st.series[1], dt), Sismo.woodAndersonVitesse(st.series[2], dt)];
      const ml = Reel.magnitudeStation(wa, dt, tP - 1, tS + Math.max(30, 1.5 * (tS - tP)), g.R).ML;
      // vue du sismogramme : de 20 s avant P à la fin de la coda de S
      const vue = [Math.max(0, tP - 20), Math.min(d.n * dt, tS + Math.max(60, 3 * (tS - tP)))];
      return { code: st.station, d: Math.round(g.R), ev: { vit: { N: st.series[1] }, n: d.n, dt, t0: -etat.F.t0 }, voie: st.voies[1], a, ml, tP, tS, pS: p.S !== null, vue };
    }).filter(Boolean).sort((x, y) => x.d - y.d);
    etat.manuel = etat.stations.map(s => (s.a.fit ? { omega0: s.a.omega0, fc: s.a.fc } : { omega0: Math.max(...s.a.corrige.map(q => q[1])), fc: 1 }));
  }
  const moyennes = () => {
    const ok = etat.stations.filter(x => Number.isFinite(x.a.Mw)), n = ok.length, st = etat.stations.filter(x => Number.isFinite(x.ml));
    return { n, Mw: ok.reduce((s, x) => s + x.a.Mw, 0) / n, ML: st.reduce((s, x) => s + x.ml, 0) / st.length, fc: Math.exp(ok.reduce((s, x) => s + Math.log(x.a.fc), 0) / n), ds: Math.exp(ok.reduce((s, x) => s + Math.log(x.a.dsigma), 0) / n) };
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
  // Canevas sans données (séisme réel) : un message au centre.
  function vide(cv, msg) {
    const { ctx, W, H } = preparer(cv);
    texte(ctx, msg, W / 2, H / 2, COUL.muted, `700 12px ${POLICE}`, 'center');
  }
  const messageVide = () => (SeismeReel.courant() ? 'Aucune station entre 10 et 600 km avec ses deux horizontales.' : 'Chargez un fichier de séisme (panneau « Séisme réel »).');
  function dessinerSismo() {
    const cv = $('#so-sismo');
    if (cv.clientWidth < 50) return;
    if (!etat.stations.length) { if (reel()) vide(cv, messageVide()); return; }
    const { ctx, W, H } = preparer(cv), s = etat.stations[etat.vu], ev = s.ev, v = ev.vit.N, m = { g: 50, d: 14, h: 26, b: 26 };
    // vue : l'enregistrement entier (générateur) ou de P − 20 s à la fin de la coda (séisme réel)
    const [ta, tb] = s.vue || [0, ev.n * ev.dt], duree = tb - ta, X = t => m.g + ((t - ta) / duree) * (W - m.g - m.d);
    const ia = Math.max(0, Math.floor(ta / ev.dt)), ib = Math.min(ev.n, Math.ceil(tb / ev.dt));
    let vmax = 0; for (let i = ia; i < ib; i++) vmax = Math.max(vmax, Math.abs(v[i]));
    const Y = x => m.h + (H - m.h - m.b) * (0.5 - (0.45 * x) / (vmax || 1));
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, 0, W - m.g - m.d, H); ctx.clip();
    // fenêtre S analysée, fenêtre de bruit (séisme réel)
    const bande = (i0, n, coul, a) => { ctx.fillStyle = coul; ctx.globalAlpha = a; ctx.fillRect(X(i0 * ev.dt), m.h, X((i0 + n) * ev.dt) - X(i0 * ev.dt), H - m.h - m.b); ctx.globalAlpha = 1; };
    bande(s.a.i0, s.a.n, COUL['pick-s'], 0.14);
    if (s.a.bruitFenetre) bande(s.a.bruitFenetre.i0, s.a.bruitFenetre.n, COUL.muted, 0.16);
    ctx.restore();
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    // graduations en temps depuis l'origine, à pas rond
    const pasT = duree > 240 ? 60 : duree > 100 ? 20 : 10;
    for (let u = Math.ceil((ta + ev.t0) / pasT) * pasT; u <= tb + ev.t0; u += pasT) { const x = Math.round(X(u - ev.t0)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(Math.round(u)), x, H - m.b + 5); }
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
    const pas = Math.max(1, Math.floor((ib - ia) / (2 * (W - m.g - m.d))));
    for (let i = ia; i < ib; i += pas) {
      let lo = v[i], hi = v[i];
      for (let j = i; j < Math.min(ib, i + pas); j++) { lo = Math.min(lo, v[j]); hi = Math.max(hi, v[j]); }
      if (i === ia) ctx.moveTo(X(i * ev.dt), Y(lo)); else ctx.lineTo(X(i * ev.dt), Y(lo));
      ctx.lineTo(X(i * ev.dt), Y(hi));
    }
    ctx.stroke();
    if (reel()) for (const [t, coul, nom] of [[s.tP, COUL['pick-p'], 'P'], [s.tS, COUL['pick-s'], 'S']]) {
      const x = Math.round(X(t)) + 0.5;
      ctx.strokeStyle = coul; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke();
      texte(ctx, nom, x + 4, m.h + 8, coul, `800 11px ${MONO}`);
    }
    // titre raccourci sur un canevas étroit (téléphone)
    const dist = reel() ? `R ${s.d.toLocaleString('fr-FR')} km` : `${s.d} km`, fen = `${virg(s.a.n * ev.dt, 1)} s`, voie = reel() ? s.voie : 'N-S';
    ctx.font = `800 12px ${POLICE}`;
    const titre = [`${s.code} · ${dist} · vitesse ${voie} · fenêtre S de ${fen}${reel() && !s.pS ? ' (S prévue)' : ''}`, `${s.code} · ${dist} · ${voie} · fenêtre S ${fen}`, `${s.code} · ${dist}`].find(t => ctx.measureText(t).width < W - m.g - 8);
    texte(ctx, titre, m.g, 13, COUL.ink, `800 12px ${POLICE}`);
    texte(ctx, 'temps depuis l\'origine (s)', W - m.d - 4, H - m.b - 10, COUL.muted, `10.5px ${MONO}`, 'right');
  }
  function dessinerSpectre() {
    const cv = $('#so-spectre');
    if (cv.clientWidth < 50) return;
    if (!etat.stations.length) { if (reel()) vide(cv, messageVide()); return; }
    const { ctx, W, H } = preparer(cv), s = etat.stations[etat.vu], a = s.a, mod = etat.manuel[etat.vu], m = { g: 56, d: 14, h: 30, b: 30 };
    // six décades au plus sous le haut du graphe : le bruit d'un séisme réel peut descendre bien plus bas
    const f0 = 0.1, f1 = 15, vals = [...a.brut, ...a.corrige, ...(a.bruit || [])].map(p => p[1]), y1 = Math.max(...vals, mod.omega0) * 3, y0 = Math.max(Math.min(...vals) / 3, y1 / 1e6);
    const X = f => m.g + (Math.log(f / f0) / Math.log(f1 / f0)) * (W - m.g - m.d), Y = d => H - m.b - (Math.log(d / y0) / Math.log(y1 / y0)) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const f of [0.1, 0.2, 0.5, 1, 2, 5, 10]) { const x = Math.round(X(f)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(f, f < 1 ? 1 : 0), x, H - m.b + 5); }
    for (let e = Math.ceil(Math.log10(y0)); e <= Math.floor(Math.log10(y1)); e++) { const y = Math.round(Y(10 ** e)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`10${String(e).split('').map(c => SUP[c]).join('')}`, m.g - 6, y); }
    const courbe = (pts, coul, w, tirets) => { ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath(); pts.forEach(([f, d], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(f), Y(d))); ctx.stroke(); ctx.setLineDash([]); };
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    courbe(a.brut, COUL.muted, 1.4, [5, 4]);
    if (a.bruit) {
      // séisme réel : bruit (pointillés), bandes noyées pâles, bandes ajustées pleines
      courbe(a.bruit, COUL.muted, 1.4, [1.5, 3]);
      ctx.globalAlpha = 0.3; courbe(a.corrige, COUL.trace, 1.8); ctx.globalAlpha = 1;
      for (let j = 1; j < a.corrige.length; j++) if (a.retenues[j] && a.retenues[j - 1]) courbe([a.corrige[j - 1], a.corrige[j]], COUL.trace, 1.8);
      a.corrige.forEach(([f, d], j) => { if (a.retenues[j]) { ctx.fillStyle = COUL.trace; ctx.beginPath(); ctx.arc(X(f), Y(d), 2, 0, 2 * Math.PI); ctx.fill(); } });
    } else courbe(a.corrige, COUL.trace, 1.8);
    const fs = Array.from({ length: 120 }, (_, i) => f0 * Math.pow(f1 / f0, i / 119));
    courbe(fs.map(f => [f, mod.omega0 / (1 + (f / mod.fc) ** 2)]), COUL.blue, 2.6);
    ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(mod.fc), m.h); ctx.lineTo(X(mod.fc), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // étiquette de fc en bas du graphe quand elle chevaucherait celle de l'axe des fréquences
    ctx.font = `700 11px ${MONO}`;
    const tFc = `fc = ${virg(mod.fc, 2)} Hz`, finFc = X(mod.fc) + 6 + ctx.measureText(tFc).width;
    ctx.font = `10.5px ${MONO}`;
    const debutAxe = W - m.d - 4 - ctx.measureText('fréquence (Hz)').width - 8;
    texte(ctx, tFc, X(mod.fc) + 6, finFc > debutAxe ? H - m.b - 10 : m.h + 12, COUL['pick-p'], `700 11px ${MONO}`);
    texte(ctx, `Ω0 = ${sci(mod.omega0)} m·s`, m.g + 6, Y(mod.omega0) - 12, COUL.blue, `700 11px ${MONO}`);
    const ajustees = a.retenues ? a.corrige.filter((_, j) => a.retenues[j]) : a.corrige;
    // titre raccourci sur un canevas étroit (téléphone)
    const ecart = ajustees.length ? virg(Source.ecartBrune(ajustees, mod.omega0, mod.fc), 2) : '';
    const titres = ajustees.length
      ? [`déplacement (m·s) · écart ${ecart} en ln${a.retenues ? ` sur ${ajustees.length} bandes au-dessus du bruit` : ''}`, `déplacement (m·s) · écart ${ecart} en ln`, `écart ${ecart} en ln`]
      : ['déplacement (m·s) · signal noyé dans le bruit : rien à ajuster', 'signal noyé dans le bruit'];
    ctx.font = `800 12px ${POLICE}`;
    texte(ctx, titres.find(t => ctx.measureText(t).width < W - m.g - 8) || titres.at(-1), m.g, 14, ajustees.length ? COUL.ink : COUL['pick-p'], `800 12px ${POLICE}`);
    texte(ctx, 'fréquence (Hz)', W - m.d - 4, m.h + 10, COUL.muted, `10.5px ${MONO}`, 'right');
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majPanneaux() {
    const c = enExercice(), mo = moyennes(), r = etat.r, C = Source.constante(), cr = SeismeReel.courant();
    majReel();
    if (!etat.stations.length) {
      $('#so-afficheurs').innerHTML = [afficheur('Mw spectrale', '—', ''), afficheur('ML', '—', ''), afficheur('C = Rθφ·F/4πρβ³', sci(C), 'M0 = Ω0 / C (N·m)')].join('');
      $('#so-table').innerHTML = ''; $('#so-lecture').hidden = true; return;
    }
    const e = reel() && cr ? cr.dossier.seisme : null;
    $('#so-afficheurs').innerHTML = [
      afficheur('Mw spectrale', c ? '—' : virg(mo.Mw, 2), c ? 'à estimer' : reel() ? `moyenne de ${mo.n} station${mo.n > 1 ? 's' : ''} ajustée${mo.n > 1 ? 's' : ''}` : 'moyenne des 4 stations'),
      afficheur('ML', virg(mo.ML, 2), 'Wood-Anderson simulé'),
      afficheur('fc', c ? '—' : `${virg(mo.fc, 2)} Hz`, 'moyenne géométrique'),
      afficheur('Δσ', c ? '—' : `${virg(mo.ds, 1)} MPa`, 'relation de Brune'),
      e ? afficheur('GEOFON', `${virg(e.mag, 1)} ${e.typeMag || ''}`, 'magnitude du catalogue')
        : afficheur('Vérité', c ? '—' : `Mw ${virg(r.Mw, 1)}`, c ? '' : `Δσ ${virg(r.dsigma, 1)} MPa (générateur)`),
      afficheur('C = Rθφ·F/4πρβ³', sci(C), 'M0 = Ω0 / C (N·m)'),
    ].join('');
    $('#so-table').innerHTML = `<thead><tr><th>station</th><th>R (km)</th><th>ML</th><th>fc (Hz)</th><th>Mw</th></tr></thead><tbody>${etat.stations.map((s, i) =>
      `<tr class="${i === etat.vu ? 'vu' : ''}" data-so-vu="${i}" tabindex="0"><td>${s.code}</td><td class="n">${virg(s.a.R, 0)}</td><td class="n">${virg(s.ml, 2)}</td><td class="n">${c || !s.a.fc ? '—' : virg(s.a.fc, 2)}</td><td class="n">${c || !s.a.Mw ? '—' : virg(s.a.Mw, 2)}</td></tr>`).join('')}</tbody>`;
    $$('[data-so-vu]').forEach(tr => {
      const choisir = () => { etat.vu = +tr.dataset.soVu; tout(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    });
    const mod = etat.manuel[etat.vu], M0 = mod.omega0 / C;
    $('#so-lecture').textContent = `Votre modèle : M0 = Ω0/C = ${sci(M0)} N·m, soit Mw = ${virg(Source.magnitude(M0), 2)} ; Δσ = ${virg(Source.chuteContrainte(M0, mod.fc), 1)} MPa.`;
    $('#so-lecture').hidden = c;
  }
  // Panneau « Séisme réel » : fichier et foyer.
  function majReel() {
    if (!reel()) return;
    const c = SeismeReel.courant(), F = etat.F, info = $('#so-reel-info');
    $$('[data-so-foyer]').forEach(b => {
      b.disabled = b.dataset.soFoyer === 'localisation' && !(c && c.solution);
      b.setAttribute('aria-pressed', String(!!F && b.dataset.soFoyer === (F.source === 'geofon' ? 'geofon' : 'localisation')));
    });
    if (!c) { info.textContent = 'Aucun fichier chargé : chargez-en un ici ou dans le banc « réseau ».'; return; }
    const e = c.dossier.seisme, d = new Date(e.temps).toISOString(), n = etat.stations.length, sansFit = etat.stations.filter(s => !s.a.fit).length;
    info.innerHTML = `<b>${e.region || 'Séisme'}</b>, ${d.slice(0, 10)} à ${d.slice(11, 19)} UTC, M ${virg(e.mag, 1)} ${e.typeMag || ''} (GEOFON) · ${n} station${n > 1 ? 's' : ''} sur ${c.dossier.stations.length} entre ${Reel.RMIN} et ${Reel.RMAX} km${sansFit ? `, dont ${sansFit} noyée${sansFit > 1 ? 's' : ''} dans le bruit` : ''}.
      Foyer ${F.source === 'geofon' ? 'de GEOFON' : 'de votre localisation (banc « réseau »)'} à ${virg(F.h, 0)} km.${c.solution ? '' : ' Localisez-le dans le banc « réseau » pour utiliser vos pointés et votre foyer.'}`;
  }
  function majControles() {
    if (!etat.stations.length) return;
    const r = etat.r, mod = etat.manuel[etat.vu];
    $('#so-mw').value = r.Mw; $('#so-mw-v').textContent = virg(r.Mw, 1);
    $('#so-ds').value = Math.log10(r.dsigma); $('#so-ds-v').textContent = `${virg(r.dsigma, 1)} MPa`;
    $('#so-o0').value = Math.log10(mod.omega0); $('#so-o0-v').textContent = `${sci(mod.omega0)} m·s`;
    $('#so-fc').value = Math.log10(mod.fc); $('#so-fc-v').textContent = `${virg(mod.fc, 2)} Hz`;
    $('#so-ajuster').disabled = enExercice() || (reel() && !etat.stations[etat.vu].a.fit);
    $$('[data-so-mw], #so-mw, #so-ds, #so-autre').forEach(b => { b.disabled = etat.mode === 'exercice'; });
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majPanneaux();
    dessinerSismo(); dessinerSpectre();
  }
  function recalculer() { calculer(); tout(); }
  function occupe(on) {
    const b = $('#etat-calcul');
    b.classList.toggle('calcul', on);
    b.lastElementChild.textContent = on ? 'Spectres des stations…' : 'Signal prêt';
  }
  function recalculerReel() { occupe(true); setTimeout(() => { try { calculerReel(); tout(); } finally { occupe(false); } }, 30); }
  async function chargerFichier(f) {
    $('#so-reel-info').textContent = 'Lecture du fichier…';
    try { await SeismeReel.charger(f); recalculerReel(); } catch (err) { $('#so-reel-info').textContent = `Fichier refusé : ${err.message || err}.`; }
  }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 150); };

  // ── Exercice : Mw et fc par l'ajustement à la main ──────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 47);
    etat.r = { Mw: Math.round(u.entre(3.8, 5.8) * 10) / 10, dsigma: Math.round(Math.exp(u.entre(Math.log(2), Math.log(20)))), graine: numero };
    etat.exo = { numero }; etat.verifie = false; etat.vu = 0;
    $('#so-exo-num').textContent = 'Exercice n° ' + numero; $('#so-r-mw').value = ''; $('#so-r-fc').value = ''; $('#so-corrige').innerHTML = '';
    recalculer();
  }
  function verifier() {
    const lu = id => parseFloat(String($(id).value).replace(',', '.')), mw = lu('#so-r-mw'), fc = lu('#so-r-fc');
    const a = etat.stations[etat.vu].a, okM = Math.abs(mw - a.Mw) <= 0.15, okF = Math.abs(Math.log(fc / a.fc)) <= Math.log(1.25);
    etat.verifie = true;
    const lignes = [
      ['Mw (station affichée)', Number.isFinite(mw) ? virg(mw, 2) : '—', virg(a.Mw, 2), okM, '± 0,15 : Mw = (log10(Ω0/C) − 9,05)/1,5'],
      ['fc', Number.isFinite(fc) ? `${virg(fc, 2)} Hz` : '—', `${virg(a.fc, 2)} Hz`, okF, '± 25 % : coude du spectre de déplacement'],
    ];
    $('#so-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Ajustement</th></tr></thead><tbody>
      ${lignes.map(([n, x, y, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${x}</td><td class="n">${y}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 2 justes</p>
      <p class="verite">Générateur : Mw ${virg(etat.r.Mw, 1)}, Δσ ${virg(etat.r.dsigma, 1)} MPa ; ML moyenne ${virg(moyennes().ML, 2)}.</p>`;
    etat.manuel = etat.stations.map(s => ({ omega0: s.a.omega0, fc: s.a.fc }));
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#so-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#so-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#so-mode-reel').setAttribute('aria-pressed', String(m === 'reel'));
    $('#so-panneau-exercice').hidden = m !== 'exercice';
    $('#so-panneau-reel').hidden = m !== 'reel';
    etat.vu = 0;
    // en exercice, le générateur (Mw et Δσ vrais) reste caché : c'est la réponse demandée
    $('#so-reglages-seisme').hidden = m !== 'explorer';
    if (m === 'reel') { etat.verifie = false; recalculerReel(); }
    else if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; recalculer(); }
  }

  function brancher() {
    $('#so-mw').addEventListener('input', e => { etat.r.Mw = parseFloat(e.target.value); $('#so-mw-v').textContent = virg(etat.r.Mw, 1); planifier(); });
    $('#so-ds').addEventListener('input', e => { etat.r.dsigma = Math.round(Math.pow(10, parseFloat(e.target.value)) * 10) / 10; $('#so-ds-v').textContent = `${virg(etat.r.dsigma, 1)} MPa`; planifier(); });
    $('#so-autre').addEventListener('click', () => { etat.r.graine = 1 + Math.floor(Math.random() * 1e6); recalculer(); });
    $('#so-o0').addEventListener('input', e => { etat.manuel[etat.vu].omega0 = Math.pow(10, parseFloat(e.target.value)); tout(); });
    $('#so-fc').addEventListener('input', e => { etat.manuel[etat.vu].fc = Math.pow(10, parseFloat(e.target.value)); tout(); });
    $('#so-ajuster').addEventListener('click', () => { const a = etat.stations[etat.vu].a; etat.manuel[etat.vu] = { omega0: a.omega0, fc: a.fc }; tout(); });
    $('#so-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#so-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#so-mode-reel').addEventListener('click', () => changerMode('reel'));
    $('#so-fichier').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) chargerFichier(f); });
    $$('[data-so-foyer]').forEach(b => b.addEventListener('click', () => { etat.foyer = b.dataset.soFoyer; recalculerReel(); }));
    $('#so-verifier').addEventListener('click', verifier);
    $('#so-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-source').hidden && (etat.stations.length || reel())) { lireCouleurs(); tout(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#so-sismo', '#so-spectre']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'source') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); setTimeout(recalculer, 30); return; }
    // séisme réel : fichier, pointés ou localisation modifiés dans un autre banc
    const c = SeismeReel.courant();
    if (reel() && (c ? c.version : -1) !== etat.version) recalculerReel();
    else tout();
  });
})();
