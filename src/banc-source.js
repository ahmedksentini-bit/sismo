import Sismo from './sismo/signal.js';
import Source from './sismo/source.js';

// src/banc-source.js — banc « source » : un séisme enregistré par quatre stations ; spectre de déplacement des
// ondes S, corrigé du trajet et du site, et modèle de Brune (Ω0, fc) ajusté à la main ou automatiquement ;
// moment sismique, Mw et chute de contrainte, face à ML. Calcul dans src/sismo/source.js ; la vérité est
// celle du générateur.
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
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), stations: [], vu: 0, manuel: null, exo: null, verifie: false };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

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
  const moyennes = () => {
    const st = etat.stations, n = st.length;
    return { Mw: st.reduce((s, x) => s + x.a.Mw, 0) / n, ML: st.reduce((s, x) => s + x.ml, 0) / n, fc: Math.exp(st.reduce((s, x) => s + Math.log(x.a.fc), 0) / n), ds: Math.exp(st.reduce((s, x) => s + Math.log(x.a.dsigma), 0) / n) };
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
  function dessinerSismo() {
    const cv = $('#so-sismo');
    if (cv.clientWidth < 50 || !etat.stations.length) return;
    const { ctx, W, H } = preparer(cv), s = etat.stations[etat.vu], ev = s.ev, v = ev.vit.N, m = { g: 50, d: 14, h: 26, b: 26 };
    const duree = ev.n * ev.dt, X = t => m.g + (t / duree) * (W - m.g - m.d);
    let vmax = 0; for (let i = 0; i < ev.n; i++) vmax = Math.max(vmax, Math.abs(v[i]));
    const Y = x => m.h + (H - m.h - m.b) * (0.5 - (0.45 * x) / vmax);
    // fenêtre S analysée
    ctx.fillStyle = COUL['pick-s']; ctx.globalAlpha = 0.14;
    ctx.fillRect(X(s.a.i0 * ev.dt), m.h, X((s.a.i0 + s.a.n) * ev.dt) - X(s.a.i0 * ev.dt), H - m.h - m.b); ctx.globalAlpha = 1;
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let t = 0; t <= duree; t += 20) { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(Math.round(t + ev.t0)), x, H - m.b + 5); }
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
    const pas = Math.max(1, Math.floor(ev.n / (2 * (W - m.g - m.d))));
    for (let i = 0; i < ev.n; i += pas) {
      let lo = v[i], hi = v[i];
      for (let j = i; j < Math.min(ev.n, i + pas); j++) { lo = Math.min(lo, v[j]); hi = Math.max(hi, v[j]); }
      if (i === 0) ctx.moveTo(X(i * ev.dt), Y(lo)); else ctx.lineTo(X(i * ev.dt), Y(lo));
      ctx.lineTo(X(i * ev.dt), Y(hi));
    }
    ctx.stroke();
    texte(ctx, `${s.code} · ${s.d} km · vitesse N-S · fenêtre S de ${virg(s.a.n * ev.dt, 1)} s`, m.g, 13, COUL.ink, `800 12px ${POLICE}`);
    texte(ctx, 'temps depuis l\'origine (s)', W - m.d - 4, H - m.b - 10, COUL.muted, `10.5px ${MONO}`, 'right');
  }
  function dessinerSpectre() {
    const cv = $('#so-spectre');
    if (cv.clientWidth < 50 || !etat.stations.length) return;
    const { ctx, W, H } = preparer(cv), s = etat.stations[etat.vu], a = s.a, mod = etat.manuel[etat.vu], m = { g: 56, d: 14, h: 30, b: 30 };
    const f0 = 0.1, f1 = 15, vals = [...a.brut, ...a.corrige].map(p => p[1]), y1 = Math.max(...vals, mod.omega0) * 3, y0 = Math.min(...vals) / 3;
    const X = f => m.g + (Math.log(f / f0) / Math.log(f1 / f0)) * (W - m.g - m.d), Y = d => H - m.b - (Math.log(d / y0) / Math.log(y1 / y0)) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const f of [0.1, 0.2, 0.5, 1, 2, 5, 10]) { const x = Math.round(X(f)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(f, f < 1 ? 1 : 0), x, H - m.b + 5); }
    for (let e = Math.ceil(Math.log10(y0)); e <= Math.floor(Math.log10(y1)); e++) { const y = Math.round(Y(10 ** e)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`10${String(e).split('').map(c => SUP[c]).join('')}`, m.g - 6, y); }
    const courbe = (pts, coul, w, tirets) => { ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath(); pts.forEach(([f, d], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(f), Y(d))); ctx.stroke(); ctx.setLineDash([]); };
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    courbe(a.brut, COUL.muted, 1.4, [5, 4]);
    courbe(a.corrige, COUL.trace, 1.8);
    const fs = Array.from({ length: 120 }, (_, i) => f0 * Math.pow(f1 / f0, i / 119));
    courbe(fs.map(f => [f, mod.omega0 / (1 + (f / mod.fc) ** 2)]), COUL.blue, 2.6);
    ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(mod.fc), m.h); ctx.lineTo(X(mod.fc), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    texte(ctx, `fc = ${virg(mod.fc, 2)} Hz`, X(mod.fc) + 6, m.h + 12, COUL['pick-p'], `700 11px ${MONO}`);
    texte(ctx, `Ω0 = ${sci(mod.omega0)} m·s`, m.g + 6, Y(mod.omega0) - 12, COUL.blue, `700 11px ${MONO}`);
    texte(ctx, `déplacement (m·s) · écart ${virg(Source.ecartBrune(a.corrige, mod.omega0, mod.fc), 2)} en ln`, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    texte(ctx, 'fréquence (Hz)', W - m.d - 4, m.h + 10, COUL.muted, `10.5px ${MONO}`, 'right');
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majPanneaux() {
    const c = enExercice(), mo = moyennes(), r = etat.r, C = Source.constante();
    $('#so-afficheurs').innerHTML = [
      afficheur('Mw spectrale', c ? '—' : virg(mo.Mw, 2), c ? 'à estimer' : 'moyenne des 4 stations'),
      afficheur('ML', virg(mo.ML, 2), 'Wood-Anderson simulé'),
      afficheur('fc', c ? '—' : `${virg(mo.fc, 2)} Hz`, 'moyenne géométrique'),
      afficheur('Δσ', c ? '—' : `${virg(mo.ds, 1)} MPa`, 'relation de Brune'),
      afficheur('Vérité', c ? '—' : `Mw ${virg(r.Mw, 1)}`, c ? '' : `Δσ ${virg(r.dsigma, 1)} MPa (générateur)`),
      afficheur('C = Rθφ·F/4πρβ³', sci(C), 'M0 = Ω0 / C (N·m)'),
    ].join('');
    $('#so-table').innerHTML = `<thead><tr><th>station</th><th>R (km)</th><th>ML</th><th>fc (Hz)</th><th>Mw</th></tr></thead><tbody>${etat.stations.map((s, i) =>
      `<tr class="${i === etat.vu ? 'vu' : ''}" data-so-vu="${i}" tabindex="0"><td>${s.code}</td><td class="n">${virg(s.a.R, 0)}</td><td class="n">${virg(s.ml, 2)}</td><td class="n">${c ? '—' : virg(s.a.fc, 2)}</td><td class="n">${c ? '—' : virg(s.a.Mw, 2)}</td></tr>`).join('')}</tbody>`;
    $$('[data-so-vu]').forEach(tr => {
      const choisir = () => { etat.vu = +tr.dataset.soVu; tout(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    });
    const mod = etat.manuel[etat.vu], M0 = mod.omega0 / C;
    $('#so-lecture').textContent = `Votre modèle : M0 = Ω0/C = ${sci(M0)} N·m, soit Mw = ${virg(Source.magnitude(M0), 2)} ; Δσ = ${virg(Source.chuteContrainte(M0, mod.fc), 1)} MPa.`;
    $('#so-lecture').hidden = c;
  }
  function majControles() {
    const r = etat.r, mod = etat.manuel[etat.vu];
    $('#so-mw').value = r.Mw; $('#so-mw-v').textContent = virg(r.Mw, 1);
    $('#so-ds').value = Math.log10(r.dsigma); $('#so-ds-v').textContent = `${virg(r.dsigma, 1)} MPa`;
    $('#so-o0').value = Math.log10(mod.omega0); $('#so-o0-v').textContent = `${sci(mod.omega0)} m·s`;
    $('#so-fc').value = Math.log10(mod.fc); $('#so-fc-v').textContent = `${virg(mod.fc, 2)} Hz`;
    $('#so-ajuster').disabled = enExercice();
    $$('[data-so-mw], #so-mw, #so-ds, #so-autre').forEach(b => { b.disabled = etat.mode === 'exercice'; });
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majPanneaux();
    dessinerSismo(); dessinerSpectre();
  }
  function recalculer() { calculer(); tout(); }
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
    $('#so-panneau-exercice').hidden = m !== 'exercice';
    // en exercice, le générateur (Mw et Δσ vrais) reste caché : c'est la réponse demandée
    $('#so-reglages-seisme').hidden = m === 'exercice';
    if (m === 'exercice') nouvelExercice();
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
    $('#so-verifier').addEventListener('click', verifier);
    $('#so-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-source').hidden && etat.stations.length) { lireCouleurs(); tout(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#so-sismo', '#so-spectre']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'source') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); setTimeout(recalculer, 30); }
    else tout();
  });
})();
