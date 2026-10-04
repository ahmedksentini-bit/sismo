import Sismo from './sismo/signal.js';
import Mecanisme from './sismo/mecanisme.js';

// src/banc-mecanisme.js — banc « mécanisme » : un séisme et son réseau ; premières arrivées P sur les verticales,
// polarités reportées sur la sphère focale (projection de Schmidt, hémisphère inférieur) ; on cherche les deux plans
// nodaux à la main ou par recherche exhaustive. Calcul dans src/sismo/mecanisme.js (vérifié contre ObsPy).
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
  const BRUIT = 0.08, H = 10;
  const etat = { pret: false, mode: 'explorer', type: 'normale', n: 18, graine: 7, vrai: null, stations: [], modele: { azimut: 0, pendage: 45, glissement: -90 }, inv: null, montrer: false, vu: null, exo: null, verifie: false, rep: null };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

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
  const lectures = () => etat.stations.map(s => ({ az: s.az, i: s.i, polarite: s.polarite }));

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
  function dessinerSphere() {
    const cv = $('#me-sphere');
    if (cv.clientWidth < 50 || !etat.vrai) return;
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
    if (etat.montrer && !enExercice()) {
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
      const p = Me.projection(s.i, s.az), x = cx + R * p.x, y = cy - R * p.y, accord = Math.sign(Me.rayonnementP(M, s.i, s.az)) === s.polarite;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI);
      if (s.polarite > 0) { ctx.fillStyle = COUL.ink; ctx.fill(); } else { ctx.fillStyle = COUL.paper; ctx.fill(); ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.6; ctx.stroke(); }
      if (!accord) { ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI); ctx.stroke(); }
      if (etat.vu === s.code) { ctx.strokeStyle = COUL.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, 2 * Math.PI); ctx.stroke(); }
    }
    const nd = Me.desaccords(mec, lectures());
    texte(ctx, `${mec.azimut}° / ${mec.pendage}° / ${mec.glissement}° · ${nd} désaccord${nd > 1 ? 's' : ''} sur ${etat.n}`, 10, 14, nd ? COUL['pick-p'] : COUL.ink, `800 12px ${POLICE}`);
  }
  function dessinerTraces() {
    const cv = $('#me-traces');
    if (cv.clientWidth < 50 || !etat.vrai) return;
    const { ctx, W, H: Hh } = preparer(cv), st = [...etat.stations].sort((a, b) => a.az - b.az);
    const cols = W < 600 ? 2 : 3, lignes = Math.ceil(st.length / cols), cw = W / cols, ch = (Hh - 8) / lignes;
    st.forEach((s, k) => {
      const c = k % cols, l = Math.floor(k / cols), x0 = c * cw + 8, y0 = 4 + l * ch, w = cw - 16, yc = y0 + ch * 0.62, amp = 0.9;
      const X = j => x0 + (j / (s.trace.length - 1)) * w, Y = v => yc - (v / amp) * ch * 0.32;
      ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x0 + w, yc); ctx.stroke();
      ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(X(s.i0), yc - ch * 0.3); ctx.lineTo(X(s.i0), yc + ch * 0.3); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = etat.vu === s.code ? COUL.cyan : COUL.trace; ctx.lineWidth = 1.3; ctx.beginPath();
      s.trace.forEach((v, j) => (j ? ctx.lineTo : ctx.moveTo).call(ctx, X(j), Y(v)));
      ctx.stroke();
      const lettre = s.polarite > 0 ? 'C' : 'D';
      texte(ctx, `${s.code} · ${virg(s.az)}° · ${virg(s.delta)} km · ${s.onde}`, x0, y0 + 9, COUL.muted, `10.5px ${MONO}`);
      texte(ctx, lettre, x0 + w - 2, y0 + 9, s.polarite > 0 ? COUL.blue : COUL['pick-p'], `900 12px ${MONO}`, 'right');
      s.zone = { x0, y0, x1: x0 + w, y1: y0 + ch };
    });
  }
  function dessinerCarte() {
    const cv = $('#me-carte');
    if (cv.clientWidth < 50 || !etat.vrai) return;
    const { ctx, W, H: Hh } = preparer(cv), cx = W / 2, cy = Hh / 2, Rm = Math.min(W, Hh) / 2 - 22, Dmax = 330;
    const P = (az, d) => { const r = (Math.log(1 + d) / Math.log(1 + Dmax)) * Rm; return [cx + r * Math.sin(az * RAD), cy - r * Math.cos(az * RAD)]; };
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.fillStyle = COUL.muted; ctx.font = `10.5px ${MONO}`;
    for (const d of [10, 50, 150, 300]) { const r = (Math.log(1 + d) / Math.log(1 + Dmax)) * Rm; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${d} km`, cx, cy - r - 1); }
    for (const s of etat.stations) {
      const [x, y] = P(s.az, s.delta);
      ctx.fillStyle = s.polarite > 0 ? COUL.ink : COUL.paper; ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5.5, y + 4); ctx.lineTo(x - 5.5, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fill();
    texte(ctx, 'distances en échelle log. · ▲ C · △ D', 8, Hh - 10, COUL.muted, `10.5px ${MONO}`);
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const m = etat.modele, aux = Me.planAuxiliaire(m.azimut, m.pendage, m.glissement), ax = Me.axes(Me.tenseur(m.azimut, m.pendage, m.glissement));
    const nd = Me.desaccords(m, lectures()), nPn = etat.stations.filter(s => s.onde === 'Pn').length;
    const inv = etat.inv && !enExercice() ? etat.inv : null;
    $('#me-afficheurs').innerHTML = [
      afficheur('Désaccords', `${nd} / ${etat.n}`, 'polarités contraires au modèle'),
      // en exercice, le type de faille est demandé : seul le glissement du plan réglé est rappelé
      afficheur('Type', enExercice() ? '—' : Me.typeFaille(m.glissement), `glissement ${virg(m.glissement)}°`),
      afficheur('Plan auxiliaire', `${virg(aux.azimut)}/${virg(aux.pendage)}/${virg(aux.glissement)}`, 'azimut / pendage / glissement'),
      afficheur('Axes P et T', `P ${virg(ax.P.azimut)}°↓${virg(ax.P.plongement)}°`, `T ${virg(ax.T.azimut)}°↓${virg(ax.T.plongement)}°`),
      afficheur('Inversion', inv ? `${inv.desaccords} désaccord${inv.desaccords > 1 ? 's' : ''}` : '—', inv ? `${inv.solutions.length} solution${inv.solutions.length > 1 ? 's' : ''} au pas de 10°` : 'recherche exhaustive'),
      afficheur('Réseau', `${etat.n} stations`, `${nPn} en Pn (émergence ${virg(Me.emergence(300, H).i)}°), foyer à ${H} km`),
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
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majAfficheurs();
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
    $('#me-panneau-exercice').hidden = m !== 'exercice';
    $('#me-reglages-seisme').hidden = m !== 'explorer';
    if (m === 'exercice') nouvelExercice();
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
      etat.inv = Me.inverser(lectures(), 10);
      if (!enExercice()) etat.modele = { ...etat.inv.solutions[Math.floor(etat.inv.solutions.length / 2)] };
      tout();
    });
    $('#me-traces').addEventListener('click', e => {
      const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const s = etat.stations.find(q => q.zone && x >= q.zone.x0 && x <= q.zone.x1 && y >= q.zone.y0 && y <= q.zone.y1);
      etat.vu = s ? s.code : null; dessinerSphere(); dessinerTraces();
    });
    $('#me-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#me-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $$('[data-me-rep]').forEach(b => b.addEventListener('click', () => { etat.rep = b.dataset.meRep; $$('[data-me-rep]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $('#me-verifier').addEventListener('click', verifier);
    $('#me-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-mecanisme').hidden && etat.vrai) { lireCouleurs(); tout(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#me-sphere', '#me-traces', '#me-carte']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'mecanisme') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); generer(); tout(); }
    else tout();
  });
})();
