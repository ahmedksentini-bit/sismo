import MiniSeed from './sismo/miniseed.js';
import Fdsn from './sismo/fdsn.js';
import Direct from './sismo/direct.js';
import Globe from './sismo/globe.js';
import Teleseisme from './sismo/teleseisme.js';
import Sismo from './sismo/signal.js';

// src/direct-page.js — page « En direct » : stations GEOFON autour de la Méditerranée, comme un centre de surveillance
// (SeisComP : carte scmv, traces scrttv). Données par le relais SeedLink du site (functions/api/seedlink.js, temps
// réel), sinon par le service FDSN de GEOFON interrogé toutes les 20 s (functions/api/geofon.js), sinon démonstration
// (séisme fictif, signaux du générateur de téléséismes, signalée comme telle). Calculs dans src/sismo/ (miniSEED,
// filtres, STA/LTA, tampons, arrivées ak135).
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const VUE = { lon: [-12, 42], lat: [28, 48.5] };
  const ZONE = { minlatitude: 25, maxlatitude: 50, minlongitude: -15, maxlongitude: 45 };
  const MAX_SUIVIES = 12, DEFAUT_SUIVIES = 8, INTERVALLE_FDSN = 20000, LATENCE_GRISE = 180;
  const FILTRES = { aucun: null, large: [2, 0.5, 5], proche: [2, 1, 8], tele: [2, 0.5, 2], ms: [4, 1 / 22, 1 / 18], detecteur: [4, 0.7, 2] };
  // Détecteur : STA de 2 s sur LTA de 80 s, voie filtrée de 0,7 à 2 Hz (ordre 4), déclenchement au-dessus de 4, fin sous 1,5.
  const DETECTEUR = { sta: 2, lta: 80, on: 4, off: 1.5 };
  // stations fictives du mode démonstration quand la liste de GEOFON est inaccessible
  const STATIONS_DEMO = [['DEMO1', 36.8, 10.2], ['DEMO2', 41.9, 12.5], ['DEMO3', 38.0, 23.7], ['DEMO4', 41.0, 29.0], ['DEMO5', 40.4, -3.7], ['DEMO6', 35.2, 33.4]]
    .map(([s, lat, lon]) => ({ reseau: 'XX', station: s, emplacement: '', voie: 'BHZ', lat, lon, sensibilite: 6e8, cadence: 20, site: 'station fictive' }));
  const ident = s => `${s.reseau}.${s.station}.${s.emplacement}.${s.voie}`;
  const hms = t => new Date(t).toISOString().slice(11, 19);
  const depuisQuand = ms => { const s = Math.round(ms / 1000); return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} j`; };

  const etat = {
    mode: 'seedlink', stations: [], suivies: [], voies: new Map(), seismes: [], catalogue: 'med', choisi: null,
    fenetre: 15, filtre: 'large', pause: null, cotes: null, demo: null, mesures: new Map(), arrivees: new Map(),
    cx: { ws: null, etat: 'arret', paquets: 0, dernier: null, echecs: 0, minuteur: 0, message: '' }, listeOk: false,
  };
  const maintenant = () => etat.pause ?? Date.now();

  // ── Petits utilitaires ──────────────────────────────────────────────────────────────────────────────────────
  let minuteurToast = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(minuteurToast); minuteurToast = setTimeout(() => t.classList.remove('show'), 3500);
  }
  function badge(texte, occupe = false) { const b = $('#dr-badge'); b.classList.toggle('calcul', occupe); b.lastElementChild.textContent = texte; }
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['paper', 'ink', 'muted', 'line', 'soft', 'grid', 'grid-strong', 'trace', 'pick-p', 'pick-s', 'amp', 'blue', 'cyan', 'teal', 'vrai', 'bad']) COUL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function preparer(cv, hauteur) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth;
    if (hauteur) cv.style.height = `${Math.round(hauteur)}px`;
    const H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }
  const api = (service, params) => `api/geofon?${new URLSearchParams({ service, ...params })}`;

  // ── Stations et séismes (FDSN de GEOFON, par le relais) ───────────────────────────────────────────────────────
  async function chargerStations() {
    try {
      const r = await fetch(api('station', { network: 'GE', channel: 'BHZ,HHZ', level: 'channel', format: 'text', ...ZONE, endafter: Fdsn.heure(Date.now()) }));
      if (!r.ok) throw new Error(r.status);
      etat.stations = Fdsn.choisirVoies(Fdsn.voies(await r.text()));
      etat.listeOk = etat.stations.length > 0;
    } catch { etat.stations = []; etat.listeOk = false; }
    return etat.listeOk;
  }
  async function chargerSeismes() {
    const p = etat.catalogue === 'med'
      ? { format: 'text', ...ZONE, minmagnitude: '2.5', starttime: Fdsn.heure(Date.now() - 7 * 86400000), orderby: 'time', limit: '150' }
      : { format: 'text', minmagnitude: '5.5', starttime: Fdsn.heure(Date.now() - 7 * 86400000), orderby: 'time', limit: '100' };
    try {
      const r = await fetch(api('event', p));
      if (r.status === 204) etat.seismes = [];
      else if (r.ok) etat.seismes = Fdsn.evenements(await r.text());
      else throw new Error(r.status);
      $('#dr-seismes-info').textContent = `Catalogue GEOFON des 7 derniers jours (${etat.seismes.length} séismes), mis à jour toutes les 2 minutes.`;
    } catch {
      if (etat.mode !== 'demo') $('#dr-seismes-info').textContent = 'Catalogue de GEOFON inaccessible pour le moment.';
    }
    if (etat.demo) etat.seismes = [etat.demo.seisme, ...etat.seismes.filter(e => e.id !== etat.demo.seisme.id)];
    majSeismes();
  }
  // Stations suivies par défaut : réparties sur le bassin (la plus proche de Tunis, puis à chaque fois la plus éloignée
  // de celles déjà prises).
  function suiviesParDefaut(liste) {
    if (!liste.length) return [];
    const d = (a, b) => Direct.distanceAzimut(a.lat, a.lon, b.lat, b.lon).distance;
    const prises = [liste.reduce((m, s) => (d(s, { lat: 36.8, lon: 10.2 }) < d(m, { lat: 36.8, lon: 10.2 }) ? s : m))];
    while (prises.length < Math.min(DEFAUT_SUIVIES, liste.length)) {
      let mieux = null, dm = -1;
      for (const s of liste) { if (prises.includes(s)) continue; const m = Math.min(...prises.map(p => d(p, s))); if (m > dm) { dm = m; mieux = s; } }
      prises.push(mieux);
    }
    return prises.sort((a, b) => a.lon - b.lon);
  }

  // ── Réception des données ─────────────────────────────────────────────────────────────────────────────────────
  function recevoir(enr) {
    if (!enr || !enr.echantillons.length) return;
    if (!etat.voies.has(enr.id)) etat.voies.set(enr.id, Direct.voie());
    etat.voies.get(enr.id).ajouter(enr);
    etat.cx.paquets++; etat.cx.dernier = Date.now();
  }
  // Reprise : à partir du plus ancien des derniers échantillons reçus (sans dépasser la fenêtre ni 30 minutes).
  function reprise() {
    const plus = Date.now() - Math.min(30, etat.fenetre) * 60000, fins = etat.suivies.map(s => { const v = etat.voies.get(ident(s)); return v ? v.fin() : null; });
    return fins.some(f => f === null) ? plus : Math.max(plus, Math.min(...fins) - 2000);
  }
  function fermer() {
    clearInterval(etat.cx.minuteur); clearTimeout(etat.cx.minuteur);
    if (etat.cx.ws) { const w = etat.cx.ws; etat.cx.ws = null; try { w.close(); } catch { /* déjà fermé */ } }
  }
  function connecterSeedLink() {
    fermer();
    if (!etat.suivies.length) return;
    const flux = etat.suivies.map(ident).join(','), proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new WebSocket(`${proto}//${location.host}${location.pathname.replace(/[^/]*$/, '')}api/seedlink?flux=${encodeURIComponent(flux)}&depuis=${encodeURIComponent(new Date(reprise()).toISOString())}`); }
    catch { basculer('fdsn', 'WebSocket indisponible : interrogation du service FDSN.'); return; }
    ws.binaryType = 'arraybuffer';
    etat.cx.ws = ws; etat.cx.etat = 'connexion'; badge('Connexion SeedLink…', true);
    let recu = false;
    const garde = setTimeout(() => { if (!recu && etat.cx.ws === ws) { etat.cx.echecs++; ws.close(); } }, 20000);
    ws.onmessage = e => {
      if (typeof e.data === 'string') {
        try { const m = JSON.parse(e.data); if (m.message) etat.cx.message = m.message; if (m.type === 'erreur') etat.cx.echecs++; } catch { /* message illisible */ }
        return;
      }
      if (!recu) { recu = true; etat.cx.echecs = 0; etat.cx.etat = 'ouvert'; badge(`Temps réel · ${etat.suivies.length} stations`); }
      recevoir(MiniSeed.enregistrement(e.data));
    };
    ws.onclose = () => {
      clearTimeout(garde);
      if (etat.cx.ws !== ws || etat.mode !== 'seedlink') return;
      etat.cx.ws = null;
      if (!recu) etat.cx.echecs++;
      // fermeture normale (10 minutes) : reconnexion immédiate ; deux échecs de suite : service FDSN
      if (etat.cx.echecs >= 2) basculer('fdsn', 'Relais SeedLink indisponible : interrogation du service FDSN toutes les 20 s.');
      else etat.cx.minuteur = setTimeout(connecterSeedLink, recu ? 500 : 3000);
    };
  }
  async function interrogerFdsn() {
    if (!etat.suivies.length || etat.mode !== 'fdsn') return;
    const fin = Date.now(), debut = reprise(), reseaux = [...new Set(etat.suivies.map(s => s.reseau))], voies = [...new Set(etat.suivies.map(s => s.voie))];
    badge('Interrogation FDSN…', true);
    try {
      const r = await fetch(api('dataselect', { network: reseaux.join(','), station: etat.suivies.map(s => s.station).join(','), channel: voies.join(','), starttime: Fdsn.heure(debut), endtime: Fdsn.heure(fin) }));
      if (r.status === 204) { etat.cx.etat = 'ouvert'; badge(`Toutes les 20 s · ${etat.suivies.length} stations`); return; }
      if (!r.ok) throw new Error(r.status);
      const suivis = new Set(etat.suivies.map(ident));
      for (const e of MiniSeed.lire(await r.arrayBuffer())) if (suivis.has(e.id)) recevoir(e);
      etat.cx.echecs = 0; etat.cx.etat = 'ouvert'; badge(`Toutes les 20 s · ${etat.suivies.length} stations`);
    } catch {
      etat.cx.echecs++;
      if (etat.cx.echecs >= 2 && !etat.voies.size) basculer('demo', 'GEOFON injoignable : mode démonstration (signaux simulés).');
      else badge('FDSN : nouvel essai…', true);
    }
  }
  function basculer(mode, message) {
    if (message) toast(message);
    changerMode(mode);
  }
  function changerMode(m) {
    fermer();
    etat.mode = m; etat.cx.echecs = 0; etat.cx.etat = 'arret';
    $$('[data-dr-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.drMode === m)));
    $('#dr-mode-aide').textContent = {
      seedlink: 'Les paquets SeedLink de GEOFON arrivent par le relais du site dès qu\'ils sont publiés : quelques secondes à une minute de retard selon la station.',
      fdsn: 'Le site interroge le service FDSN de GEOFON toutes les 20 s : plus robuste qu\'une connexion ouverte, mais une à quelques minutes de retard.',
      demo: 'Démonstration : séisme fictif et signaux simulés par le générateur de téléséismes du cours. Aucune donnée réelle n\'est affichée.',
    }[m];
    if (m !== 'demo' && etat.demo) { etat.demo = null; etat.voies.clear(); etat.seismes = []; etat.choisi = null; demarrer(); return; }
    if (m === 'seedlink') connecterSeedLink();
    else if (m === 'fdsn') { interrogerFdsn(); etat.cx.minuteur = setInterval(interrogerFdsn, INTERVALLE_FDSN); }
    else preparerDemo();
    majTout();
  }

  // ── Démonstration : séisme fictif, signaux simulés à chaque station ───────────────────────────────────────────
  async function preparerDemo() {
    badge('Préparation de la démonstration…', true);
    if (!etat.suivies.length || !etat.listeOk) { etat.stations = STATIONS_DEMO; etat.suivies = STATIONS_DEMO.slice(); }
    etat.voies.clear();
    const origine = Date.now() - 4 * 60000;
    const seisme = { id: 'demo', temps: origine, lat: 29.0, lon: 57.0, h: 25, mag: 6.6, typeMag: 'Mw', region: 'séisme fictif (sud de l\'Iran), démonstration', auteur: 'démonstration' };
    etat.demo = { seisme, series: new Map(), pousse: new Map() };
    for (const [k, s] of etat.suivies.entries()) {
      await new Promise(r => setTimeout(r, 0));
      if (!etat.demo) return;
      const { distance, azimut } = Direct.distanceAzimut(seisme.lat, seisme.lon, s.lat, s.lon);
      const dt = 0.05, t0 = -15 * 60, n = Math.round((60 * 60) / dt), z = new Float64Array(n);
      const ev = Teleseisme.generer({ Mw: seisme.mag, delta: Math.max(10, Math.round(distance)), h: seisme.h, baz: Math.round((azimut + 180) % 360), graine: 101 + k });
      const i0 = Math.round((ev.t0 - t0) / dt);
      for (let i = 0; i < ev.n && i0 + i < n; i++) if (i0 + i >= 0) z[i0 + i] = ev.vit.Z[i];
      const vide = new Float64Array(n), rec = Sismo.enregistrer({ n, dt, vit: { Z: z, N: vide, E: vide }, acc: { Z: vide, N: vide, E: vide } }, 'HH', 'standard', 7 + k);
      const coups = Float64Array.from(rec.series.Z, v => v * s.sensibilite);
      etat.demo.series.set(ident(s), { debut: origine + t0 * 1000, dt, coups });
      badge(`Démonstration : ${k + 1} / ${etat.suivies.length} stations`, true);
    }
    etat.seismes = [seisme, ...etat.seismes.filter(e => e.id !== 'demo')];
    etat.choisi = seisme; etat.arrivees.clear();
    clearInterval(etat.cx.minuteur);
    etat.cx.minuteur = setInterval(pousserDemo, 1000);
    pousserDemo();
    badge('Démonstration (signaux simulés)');
    majSeismes(); majArrivees();
  }
  // Livre les échantillons simulés dont l'heure est passée, par paquets, comme un flux.
  function pousserDemo() {
    if (!etat.demo) return;
    const t = Date.now();
    for (const s of etat.suivies) {
      const id = ident(s), sr = etat.demo.series.get(id);
      if (!sr) continue;
      const deja = etat.demo.pousse.get(id) || 0, jusque = Math.min(sr.coups.length, Math.floor((t - 1500 - sr.debut) / (sr.dt * 1000)));
      if (jusque <= deja) continue;
      recevoir({ id, debut: sr.debut + deja * sr.dt * 1000, cadence: 1 / sr.dt, echantillons: sr.coups.subarray(deja, jusque) });
      etat.demo.pousse.set(id, jusque);
    }
  }

  // ── Mesures par station : vitesse filtrée, STA/LTA, amplitude des 60 dernières secondes ───────────────────────
  const cacheSos = new Map();
  const sos = (cle, fs) => { const k = `${cle}|${fs}`; if (!cacheSos.has(k)) { const f = FILTRES[cle]; cacheSos.set(k, f ? Direct.butterPasseBande(f[0], f[1], Math.min(f[2], 0.45 * fs), fs) : null); } return cacheSos.get(k); };
  function mesurer(s, t0, t1) {
    const v = etat.voies.get(ident(s));
    if (!v) return null;
    const f = FILTRES[etat.filtre], amorce = f ? Math.min(600, Math.max(60, 6 / f[1])) * 1000 : 0, amorceL = (DETECTEUR.lta + 20) * 1000;
    const e = v.extraire(t0 - Math.max(amorce, amorceL), t1);
    if (!e || !e.donnees.length) return null;
    const fs = e.cadence, k = 1e6 / s.sensibilite, brut = Float64Array.from(e.donnees, x => x * k);
    // sans filtre : on retire la moyenne de la fenêtre (décalage du numériseur)
    let m = 0, nm = 0;
    for (const x of brut) if (!Number.isNaN(x)) { m += x; nm++; }
    m = nm ? m / nm : 0;
    const large = Direct.filtrer(brut, sos('large', fs)), aff = f ? (etat.filtre === 'large' ? large : Direct.filtrer(brut, sos(etat.filtre, fs))) : brut.map(x => x - m);
    const iV = Math.round((t0 - e.t0) / (1000 / fs)), vue = aff.subarray(Math.max(0, iV));
    // STA/LTA sur la voie du détecteur, déclenchements dans la fenêtre (un trou remplacé par des zéros ferait
    // déclencher à la reprise : on ignore la durée de la LTA qui suit un trou)
    const det = Direct.filtrer(brut, sos('detecteur', fs)), nlta = Math.round(DETECTEUR.lta * fs);
    const r = Direct.staLta(Float64Array.from(det, x => (Number.isNaN(x) ? 0 : x)), Math.round(DETECTEUR.sta * fs), nlta);
    const trous = new Int32Array(det.length + 1);
    for (let i = 0; i < det.length; i++) trous[i + 1] = trous[i] + (Number.isNaN(det[i]) ? 1 : 0);
    const decl = Direct.declenchements(r, DETECTEUR.on, DETECTEUR.off).filter(([a]) => a >= iV && trous[a + 1] - trous[Math.max(0, a - nlta)] === 0).map(([a]) => e.t0 + (a * 1000) / fs);
    // amplitude des 60 dernières secondes (carte)
    let amp = 0;
    const i60 = Math.max(0, large.length - Math.round(60 * fs));
    for (let i = i60; i < large.length; i++) if (!Number.isNaN(large[i])) amp = Math.max(amp, Math.abs(large[i]));
    const mes = { t0: e.t0 + (Math.max(0, iV) * 1000) / fs, fs, x: vue, decl, amp, fin: v.fin() };
    etat.mesures.set(ident(s), mes);
    return mes;
  }

  // ── Traces (comme scrttv) ─────────────────────────────────────────────────────────────────────────────────────
  function dessinerTraces() {
    const cv = $('#dr-traces'), n = Math.max(1, etat.suivies.length), hautRang = window.innerWidth < 760 ? 58 : 70;
    const { ctx, W, H } = preparer(cv, 30 + n * hautRang + 26), g = { x0: 10, x1: W - 10, y0: 26, y1: H - 26 };
    const t1 = maintenant(), t0 = t1 - etat.fenetre * 60000, X = t => g.x0 + ((t - t0) / (t1 - t0)) * (g.x1 - g.x0), hR = (g.y1 - g.y0) / n;
    // graduations du temps (UTC)
    const pas = [30, 60, 120, 300, 600, 900].map(x => x * 1000).find(p => (t1 - t0) / p <= 8) || 900000;
    ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = Math.ceil(t0 / pas) * pas; t <= t1; t += pas) {
      const x = Math.round(X(t)) + 0.5;
      ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
      ctx.fillStyle = COUL.muted; ctx.fillText(hms(t).slice(0, pas < 60000 ? 8 : 5), x, g.y1 + 6);
    }
    texte(ctx, 'heure UTC', g.x1, H - 6, COUL.muted, `10.5px ${POLICE}`, 'right', 'bottom');
    if (!etat.suivies.length) { texte(ctx, 'Aucune station suivie : cliquez une station sur la carte.', W / 2, H / 2, COUL.muted, `700 13px ${POLICE}`, 'center'); return; }
    const choisi = etat.choisi;
    etat.suivies.forEach((s, k) => {
      const yc = g.y0 + hR * (k + 0.5);
      if (k) { ctx.strokeStyle = COUL['grid-strong']; ctx.beginPath(); ctx.moveTo(g.x0, Math.round(g.y0 + hR * k) + 0.5); ctx.lineTo(g.x1, Math.round(g.y0 + hR * k) + 0.5); ctx.stroke(); }
      const mes = mesurer(s, t0, t1);
      // arrivées prévues du séisme choisi
      if (choisi) for (const a of arriveesStation(s, choisi)) {
        const t = choisi.temps + a.temps * 1000;
        if (t < t0 || t > t1) continue;
        const x = X(t), coul = a.phase === 'LR' ? COUL.amp : /^[pP]/.test(a.phase) ? COUL['pick-p'] : COUL['pick-s'];
        ctx.strokeStyle = coul; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, yc - hR / 2 + 2); ctx.lineTo(x, yc + hR / 2 - 2); ctx.stroke(); ctx.setLineDash([]);
        texte(ctx, a.phase, x + 3, yc - hR / 2 + 18, coul, `800 10.5px ${POLICE}`);
      }
      let max = 0;
      if (mes) {
        for (const v of mes.x) if (!Number.isNaN(v)) max = Math.max(max, Math.abs(v));
        const ech = (hR * 0.45) / (max || 1), parPx = Math.max(1, Math.floor(mes.x.length / (g.x1 - g.x0)));
        ctx.save(); ctx.beginPath(); ctx.rect(g.x0, yc - hR / 2, g.x1 - g.x0, hR); ctx.clip();
        ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
        let leve = true;
        for (let i = 0; i < mes.x.length; i += parPx) {
          let mn = Infinity, mx = -Infinity;
          for (let j = i; j < Math.min(mes.x.length, i + parPx); j++) { const v = mes.x[j]; if (!Number.isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
          if (mn === Infinity) { leve = true; continue; }
          const x = X(mes.t0 + (i * 1000) / mes.fs);
          if (leve) { ctx.moveTo(x, yc - mx * ech); leve = false; } else ctx.lineTo(x, yc - mx * ech);
          ctx.lineTo(x, yc - mn * ech);
        }
        ctx.stroke(); ctx.restore();
        // déclenchements STA/LTA
        ctx.fillStyle = COUL.bad;
        for (const t of mes.decl) { const x = X(t); ctx.beginPath(); ctx.moveTo(x, yc + hR / 2 - 3); ctx.lineTo(x - 5, yc + hR / 2 - 12); ctx.lineTo(x + 5, yc + hR / 2 - 12); ctx.closePath(); ctx.fill(); }
      }
      const lat = Direct.latence(mes ? mes.fin : null, Date.now());
      const dist = choisi ? Direct.distanceAzimut(choisi.lat, choisi.lon, s.lat, s.lon).distance : null;
      texte(ctx, `${s.reseau}.${s.station} ${s.voie}${dist !== null ? ` · Δ ${virg(dist, 1)}°` : ''}`, g.x0 + 4, yc - hR / 2 + 9, COUL.ink, `700 11.5px ${MONO}`);
      texte(ctx, mes ? `max ${virg(max, max < 1 ? 3 : 1)} µm/s · latence ${Number.isFinite(lat) ? depuisQuand(lat * 1000) : '—'}` : 'en attente de données', g.x1 - 4, yc - hR / 2 + 9, lat > LATENCE_GRISE ? COUL.bad : COUL.muted, `10.5px ${MONO}`, 'right');
    });
  }
  // Arrivées prévues (ak135) d'un séisme à une station, mises en cache.
  function arriveesStation(s, e) {
    const cle = `${e.id}|${ident(s)}`;
    if (!etat.arrivees.has(cle)) {
      const { distance } = Direct.distanceAzimut(e.lat, e.lon, s.lat, s.lon);
      etat.arrivees.set(cle, distance < 0.5 ? [] : Direct.arrivees(distance, Number.isFinite(e.h) ? e.h : 10));
    }
    return etat.arrivees.get(cle);
  }

  // ── Carte (comme scmv) ────────────────────────────────────────────────────────────────────────────────────────
  let geo = null;
  function projection(W) {
    const latc = (VUE.lat[0] + VUE.lat[1]) / 2, kx = Math.cos((latc * Math.PI) / 180), larg = (VUE.lon[1] - VUE.lon[0]) * kx, haut = VUE.lat[1] - VUE.lat[0];
    const H = Math.min(window.innerHeight * 0.7, (W * haut) / larg), s = Math.min((W - 20) / larg, (H - 20) / haut);
    const ox = (W - larg * s) / 2, oy = (H - haut * s) / 2;
    return { H, X: lon => ox + (lon - VUE.lon[0]) * kx * s, Y: lat => oy + (VUE.lat[1] - lat) * s };
  }
  const couleurAmplitude = a => {
    // échelle logarithmique de 0,01 à 10 µm/s, du bleu au rouge (comme les couleurs de mouvement du sol de scmv)
    const pal = ['#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626'], k = Math.max(0, Math.min(5, Math.floor((Math.log10(Math.max(a, 1e-3)) + 2) * (5 / 3))));
    return pal[k];
  };
  function dessinerCarte() {
    const cv = $('#dr-carte'), W = cv.clientWidth, pr = projection(W), { ctx, H } = preparer(cv, pr.H), { X, Y } = pr;
    geo = pr;
    ctx.fillStyle = COUL.soft; ctx.fillRect(X(VUE.lon[0]), Y(VUE.lat[1]), X(VUE.lon[1]) - X(VUE.lon[0]), Y(VUE.lat[0]) - Y(VUE.lat[1]));
    ctx.save(); ctx.beginPath(); ctx.rect(X(VUE.lon[0]), Y(VUE.lat[1]), X(VUE.lon[1]) - X(VUE.lon[0]), Y(VUE.lat[0]) - Y(VUE.lat[1])); ctx.clip();
    // graticule tous les 5°
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let lon = -10; lon <= 40; lon += 5) { ctx.beginPath(); ctx.moveTo(X(lon), Y(VUE.lat[0])); ctx.lineTo(X(lon), Y(VUE.lat[1])); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.abs(lon)}°${lon < 0 ? 'O' : lon > 0 ? 'E' : ''}`, X(lon), Y(VUE.lat[0]) - 2); }
    for (let lat = 30; lat <= 45; lat += 5) { ctx.beginPath(); ctx.moveTo(X(VUE.lon[0]), Y(lat)); ctx.lineTo(X(VUE.lon[1]), Y(lat)); ctx.stroke(); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`${lat}°N`, X(VUE.lon[0]) + 3, Y(lat) - 1); }
    // côtes et frontières (Natural Earth)
    if (etat.cotes) {
      for (const [cle, larg, coul, tirets] of [['frontieres', 0.8, COUL['grid-strong'], [3, 3]], ['cotes', 1.2, COUL.muted, []]]) {
        ctx.strokeStyle = coul; ctx.lineWidth = larg; ctx.setLineDash(tirets); ctx.beginPath();
        for (const l of etat.cotes[cle]) for (let i = 0; i < l.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(l[i]), Y(l[i + 1]));
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // séismes : disques selon la magnitude, couleur selon l'âge
    const t = maintenant();
    for (const e of etat.seismes) {
      if (e.lon < VUE.lon[0] || e.lon > VUE.lon[1] || e.lat < VUE.lat[0] || e.lat > VUE.lat[1]) continue;
      const age = t - e.temps, r = 2.5 + 2.2 * Math.max(0, (e.mag ?? 3) - 2.5);
      ctx.fillStyle = age < 3600000 ? '#dc2626' : age < 86400000 ? '#ea580c' : '#ca8a04'; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(X(e.lon), Y(e.lat), r, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
      if (etat.choisi && e.id === etat.choisi.id) { ctx.strokeStyle = COUL.ink; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // fronts P et S du séisme choisi (une heure au plus après l'origine)
    const c = etat.choisi;
    if (c && t - c.temps < 3600000 && t > c.temps) {
      for (const [ph, coul] of [['P', COUL['pick-p']], ['S', COUL['pick-s']]]) {
        const d = distanceFront(c, ph, (t - c.temps) / 1000);
        if (!(d > 0)) continue;
        ctx.strokeStyle = coul; ctx.lineWidth = 2; ctx.beginPath();
        for (let k = 0; k <= 120; k++) { const [la, lo] = destination(c.lat, c.lon, d, (k * 360) / 120); (k ? ctx.lineTo : ctx.moveTo).call(ctx, X(lo), Y(la)); }
        ctx.stroke();
      }
    }
    ctx.restore();
    // séisme choisi hors de la carte : flèche au bord, dans sa direction
    if (c && (c.lon < VUE.lon[0] || c.lon > VUE.lon[1] || c.lat < VUE.lat[0] || c.lat > VUE.lat[1])) {
      const centre = { lat: 38, lon: 15 }, { azimut, distance } = Direct.distanceAzimut(centre.lat, centre.lon, c.lat, c.lon), a = (azimut * Math.PI) / 180;
      const cx = X(centre.lon), cy = Y(centre.lat), dx = Math.sin(a), dy = -Math.cos(a);
      const k = Math.min(Math.abs((dx > 0 ? X(VUE.lon[1]) - 18 - cx : X(VUE.lon[0]) + 18 - cx) / (dx || 1e-9)), Math.abs((dy > 0 ? Y(VUE.lat[0]) - 18 - cy : Y(VUE.lat[1]) + 18 - cy) / (dy || 1e-9)));
      const px = cx + k * dx, py = cy + k * dy;
      ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.moveTo(px + 9 * dx, py + 9 * dy); ctx.lineTo(px - 7 * dy - 4 * dx, py + 7 * dx - 4 * dy); ctx.lineTo(px + 7 * dy - 4 * dx, py - 7 * dx - 4 * dy); ctx.closePath(); ctx.fill();
      texte(ctx, `M ${virg(c.mag, 1)} · ${virg(distance, 0)}° du centre`, px - 14 * dx, py - 14 * dy, COUL.ink, `800 11px ${POLICE}`, dx > 0.3 ? 'right' : dx < -0.3 ? 'left' : 'center');
    }
    // stations : triangles colorés par l'amplitude (suivies), vides sinon
    const suivies = new Set(etat.suivies.map(ident));
    for (const s of etat.stations) {
      const x = X(s.lon), y = Y(s.lat), suivie = suivies.has(ident(s)), m = etat.mesures.get(ident(s)), lat = Direct.latence(m ? m.fin : null, Date.now());
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 6.5, y + 4.5); ctx.lineTo(x - 6.5, y + 4.5); ctx.closePath();
      if (suivie) { ctx.fillStyle = m && lat <= LATENCE_GRISE ? couleurAmplitude(m.amp) : '#94a3b8'; ctx.fill(); ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1.2; ctx.stroke(); }
      if (suivie && m && m.decl.some(td => Date.now() - td < 60000)) { ctx.strokeStyle = COUL.bad; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, 2 * Math.PI); ctx.stroke(); }
      if (suivie) texte(ctx, s.station, x + 8, y - 6, COUL.ink, `700 10.5px ${MONO}`);
    }
  }
  // Point à la distance d (degrés) et à l'azimut az d'un point (sphère).
  function destination(lat, lon, d, az) {
    const p1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180, dr = (d * Math.PI) / 180, a = (az * Math.PI) / 180;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(a));
    const l2 = l1 + Math.atan2(Math.sin(a) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
    return [(p2 * 180) / Math.PI, (l2 * 180) / Math.PI];
  }
  // Distance atteinte par le front d'une phase au temps t (s) : inversion de la table des temps de P ou S (ak135).
  const tablesFront = new Map();
  function distanceFront(e, phase, t) {
    const cle = `${e.id}|${phase}`;
    if (!tablesFront.has(cle)) tablesFront.set(cle, Array.from({ length: 31 }, (_, i) => { const a = Globe.arrivees(phase, Math.max(0, e.h || 10), i + 0.5); return [i + 0.5, a.length ? a[0].temps : null]; }).filter(q => q[1] !== null));
    const tb = tablesFront.get(cle);
    if (!tb.length || t < tb[0][1]) return tb.length ? (t / tb[0][1]) * tb[0][0] : 0;
    for (let i = 1; i < tb.length; i++) if (t <= tb[i][1]) return tb[i - 1][0] + ((t - tb[i - 1][1]) / (tb[i][1] - tb[i - 1][1])) * (tb[i][0] - tb[i - 1][0]);
    return 0; // au-delà de 30° : le front sort de la carte
  }

  // ── Panneaux ──────────────────────────────────────────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) { return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`; }
  function majAfficheurs() {
    const lat = etat.suivies.map(s => { const m = etat.mesures.get(ident(s)); return Direct.latence(m ? m.fin : null, Date.now()); }).filter(Number.isFinite).sort((a, b) => a - b);
    const recues = etat.suivies.filter(s => etat.voies.has(ident(s))).length;
    $('#dr-afficheurs').innerHTML = [
      afficheur('Stations reçues', `${recues} / ${etat.suivies.length}`, etat.mode === 'demo' ? 'signaux simulés' : etat.listeOk ? `${etat.stations.length} stations GEOFON dans la zone` : 'liste de GEOFON inaccessible'),
      afficheur('Latence médiane', lat.length ? depuisQuand(lat[Math.floor(lat.length / 2)] * 1000) : '—', 'depuis le dernier échantillon'),
      afficheur('Paquets reçus', String(etat.cx.paquets), etat.cx.dernier ? `dernier il y a ${depuisQuand(Date.now() - etat.cx.dernier)}` : (etat.cx.message || '&nbsp;')),
      afficheur('Heure UTC', hms(Date.now()), etat.pause ? 'traces figées (pause)' : 'traces en direct'),
    ].join('');
  }
  function majSeismes() {
    const t = Date.now();
    $('#dr-seismes').innerHTML = `<thead><tr><th>Heure (UTC)</th><th>M</th><th>Région</th><th>h</th></tr></thead><tbody>${etat.seismes.slice(0, 60).map((e, i) =>
      `<tr class="${etat.choisi && e.id === etat.choisi.id ? 'vu' : ''}" data-dr-seisme="${i}" tabindex="0"><td class="n">${new Date(e.temps).toISOString().slice(5, 16).replace('T', ' ')}<br><small style="color:var(--muted)">il y a ${depuisQuand(t - e.temps)}</small></td><td class="n">${virg(e.mag, 1)}</td><td>${e.region}</td><td class="n">${virg(e.h, 0)}</td></tr>`).join('')}</tbody>`;
    $$('[data-dr-seisme]').forEach(tr => {
      const choisir = () => { etat.choisi = etat.seismes[+tr.dataset.drSeisme]; majSeismes(); majArrivees(); dessinerTout(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    });
  }
  function majArrivees() {
    const e = etat.choisi;
    if (!e) { $('#dr-arrivees').innerHTML = '<p class="aide">Choisissez un séisme.</p>'; return; }
    const lignes = etat.suivies.map(s => {
      const { distance, azimut } = Direct.distanceAzimut(e.lat, e.lon, s.lat, s.lon), a = arriveesStation(s, e);
      const p = a.find(x => /^(P|PKIKP|PKP)$/.test(x.phase)), sS = a.find(x => x.phase === 'S'), lr = a.find(x => x.phase === 'LR');
      const h = x => (x ? hms(e.temps + x.temps * 1000) : '—');
      return `<tr><td>${s.station}</td><td class="n">${virg(distance, 1)}°</td><td class="n">${Math.round(azimut)}°</td><td class="n">${h(p)}${p && p.phase !== 'P' ? ` <small>${p.phase}</small>` : ''}</td><td class="n">${h(sS)}</td><td class="n">${h(lr)}</td></tr>`;
    }).join('');
    $('#dr-arrivees').innerHTML = `<p class="aide" style="margin:0 0 6px"><b>M ${virg(e.mag, 1)} ${e.typeMag}</b>, ${e.region}, ${hms(e.temps)} UTC, h = ${virg(e.h, 0)} km${e.id === 'demo' ? ' (fictif)' : ''}.</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Station</th><th>Δ</th><th>Az.</th><th>P</th><th>S</th><th>LR</th></tr></thead><tbody>${lignes}</tbody></table></div>
      <p class="aide">Heures UTC prévues par le modèle ak135 (P : première arrivée, PKIKP ou PKP dans la zone d'ombre ; LR : ondes de Rayleigh, période 20 s). Az. : azimut de la station vu du séisme.</p>`;
  }
  function dessinerTout() { if (!COUL.paper) lireCouleurs(); dessinerTraces(); dessinerCarte(); }
  function majTout() { dessinerTout(); majAfficheurs(); }

  // ── Interactions ──────────────────────────────────────────────────────────────────────────────────────────────
  function cliquerCarte(ev) {
    if (!geo) return;
    const r = ev.currentTarget.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const proche = (liste, f) => liste.reduce((m, o) => { const d = Math.hypot(geo.X(f(o).lon) - x, geo.Y(f(o).lat) - y); return d < m.d ? { o, d } : m; }, { o: null, d: Infinity });
    const st = proche(etat.stations, s => s);
    if (st.o && st.d < 14 && etat.mode !== 'demo') {
      const id = ident(st.o), i = etat.suivies.findIndex(s => ident(s) === id);
      if (i >= 0) etat.suivies.splice(i, 1);
      else if (etat.suivies.length >= MAX_SUIVIES) { toast(`${MAX_SUIVIES} stations au plus : retirez-en une d'abord.`); return; }
      else etat.suivies.push(st.o);
      etat.suivies.sort((a, b) => a.lon - b.lon);
      toast(`${st.o.reseau}.${st.o.station}${st.o.site ? ` (${st.o.site})` : ''} ${i >= 0 ? 'retirée' : 'ajoutée'}`);
      if (etat.mode === 'seedlink') connecterSeedLink(); else if (etat.mode === 'fdsn') interrogerFdsn();
      majArrivees(); majTout();
      return;
    }
    const se = proche(etat.seismes, e => e);
    if (se.o && se.d < 12) { etat.choisi = se.o; majSeismes(); majArrivees(); dessinerTout(); }
  }
  function brancher() {
    $('#dr-carte').addEventListener('click', cliquerCarte);
    $('#dr-carte').addEventListener('mousemove', ev => {
      if (!geo) return;
      const r = ev.currentTarget.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      const s = etat.stations.find(o => Math.hypot(geo.X(o.lon) - x, geo.Y(o.lat) - y) < 10);
      ev.currentTarget.title = s ? `${s.reseau}.${s.station}${s.site ? ` — ${s.site}` : ''} (${s.voie}, ${s.cadence} Hz)` : '';
    });
    $$('[data-dr-fenetre]').forEach(b => b.addEventListener('click', () => { etat.fenetre = +b.dataset.drFenetre; $$('[data-dr-fenetre]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); dessinerTout(); }));
    $('#dr-filtre').addEventListener('change', e => { etat.filtre = e.target.value; dessinerTout(); });
    $('#dr-pause').addEventListener('click', e => { etat.pause = etat.pause ? null : Date.now(); e.currentTarget.textContent = etat.pause ? 'Reprendre' : 'Pause'; e.currentTarget.setAttribute('aria-pressed', String(!!etat.pause)); majTout(); });
    $$('[data-dr-mode]').forEach(b => b.addEventListener('click', () => { if (b.dataset.drMode !== etat.mode) changerMode(b.dataset.drMode); }));
    $$('[data-dr-catalogue]').forEach(b => b.addEventListener('click', () => { etat.catalogue = b.dataset.drCatalogue; $$('[data-dr-catalogue]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); chargerSeismes(); }));
    $('#dr-traces').addEventListener('mousemove', ev => {
      const r = ev.currentTarget.getBoundingClientRect(), x = ev.clientX - r.left, W = r.width, t1 = maintenant(), t0 = t1 - etat.fenetre * 60000;
      $('#dr-curseur').textContent = `${hms(t0 + ((x - 10) / (W - 20)) * (t1 - t0))} UTC`;
    });
    const redessiner = () => { lireCouleurs(); dessinerTout(); };
    new ResizeObserver(() => dessinerTout()).observe($('#dr-traces'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) majTout(); });
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────────────────────────────────────────
  async function demarrer() {
    badge('Chargement des stations…', true);
    const liste = await chargerStations();
    etat.suivies = liste ? suiviesParDefaut(etat.stations) : [];
    chargerSeismes();
    if (!liste) { changerMode('demo'); toast('Liste des stations de GEOFON inaccessible : mode démonstration (signaux simulés).'); return; }
    changerMode(etat.mode === 'demo' ? 'seedlink' : etat.mode);
  }
  lireCouleurs();
  brancher();
  fetch('data/cotes-mediterranee.json').then(r => r.json()).then(j => { etat.cotes = j; dessinerCarte(); }).catch(() => { /* carte sans côtes */ });
  $('#dr-legende-carte').innerHTML = ['0,01', '0,05', '0,2', '1', '5', '≥ 10'].map((v, i) => `<span><i style="background:${['#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626'][i]}"></i>${v} µm/s</span>`).join('')
    + '<span><i style="background:#94a3b8"></i>pas de donnée</span><span><i style="background:#dc2626;border-radius:50%"></i>séisme de moins d\'une heure</span>';
  demarrer();
  setInterval(() => { if (!document.hidden) majTout(); }, 1000);
  setInterval(() => { if (etat.mode !== 'demo' && !document.hidden) chargerSeismes(); }, 120000);
})();
