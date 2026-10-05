import MiniSeed from './sismo/miniseed.js';
import Fdsn from './sismo/fdsn.js';
import Centres from './sismo/centres.js';
import Dossier from './sismo/dossier.js';
import Direct from './sismo/direct.js';
import Globe from './sismo/globe.js';
import Teleseisme from './sismo/teleseisme.js';
import Sismo from './sismo/signal.js';

// src/direct-page.js — page « En direct » : stations sismologiques autour de la Méditerranée, comme un centre de
// surveillance (SeisComP : carte scmv, traces scrttv). Stations des centres de données de src/sismo/centres.js (GEOFON,
// INGV, Epos-France, NOA, KOERI…), choisies par réseau. Chaque station suivie reçoit ses données par le relais SeedLink du
// site (functions/api/seedlink.js, temps réel) depuis le serveur de son centre, sinon celui de GEOFON, sinon par le
// service FDSN de son centre interrogé toutes les 20 s (functions/api/fdsn.js) ; sans réseau, démonstration (séisme
// fictif, signaux du générateur de téléséismes, signalée comme telle). Calculs dans src/sismo/ (miniSEED, filtres,
// STA/LTA, tampons, arrivées ak135, pays).
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  // Zone de référence de la carte (stations proposées, choix par défaut) ; la vue affichée se zoome et se déplace dans
  // le domaine des côtes, sans changer cette zone.
  const VUE = { lon: [-12, 42], lat: [28, 48.5] }, DOMAINE = { lon: [-20, 50], lat: [22, 53] };
  const carteVue = { clon: (VUE.lon[0] + VUE.lon[1]) / 2, clat: (VUE.lat[0] + VUE.lat[1]) / 2, z: 1 };
  const ZONE = { minlatitude: 25, maxlatitude: 50, minlongitude: -15, maxlongitude: 45 };
  const MAX_SUIVIES = 12, DEFAUT_SUIVIES = 8, INTERVALLE_FDSN = 20000;
  // au-delà de cette latence (s), une station est grise : le service FDSN publie avec plusieurs minutes de retard
  const viaFdsn = s => etat.mode === 'fdsn' || (etat.mode === 'seedlink' && !serveurDe(s));
  const latenceGrise = s => (viaFdsn(s) ? 900 : 180);
  const FILTRES = { aucun: null, large: [2, 0.5, 5], proche: [2, 1, 8], tele: [2, 0.5, 2], ms: [4, 1 / 22, 1 / 18], detecteur: [4, 0.7, 2] };
  // Détecteur : STA de 2 s sur LTA de 80 s, voie filtrée de 0,7 à 2 Hz (ordre 4), déclenchement au-dessus de 4, fin sous 1,5.
  const DETECTEUR = { sta: 2, lta: 80, on: 4, off: 1.5 };
  // stations fictives du mode démonstration quand la liste de GEOFON est inaccessible
  const STATIONS_DEMO = [['DEMO1', 36.8, 10.2], ['DEMO2', 41.9, 12.5], ['DEMO3', 38.0, 23.7], ['DEMO4', 41.0, 29.0], ['DEMO5', 40.4, -3.7], ['DEMO6', 35.2, 33.4]]
    .map(([s, lat, lon]) => ({ reseau: 'XX', station: s, emplacement: '', voie: 'BHZ', lat, lon, sensibilite: 6e8, cadence: 20, centre: 'démonstration', pays: null }));
  const ident = s => `${s.reseau}.${s.station}.${s.emplacement}.${s.voie}`;
  const dansVue = o => o.lon >= VUE.lon[0] && o.lon <= VUE.lon[1] && o.lat >= VUE.lat[0] && o.lat <= VUE.lat[1];
  const hms = t => new Date(t).toISOString().slice(11, 19);
  const depuisQuand = ms => { const s = Math.round(ms / 1000); return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} j`; };

  const etat = {
    mode: 'seedlink', stations: [], suivies: [], voies: new Map(), seismes: [], catalogue: 'med', choisi: null,
    fenetre: 15, filtre: 'large', pause: null, cotes: null, pays: [], demo: null, mesures: new Map(), arrivees: new Map(),
    reseaux: new Map(), actifs: null, centres: new Map(), sources: new Map(), listeOk: false, journal: [], selection: null, ev: null,
    cx: { groupes: new Map(), fdsn: 0, demo: 0, echecsFdsn: 0, paquets: 0, dernier: null, diagnostics: new Set() },
  };
  // Journal de connexion (les 8 derniers événements), affiché sous la source des données : il dit ce qui se passe quand
  // le temps réel ne vient pas.
  function journal(msg) {
    etat.journal.unshift(`${new Date().toISOString().slice(11, 19)} ${msg}`);
    etat.journal.length = Math.min(etat.journal.length, 8);
    const ul = $('#dr-journal');
    if (ul) ul.innerHTML = etat.journal.map(l => `<li>${echapper(l)}</li>`).join('');
  }
  const echapper = t => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const maintenant = () => etat.pause ?? Date.now();
  // Fenêtre des traces : sa durée (boutons 5, 15, 60 min, ou zoom) et sa fin (null : elle suit le direct). Les tampons
  // gardent 70 minutes : on ne remonte pas plus loin.
  const vueT = { duree: 15 * 60000, fin: null }, GARDE = 70 * 60000;
  let geoTraces = null;
  const fenetreTraces = () => { const t1 = vueT.fin ?? maintenant(); return { t0: t1 - vueT.duree, t1 }; };
  function bornerTraces() {
    const n = maintenant();
    vueT.duree = Math.max(20000, Math.min(GARDE, vueT.duree));
    if (vueT.fin !== null) vueT.fin = Math.max(n - GARDE + vueT.duree, vueT.fin);
    if (vueT.fin !== null && vueT.fin >= n - 1000) vueT.fin = null;
    etat.fenetre = Math.ceil(vueT.duree / 60000);
    $$('[data-dr-fenetre]').forEach(b => b.setAttribute('aria-pressed', String(vueT.fin === null && +b.dataset.drFenetre * 60000 === vueT.duree)));
    const d = $('#dr-direct');
    if (d) d.hidden = vueT.fin === null;
  }
  function zoomerTraces(f, x) {
    const { t0, t1 } = fenetreTraces(), g = geoTraces, tx = g && x !== undefined ? t0 + ((x - g.x0) / (g.x1 - g.x0)) * (t1 - t0) : t1;
    const d = Math.max(20000, Math.min(GARDE, vueT.duree / f)), r = (tx - t0) / (t1 - t0);
    vueT.duree = d; vueT.fin = tx + (1 - r) * d;
    bornerTraces(); dessinerTout();
  }
  function deplacerTraces(dx) {
    const g = geoTraces;
    if (!g) return;
    vueT.fin = fenetreTraces().t1 - (dx / (g.x1 - g.x0)) * vueT.duree;
    bornerTraces(); dessinerTout();
  }
  const delai = ms => new Promise(r => setTimeout(r, ms));
  const nomCentre = id => (Centres.CENTRES[id] ? Centres.CENTRES[id].nom : id);
  const nomServeur = sv => { const c = Centres.centreDuServeur(sv); return c ? c.nom : sv; };

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
  const api = (service, params, centre = 'geofon') => `api/fdsn?${new URLSearchParams({ centre, service, ...params })}`;
  // Requête bornée dans le temps (un centre lent ne retient pas la page).
  async function charger(url, ms) {
    const ac = new AbortController(), m = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, { signal: ac.signal }); } finally { clearTimeout(m); }
  }

  // ── Stations, réseaux et séismes (services FDSN des centres, par le relais) ──────────────────────────────────
  // réseaux affichés : GE tant que le choix n'est pas fait (stations en cours de chargement)
  const actif = code => (etat.actifs === null ? code === 'GE' : etat.actifs.has(code));
  const visibles = () => etat.stations.filter(s => actif(s.reseau) && dansVue(s));
  // Chargements des listes : d'abord le réseau GE de GEOFON (requête courte, nommée : la page démarre dessus), puis
  // chaque centre en entier, GEOFON compris pour ses autres réseaux. Sans nom de réseau, un centre parcourt tout son
  // inventaire : la réponse peut prendre une demi-minute, elle complète la liste quand elle arrive.
  const CHARGEMENTS = [
    { cle: 'geofon-ge', centre: 'geofon', nom: 'GEOFON, réseau GE', params: { network: 'GE' }, delai: 30000 },
    ...Centres.LISTE.map(c => ({ cle: c.id, centre: c.id, nom: c.id === 'geofon' ? 'GEOFON, autres réseaux' : `${c.nom} (${c.organisme})`, params: {}, delai: 60000 })),
  ];
  // Voies verticales et réseaux d'un chargement, dans la zone ; les stations gardent leur centre et leur pays.
  async function chargerCentre(ch) {
    const p = { ...ch.params, channel: 'BHZ,HHZ', format: 'text', includerestricted: 'false', ...ZONE, endafter: Fdsn.heure(Date.now()) };
    const info = { etat: 'attente', stations: 0 };
    etat.centres.set(ch.cle, info);
    // un service qui refuserait includerestricted (400) est réinterrogé sans
    const station = async level => {
      const r = await charger(api('station', { ...p, level }, ch.centre), ch.delai);
      if (r.status !== 400) return r;
      const { includerestricted, ...q } = p;
      return charger(api('station', { ...q, level }, ch.centre), ch.delai);
    };
    try {
      const [rv, rr] = await Promise.all([station('channel'), station('network').catch(() => null)]);
      if (rv.status === 204) { Object.assign(info, { etat: 'vide' }); return; }
      if (!rv.ok) throw new Error(`HTTP ${rv.status}${await rv.text().then(t => (t.trim() ? ` : ${t.trim().replace(/\s+/g, ' ').slice(0, 90)}` : ''), () => '')}`);
      const liste = Fdsn.choisirVoies(Fdsn.voies(await rv.text())).map(s => ({ ...s, centre: ch.centre, pays: Direct.pays(s.lat, s.lon, etat.pays) }));
      const noms = new Map((rr && rr.ok && rr.status !== 204 ? Fdsn.reseaux(await rr.text()) : []).map(r => [r.reseau, r.description]));
      ajouterStations(liste, noms, ch.centre);
      Object.assign(info, { etat: 'ok', stations: liste.length });
      journal(`${ch.nom} : ${liste.length} stations dans la zone`);
    } catch (err) {
      Object.assign(info, { etat: 'echec', erreur: err.name === 'AbortError' ? `pas de réponse en ${ch.delai / 1000} s` : (err.message || String(err)) });
      journal(`${ch.nom} : liste des stations inaccessible (${info.erreur})`);
    } finally { majReseaux(); dessinerCarte(); }
  }
  function ajouterStations(liste, noms, centre) {
    const avant = etat.stations.length;
    etat.stations = Centres.fusionner([etat.stations, liste]);
    for (const s of etat.stations.slice(avant)) {
      if (!etat.reseaux.has(s.reseau)) etat.reseaux.set(s.reseau, { code: s.reseau, description: noms.get(s.reseau) || '', centre, stations: [] });
      etat.reseaux.get(s.reseau).stations.push(s);
    }
    etat.listeOk = etat.stations.length > 0;
  }
  // Réseaux affichés au départ : ceux de la dernière visite, sinon GE (GEOFON) et tout réseau qui a une station en
  // Tunisie ; si aucun d'eux n'a de station sur la carte (GEOFON muet, par exemple), le plus grand réseau permanent.
  function actifsParDefaut() {
    let out = null;
    try { const m = JSON.parse(localStorage.getItem('sismo-direct-reseaux')); if (Array.isArray(m) && m.length) out = new Set(m); } catch { /* stockage indisponible */ }
    if (!out) {
      out = new Set(['GE']);
      for (const r of etat.reseaux.values()) if (r.stations.some(s => s.pays && s.pays.code === 'TN')) out.add(r.code);
    }
    const sur = r => r.stations.filter(dansVue).length;
    if (![...out].some(code => etat.reseaux.has(code) && sur(etat.reseaux.get(code)))) {
      const grand = [...etat.reseaux.values()].filter(r => !Centres.temporaire(r.code) && sur(r)).sort((a, b) => sur(b) - sur(a))[0];
      if (grand) out.add(grand.code);
    }
    return out;
  }
  function memoriserActifs() { try { localStorage.setItem('sismo-direct-reseaux', JSON.stringify([...etat.actifs])); } catch { /* stockage indisponible */ } }
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
  function suiviesParDefaut(liste, nombre = DEFAUT_SUIVIES, deja = []) {
    if (!liste.length) return [];
    const d = (a, b) => Direct.distanceAzimut(a.lat, a.lon, b.lat, b.lon).distance, tunis = { lat: 36.8, lon: 10.2 };
    const prises = deja.length ? deja.slice() : [liste.reduce((m, s) => (d(s, tunis) < d(m, tunis) ? s : m))];
    const n0 = deja.length;
    while (prises.length < Math.min(n0 + nombre, n0 + liste.length) && prises.length - n0 < liste.length) {
      let mieux = null, dm = -1;
      for (const s of liste) { if (prises.includes(s)) continue; const m = Math.min(...prises.map(p => d(p, s))); if (m > dm) { dm = m; mieux = s; } }
      if (!mieux) break;
      prises.push(mieux);
    }
    return (deja.length ? prises.slice(n0) : prises).sort((a, b) => a.lon - b.lon);
  }

  // ── Réception des données ─────────────────────────────────────────────────────────────────────────────────────
  function recevoir(enr) {
    if (!enr || !enr.echantillons.length) return;
    if (!etat.voies.has(enr.id)) etat.voies.set(enr.id, Direct.voie());
    etat.voies.get(enr.id).ajouter(enr);
    etat.cx.paquets++; etat.cx.dernier = Date.now();
    const src = etat.sources.get(enr.id);
    if (src) src.recu = true;
  }
  // Reprise : à partir du plus ancien des derniers échantillons reçus (sans dépasser la fenêtre ni 30 minutes).
  // Première demande : la fenêtre plus 3 minutes, pour que l'amorce des filtres tombe avant la partie affichée.
  function reprise(liste = etat.suivies) {
    const plus = Date.now() - Math.min(30, etat.fenetre + 3) * 60000, fins = liste.map(s => { const v = etat.voies.get(ident(s)); return v ? v.fin() : null; });
    return fins.some(f => f === null) ? plus : Math.max(plus, Math.min(...fins) - 2000);
  }
  // Source d'une station suivie : rang du serveur SeedLink essayé parmi ses candidats (celui de son centre, puis GEOFON) ;
  // au-delà, le service FDSN de son centre.
  function source(s) {
    const id = ident(s);
    if (!etat.sources.has(id)) etat.sources.set(id, { essai: 0, depuis: Date.now(), recu: false });
    return etat.sources.get(id);
  }
  const serveurDe = s => Centres.candidats(s.centre)[source(s).essai] || null;
  const parFdsn = () => (etat.mode === 'fdsn' ? etat.suivies : etat.mode === 'seedlink' ? etat.suivies.filter(s => !serveurDe(s)) : []);
  function suivant(liste, raison) {
    for (const s of liste) { const src = source(s); src.essai++; src.depuis = Date.now(); src.recu = false; }
    const vers = liste.map(s => serveurDe(s)), noms = [...new Set(vers.map(v => (v ? nomServeur(v) : 'FDSN (20 s)')))];
    journal(`${liste.map(s => `${s.reseau}.${s.station}`).join(', ')} : ${raison} → ${noms.join(', ')}`);
  }
  function fermer() {
    for (const g of etat.cx.groupes.values()) fermerGroupe(g);
    etat.cx.groupes.clear();
    clearInterval(etat.cx.fdsn); etat.cx.fdsn = 0;
    clearInterval(etat.cx.demo); etat.cx.demo = 0;
  }
  function fermerGroupe(g) {
    g.ferme = true; clearTimeout(g.minuteur); clearTimeout(g.garde);
    if (g.ws) { const w = g.ws; g.ws = null; try { w.close(); } catch { /* déjà fermé */ } }
  }
  // Une connexion au relais par serveur SeedLink ; un groupe dont les stations n'ont pas changé reste ouvert.
  function connecter() {
    if (etat.mode !== 'seedlink') return;
    const voulus = new Map();
    for (const s of etat.suivies) { const sv = serveurDe(s); if (sv) { if (!voulus.has(sv)) voulus.set(sv, []); voulus.get(sv).push(s); } }
    for (const [sv, g] of etat.cx.groupes) {
      const l = voulus.get(sv);
      if (!l || l.map(ident).join(',') !== g.cle) { fermerGroupe(g); etat.cx.groupes.delete(sv); }
    }
    for (const [sv, l] of voulus) if (!etat.cx.groupes.has(sv)) {
      const g = { serveur: sv, liste: l, cle: l.map(ident).join(','), ws: null, recu: false, echecs: 0, minuteur: 0, garde: 0, ferme: false };
      etat.cx.groupes.set(sv, g);
      ouvrirGroupe(g);
    }
    majFdsn(); majBadge();
  }
  function ouvrirGroupe(g) {
    if (g.ferme) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:', base = `${proto}//${location.host}${location.pathname.replace(/[^/]*$/, '')}`;
    const q = new URLSearchParams({ serveur: g.serveur, flux: g.liste.map(ident).join(','), depuis: new Date(reprise(g.liste)).toISOString() });
    let ws;
    try { ws = new WebSocket(`${base}api/seedlink?${q}`); } catch { basculer('fdsn', 'WebSocket indisponible : interrogation du service FDSN.'); return; }
    ws.binaryType = 'arraybuffer';
    g.ws = ws; g.recu = false;
    const ids = new Set(g.liste.map(ident)), nom = nomServeur(g.serveur);
    journal(`${nom} : connexion au relais (${g.liste.length} flux)`);
    g.garde = setTimeout(() => { if (!g.recu && g.ws === ws) ws.close(); }, 15000);
    ws.onmessage = e => {
      if (typeof e.data === 'string') {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.message) journal(`relais : ${m.message}`);
        if (m.type === 'fin') journal(`relais ${nom} : fin (${m.raison}, ${m.paquets} paquets)`);
        if (m.refusees && m.refusees.length) {
          // stations refusées par ce serveur : elles passent au suivant ; le relais continue avec les autres
          const refus = g.liste.filter(s => m.refusees.includes(`${s.reseau}.${s.station}`));
          g.liste = g.liste.filter(s => !refus.includes(s)); g.cle = g.liste.map(ident).join(',');
          suivant(refus, `refusées par ${nom}`);
          setTimeout(connecter, 0);
        }
        return;
      }
      const enr = MiniSeed.enregistrement(e.data);
      if (!enr || !ids.has(enr.id)) return;
      if (!g.recu) { g.recu = true; g.echecs = 0; journal(`${nom} : premier paquet reçu`); majBadge(); }
      recevoir(enr);
    };
    ws.onclose = ev => {
      clearTimeout(g.garde);
      if (g.ws !== ws || g.ferme) return;
      g.ws = null;
      journal(`${nom} : relais fermé (code ${ev.code}${ev.reason ? `, ${ev.reason}` : ''})${g.recu ? '' : ', aucun paquet'}`);
      if (!g.liste.length) { etat.cx.groupes.delete(g.serveur); return; }
      if (!g.recu) g.echecs++;
      // fermeture normale (10 minutes) : reconnexion immédiate ; deux échecs de suite : les stations passent au serveur
      // suivant (ou au service FDSN) et le diagnostic du serveur s'inscrit au journal
      if (g.echecs >= 2) {
        fermerGroupe(g); etat.cx.groupes.delete(g.serveur);
        suivant(g.liste, `${nom} ne livre rien`);
        diagnostiquer(g.serveur, g.liste[0]);
        connecter();
      } else g.minuteur = setTimeout(() => ouvrirGroupe(g), g.recu ? 500 : 3000);
      majBadge();
    };
  }
  // Station acceptée mais muette : 60 s après son arrivée sur un serveur qui livre les autres, elle passe au suivant.
  function surveiller() {
    if (etat.mode !== 'seedlink') return;
    const muettes = [];
    for (const g of etat.cx.groupes.values()) {
      if (!g.recu) continue;
      for (const s of g.liste) { const src = source(s); if (!src.recu && Date.now() - src.depuis > 60000) muettes.push(s); }
    }
    if (muettes.length) { suivant(muettes, 'aucune donnée en 60 s'); connecter(); }
  }
  function majBadge() {
    if (etat.mode === 'demo') return;
    const fd = parFdsn().length, tr = etat.mode === 'seedlink' ? [...etat.cx.groupes.values()].filter(g => g.recu).reduce((n, g) => n + g.liste.length, 0) : 0;
    if (!etat.suivies.length) badge('Aucune station suivie');
    else if (tr) badge(`Temps réel · ${tr} stations${fd ? ` · ${fd} toutes les 20 s` : ''}`);
    else if (fd && etat.cx.fdsn && etat.cx.echecsFdsn === 0 && etat.voies.size) badge(`Toutes les 20 s · ${fd} stations`);
    else badge(etat.mode === 'fdsn' ? 'Interrogation FDSN…' : 'Connexion SeedLink…', true);
  }
  // Diagnostic d'un serveur SeedLink (une fois par serveur et par page) : chaque étape de l'échange, dans le journal.
  async function diagnostiquer(serveur, s) {
    if (etat.cx.diagnostics.has(serveur) || !s) return;
    etat.cx.diagnostics.add(serveur);
    journal(`diagnostic de ${serveur} en cours (jusqu'à 30 s)…`);
    try {
      const r = await fetch(`api/seedlink?${new URLSearchParams({ diagnostic: 1, serveur, flux: ident(s) })}`), d = await r.json();
      for (const e of d.essais) journal(`diagnostic ${e.serveur} : ${e.etapes.join(' ; ') || '—'}${e.erreur ? ` ; erreur : ${e.erreur}` : ''}${e.paquet ? ` ; paquet ${e.paquet.id} du ${e.paquet.debut}` : ''}`);
    } catch (err) { journal(`diagnostic impossible : ${err.message || err}`); }
  }
  // Stations servies par le service FDSN de leur centre (toutes en mode « Toutes les 20 s », sinon celles qu'aucun
  // serveur SeedLink ne livre) : une requête dataselect par centre toutes les 20 s.
  function majFdsn() {
    const besoin = parFdsn().length > 0;
    if (besoin && !etat.cx.fdsn) { interrogerFdsn(); etat.cx.fdsn = setInterval(interrogerFdsn, INTERVALLE_FDSN); }
    else if (!besoin && etat.cx.fdsn) { clearInterval(etat.cx.fdsn); etat.cx.fdsn = 0; }
  }
  async function interrogerFdsn() {
    const liste = parFdsn();
    if (!liste.length) return;
    const parCentre = new Map();
    for (const s of liste) { if (!parCentre.has(s.centre)) parCentre.set(s.centre, []); parCentre.get(s.centre).push(s); }
    let echec = 0;
    await Promise.all([...parCentre].map(async ([centre, l]) => {
      const fin = Date.now(), debut = reprise(l), uniq = f => [...new Set(l.map(f))].join(',');
      try {
        const r = await fetch(api('dataselect', { network: uniq(s => s.reseau), station: uniq(s => s.station), channel: uniq(s => s.voie), starttime: Fdsn.heure(debut), endtime: Fdsn.heure(fin) }, centre));
        if (r.status === 204) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ids = new Set(l.map(ident)), enr = MiniSeed.lire(await r.arrayBuffer());
        for (const e of enr) if (ids.has(e.id)) recevoir(e);
      } catch (err) { echec++; journal(`FDSN ${nomCentre(centre)} : échec (${err.message || err})`); }
    }));
    etat.cx.echecsFdsn = echec ? etat.cx.echecsFdsn + 1 : 0;
    if (etat.mode === 'fdsn' && etat.cx.echecsFdsn >= 2 && !etat.voies.size) basculer('demo', 'Centres de données injoignables : mode démonstration (signaux simulés).');
    majBadge();
  }
  function basculer(mode, message) {
    if (message) toast(message);
    changerMode(mode);
  }
  function changerMode(m) {
    fermer();
    etat.mode = m; etat.cx.echecsFdsn = 0;
    for (const src of etat.sources.values()) { src.essai = 0; src.depuis = Date.now(); src.recu = false; }
    $$('[data-dr-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.drMode === m)));
    $('#dr-mode-aide').textContent = {
      seedlink: 'Chaque station reçoit ses paquets SeedLink par le relais du site, depuis le serveur de son centre ou celui de GEOFON : quelques secondes à une minute de retard. Une station qu\'aucun serveur ne livre passe par le service FDSN de son centre.',
      fdsn: 'Le site interroge le service FDSN du centre de chaque station toutes les 20 s : plus robuste qu\'une connexion ouverte, mais une à quelques minutes de retard.',
      demo: 'Démonstration : séisme fictif et signaux simulés par le générateur de téléséismes du cours. Aucune donnée réelle n\'est affichée.',
    }[m];
    if (m !== 'demo' && etat.demo) { etat.demo = null; etat.voies.clear(); etat.seismes = []; etat.choisi = null; demarrer(); return; }
    if (m === 'seedlink') connecter();
    else if (m === 'fdsn') { majFdsn(); majBadge(); }
    else preparerDemo();
    majTout();
  }

  // ── Démonstration : séisme fictif, signaux simulés à chaque station ───────────────────────────────────────────
  async function preparerDemo() {
    badge('Préparation de la démonstration…', true);
    if (!etat.suivies.length || !etat.listeOk) { etat.stations = STATIONS_DEMO; etat.suivies = STATIONS_DEMO.slice(); etat.actifs = new Set(['XX']); }
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
    clearInterval(etat.cx.demo);
    etat.cx.demo = setInterval(pousserDemo, 1000);
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
    const fs = e.cadence, brut = Direct.preparer(e.donnees, 1e6 / s.sensibilite, Math.round(20 * fs));
    const large = Direct.filtrer(brut, sos('large', fs)), aff = f ? (etat.filtre === 'large' ? large : Direct.filtrer(brut, sos(etat.filtre, fs))) : brut;
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
    const { t0, t1 } = fenetreTraces(), X = t => g.x0 + ((t - t0) / (t1 - t0)) * (g.x1 - g.x0), hR = (g.y1 - g.y0) / n;
    geoTraces = { x0: g.x0, x1: g.x1, t0, t1 };
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
      const nom = `${s.reseau}.${s.station} ${s.voie}${dist !== null ? ` · Δ ${virg(dist, 1)}°` : ''}`;
      texte(ctx, nom, g.x0 + 4, yc - hR / 2 + 9, COUL.ink, `700 11.5px ${MONO}`);
      // à droite : maximum, latence et source, raccourcis s'ils empiètent sur le nom (téléphone)
      const par = etat.mode === 'seedlink' && viaFdsn(s) ? ' · FDSN' : '', la = `latence ${Number.isFinite(lat) ? depuisQuand(lat * 1000) : '—'}${par}`;
      ctx.font = `700 11.5px ${MONO}`;
      const place = g.x1 - g.x0 - 18 - ctx.measureText(nom).width;
      ctx.font = `10.5px ${MONO}`;
      const droite = (mes ? [`max ${virg(max, max < 1 ? 3 : 1)} µm/s · ${la}`, la, la.replace('latence ', '')] : [`en attente de données${par}`, `en attente${par}`]).find(t => ctx.measureText(t).width <= place) || '';
      texte(ctx, droite, g.x1 - 4, yc - hR / 2 + 9, lat > latenceGrise(s) ? COUL.bad : COUL.muted, `10.5px ${MONO}`, 'right');
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
  // Projection équirectangulaire (longitudes réduites par le cosinus de la latitude moyenne de la zone), centrée sur la
  // vue ; le canvas garde la hauteur de la zone de référence. cadre : longitudes et latitudes visibles.
  function projection(W) {
    const latc = (VUE.lat[0] + VUE.lat[1]) / 2, kx = Math.cos((latc * Math.PI) / 180), larg = (VUE.lon[1] - VUE.lon[0]) * kx, haut = VUE.lat[1] - VUE.lat[0];
    const H = Math.min(window.innerHeight * 0.7, (W * haut) / larg), s = Math.min((W - 20) / larg, (H - 20) / haut) * carteVue.z;
    const X = lon => W / 2 + (lon - carteVue.clon) * kx * s, Y = lat => H / 2 - (lat - carteVue.clat) * s;
    const lon = x => carteVue.clon + (x - W / 2) / (kx * s), lat = y => carteVue.clat - (y - H / 2) / s;
    return { W, H, X, Y, lon, lat, kx, s, cadre: { lon: [lon(10), lon(W - 10)], lat: [lat(H - 10), lat(10)] } };
  }
  // Zoom (facteur f autour du point x, y du canvas) et déplacement (dx, dy en pixels), bornés au domaine des côtes.
  function bornerCarte(pr) {
    carteVue.z = Math.max(1, Math.min(16, carteVue.z));
    const demiL = (pr.W / 2 - 10) / (pr.kx * pr.s), demiH = (pr.H / 2 - 10) / pr.s;
    const borne = (c, a, b, d) => (b - a <= 2 * d ? (a + b) / 2 : Math.max(a + d, Math.min(b - d, c)));
    carteVue.clon = borne(carteVue.clon, DOMAINE.lon[0], DOMAINE.lon[1], demiL);
    carteVue.clat = borne(carteVue.clat, DOMAINE.lat[0], DOMAINE.lat[1], demiH);
  }
  function zoomerCarte(f, x, y) {
    if (!geo) return;
    const lon = geo.lon(x), lat = geo.lat(y), z = Math.max(1, Math.min(16, carteVue.z * f)), k = carteVue.z / z;
    carteVue.clon = lon + (carteVue.clon - lon) * k; carteVue.clat = lat + (carteVue.clat - lat) * k; carteVue.z = z;
    bornerCarte(projection(geo.W)); dessinerCarte();
  }
  function deplacerCarte(dx, dy) {
    if (!geo) return;
    carteVue.clon -= dx / (geo.kx * geo.s); carteVue.clat += dy / geo.s;
    bornerCarte(projection(geo.W)); dessinerCarte();
  }
  function vueEnsemble() { carteVue.clon = (VUE.lon[0] + VUE.lon[1]) / 2; carteVue.clat = (VUE.lat[0] + VUE.lat[1]) / 2; carteVue.z = 1; dessinerCarte(); }

  const couleurAmplitude = a => {
    // échelle logarithmique de 0,01 à 10 µm/s, du bleu au rouge (comme les couleurs de mouvement du sol de scmv)
    const pal = ['#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626'], k = Math.max(0, Math.min(5, Math.floor((Math.log10(Math.max(a, 1e-3)) + 2) * (5 / 3))));
    return pal[k];
  };
  function dessinerCarte() {
    const cv = $('#dr-carte'), W = cv.clientWidth, pr = projection(W), { ctx, H } = preparer(cv, pr.H), { X, Y } = pr, C = pr.cadre;
    geo = pr;
    const dansCadre = o => o.lon >= C.lon[0] && o.lon <= C.lon[1] && o.lat >= C.lat[0] && o.lat <= C.lat[1];
    ctx.fillStyle = COUL.soft; ctx.fillRect(10, 10, W - 20, H - 20);
    ctx.save(); ctx.beginPath(); ctx.rect(10, 10, W - 20, H - 20); ctx.clip();
    // graticule : pas selon l'étendue visible
    const pasG = C.lon[1] - C.lon[0] > 30 ? 5 : C.lon[1] - C.lon[0] > 12 ? 2 : 1;
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let lon = Math.ceil(C.lon[0] / pasG) * pasG; lon <= C.lon[1]; lon += pasG) { ctx.beginPath(); ctx.moveTo(X(lon), Y(C.lat[0])); ctx.lineTo(X(lon), Y(C.lat[1])); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.abs(lon)}°${lon < 0 ? 'O' : lon > 0 ? 'E' : ''}`, X(lon), Y(C.lat[0]) - 2); }
    for (let lat = Math.ceil(C.lat[0] / pasG) * pasG; lat <= C.lat[1]; lat += pasG) { ctx.beginPath(); ctx.moveTo(X(C.lon[0]), Y(lat)); ctx.lineTo(X(C.lon[1]), Y(lat)); ctx.stroke(); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`${lat}°N`, X(C.lon[0]) + 3, Y(lat) - 1); }
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
      if (!dansCadre(e)) continue;
      const age = t - e.temps, r = rayonSeisme(e);
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
    if (c && !dansCadre(c)) {
      const centre = { lat: carteVue.clat, lon: carteVue.clon }, { azimut, distance } = Direct.distanceAzimut(centre.lat, centre.lon, c.lat, c.lon), a = (azimut * Math.PI) / 180;
      const cx = X(centre.lon), cy = Y(centre.lat), dx = Math.sin(a), dy = -Math.cos(a);
      const k = Math.min(Math.abs((dx > 0 ? W - 28 - cx : 28 - cx) / (dx || 1e-9)), Math.abs((dy > 0 ? H - 28 - cy : 28 - cy) / (dy || 1e-9)));
      const px = cx + k * dx, py = cy + k * dy;
      ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.moveTo(px + 9 * dx, py + 9 * dy); ctx.lineTo(px - 7 * dy - 4 * dx, py + 7 * dx - 4 * dy); ctx.lineTo(px + 7 * dy - 4 * dx, py - 7 * dx - 4 * dy); ctx.closePath(); ctx.fill();
      texte(ctx, `M ${virg(c.mag, 1)} · ${virg(distance, 0)}° du centre`, px - 14 * dx, py - 14 * dy, COUL.ink, `800 11px ${POLICE}`, dx > 0.3 ? 'right' : dx < -0.3 ? 'left' : 'center');
    }
    // stations : triangles colorés par l'amplitude (suivies), vides sinon
    const suivies = new Set(etat.suivies.map(ident));
    for (const s of visibles().filter(dansCadre)) {
      const x = X(s.lon), y = Y(s.lat), suivie = suivies.has(ident(s)), m = etat.mesures.get(ident(s)), lat = Direct.latence(m ? m.fin : null, Date.now());
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 6.5, y + 4.5); ctx.lineTo(x - 6.5, y + 4.5); ctx.closePath();
      if (suivie) { ctx.fillStyle = m && lat <= latenceGrise(s) ? couleurAmplitude(m.amp) : '#94a3b8'; ctx.fill(); ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1.2; ctx.stroke(); }
      if (suivie && m && m.decl.some(td => Date.now() - td < 60000)) { ctx.strokeStyle = COUL.bad; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, 2 * Math.PI); ctx.stroke(); }
      if (suivie) texte(ctx, s.station, x + 8, y - 6, COUL.ink, `700 10.5px ${MONO}`);
    }
    // objet touché (fiche ouverte sous la carte) : double anneau
    const sel = etat.selection;
    if (sel) {
      const o = sel.objet, x = X(o.lon), y = Y(o.lat), r = sel.type === 'station' ? 13 : rayonSeisme(o) + 5;
      if (dansCadre(o)) for (const [coul, l] of [[COUL.paper, 5], [COUL.ink, 2]]) { ctx.strokeStyle = coul; ctx.lineWidth = l; ctx.beginPath(); ctx.arc(x, y - (sel.type === 'station' ? 1 : 0), r, 0, 2 * Math.PI); ctx.stroke(); }
    }
  }
  const rayonSeisme = e => 2.5 + 2.2 * Math.max(0, (e.mag ?? 3) - 2.5);
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
      afficheur('Stations reçues', `${recues} / ${etat.suivies.length}`, etat.mode === 'demo' ? 'signaux simulés' : etat.listeOk ? `${visibles().length} sur la carte, ${etat.actifs ? etat.actifs.size : 1} réseau${(etat.actifs ? etat.actifs.size : 1) > 1 ? 'x' : ''}` : 'listes des centres inaccessibles'),
      afficheur('Latence médiane', lat.length ? depuisQuand(lat[Math.floor(lat.length / 2)] * 1000) : '—', 'depuis le dernier échantillon'),
      afficheur('Paquets reçus', String(etat.cx.paquets), etat.cx.dernier ? `dernier il y a ${depuisQuand(Date.now() - etat.cx.dernier)}` : '&nbsp;'),
      afficheur('Heure UTC', hms(Date.now()), etat.pause ? 'traces figées (pause)' : 'traces en direct'),
    ].join('');
  }
  // Carte « Réseaux » : un réseau par ligne (code, description, stations sur la carte, pays principaux, centre), case à
  // cocher ; en tête, les stations en libre accès trouvées en Tunisie ; en pied, l'état de chaque centre interrogé.
  function majReseaux() {
    const div = $('#dr-reseaux');
    if (!div) return;
    const enCours = CHARGEMENTS.some(ch => !etat.centres.has(ch.cle) || etat.centres.get(ch.cle).etat === 'attente');
    const liste = [...etat.reseaux.values()].map(r => ({ ...r, vues: r.stations.filter(dansVue) })).filter(r => r.vues.length)
      .sort((a, b) => (actif(b.code) - actif(a.code)) || (Centres.temporaire(a.code) - Centres.temporaire(b.code)) || (b.vues.length - a.vues.length) || a.code.localeCompare(b.code));
    const paysDe = r => {
      const n = new Map();
      for (const s of r.vues) { const k = s.pays ? s.pays.nom : 'en mer ou petite île'; n.set(k, (n.get(k) || 0) + 1); }
      return [...n].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ') + (n.size > 3 ? '…' : '');
    };
    div.innerHTML = liste.map(r => `<label class="case"><input type="checkbox" data-dr-reseau="${echapper(r.code)}"${actif(r.code) ? ' checked' : ''}><span><b>${echapper(r.code)}</b> ${echapper(r.description || 'sans description')}${Centres.temporaire(r.code) ? ' <em>(temporaire)</em>' : ''}<small>${r.vues.length} station${r.vues.length > 1 ? 's' : ''} · ${echapper(paysDe(r))} · ${echapper(nomCentre(r.centre))}</small></span></label>`).join('')
      || `<p class="aide">${enCours ? 'Recherche des stations…' : 'Aucune station trouvée.'}</p>`;
    div.querySelectorAll('[data-dr-reseau]').forEach(cb => cb.addEventListener('change', () => basculerReseau(cb.dataset.drReseau, cb.checked)));
    // Tunisie
    const tn = etat.stations.filter(s => s.pays && s.pays.code === 'TN'), pl = n => (n > 1 ? 's' : '');
    let t;
    if (tn.length) t = `${tn.length} station${pl(tn.length)} en libre accès (${[...new Set(tn.map(s => s.reseau))].join(', ')}) : ${tn.map(s => `${s.reseau}.${s.station}`).join(', ')}.`;
    else if (enCours) t = 'recherche en cours…';
    else {
      const d = s => Direct.distanceAzimut(36.8, 10.2, s.lat, s.lon).km, proches = etat.stations.filter(s => !Centres.temporaire(s.reseau)).sort((a, b) => d(a) - d(b)).slice(0, 3);
      t = `aucune station en libre accès dans les centres interrogés : le réseau national ne diffuse pas ses données par les services FDSN.${proches.length ? ` Les plus proches de Tunis : ${proches.map(s => `${s.reseau}.${s.station} (${s.pays ? s.pays.nom : 'en mer'}, ${Math.round(d(s))} km)`).join(', ')}.` : ''}`;
    }
    $('#dr-tunisie').innerHTML = `<b>Tunisie :</b> ${echapper(t)}`;
    $('#dr-centres').innerHTML = CHARGEMENTS.map(ch => {
      const i = etat.centres.get(ch.cle) || { etat: 'attente' };
      return `<li>${echapper(ch.nom)} : ${i.etat === 'ok' ? `${i.stations} station${pl(i.stations)}` : i.etat === 'vide' ? 'aucune station dans la zone' : i.etat === 'echec' ? `inaccessible (${echapper(i.erreur)})` : 'en cours…'}</li>`;
    }).join('');
  }
  // Un réseau coché paraît sur la carte et ses deux stations les plus utiles rejoignent les traces (s'il reste de la
  // place) ; décoché, ses stations quittent la carte et les traces.
  function basculerReseau(code, on) {
    if (etat.actifs === null) etat.actifs = new Set(['GE']);
    if (on) etat.actifs.add(code); else etat.actifs.delete(code);
    memoriserActifs();
    if (etat.mode !== 'demo') {
      if (!on) { for (const s of etat.suivies) if (s.reseau === code) etat.sources.delete(ident(s)); etat.suivies = etat.suivies.filter(s => s.reseau !== code); }
      else {
        const place = MAX_SUIVIES - etat.suivies.length, r = etat.reseaux.get(code);
        const ajout = r && place > 0 ? suiviesParDefaut(r.stations.filter(dansVue), Math.min(2, place), etat.suivies) : [];
        etat.suivies = [...etat.suivies, ...ajout].sort((a, b) => a.lon - b.lon);
        if (ajout.length) toast(`${ajout.map(s => `${s.reseau}.${s.station}`).join(', ')} ajoutée${ajout.length > 1 ? 's' : ''} aux traces`);
        else if (place <= 0) toast(`${MAX_SUIVIES} stations suivies au plus : retirez-en une sur la carte pour suivre ce réseau.`);
      }
      if (etat.mode === 'seedlink') connecter(); else if (etat.mode === 'fdsn') { majFdsn(); interrogerFdsn(); }
    }
    if (!on && etat.selection && etat.selection.type === 'station' && etat.selection.objet.reseau === code) etat.selection = null;
    majReseaux(); majFiche(); majArrivees(); majTout();
  }
  function majSeismes() {
    const t = Date.now();
    $('#dr-seismes').innerHTML = `<thead><tr><th>Heure (UTC)</th><th>M</th><th>Région</th><th>h</th></tr></thead><tbody>${etat.seismes.slice(0, 60).map((e, i) =>
      `<tr class="${etat.choisi && e.id === etat.choisi.id ? 'vu' : ''}" data-dr-seisme="${i}" tabindex="0"><td class="n">${new Date(e.temps).toISOString().slice(5, 16).replace('T', ' ')}<br><small style="color:var(--muted)">il y a ${depuisQuand(t - e.temps)}</small></td><td class="n">${virg(e.mag, 1)}</td><td>${echapper(e.region)}</td><td class="n">${virg(e.h, 0)}</td></tr>`).join('')}</tbody>`;
    $$('[data-dr-seisme]').forEach(tr => {
      const prendre = () => choisir({ type: 'seisme', objet: etat.seismes[+tr.dataset.drSeisme] });
      tr.addEventListener('click', prendre);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); prendre(); } });
    });
  }
  function majArrivees() {
    const e = etat.choisi;
    if (!e) { $('#dr-arrivees').innerHTML = '<p class="aide">Choisissez un séisme.</p>'; return; }
    const lignes = etat.suivies.map(s => {
      const { distance, azimut } = Direct.distanceAzimut(e.lat, e.lon, s.lat, s.lon), a = arriveesStation(s, e);
      const p = a.find(x => /^(P|PKIKP|PKP)$/.test(x.phase)), sS = a.find(x => x.phase === 'S'), lr = a.find(x => x.phase === 'LR');
      const h = x => (x ? hms(e.temps + x.temps * 1000) : '—');
      return `<tr><td>${echapper(s.station)}</td><td class="n">${virg(distance, 1)}°</td><td class="n">${Math.round(azimut)}°</td><td class="n">${h(p)}${p && p.phase !== 'P' ? ` <small>${p.phase}</small>` : ''}</td><td class="n">${h(sS)}</td><td class="n">${h(lr)}</td></tr>`;
    }).join('');
    $('#dr-arrivees').innerHTML = `<p class="aide" style="margin:0 0 6px"><b>M ${virg(e.mag, 1)} ${echapper(e.typeMag)}</b>, ${echapper(e.region)}, ${hms(e.temps)} UTC, h = ${virg(e.h, 0)} km${e.id === 'demo' ? ' (fictif)' : ''}.</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Station</th><th>Δ</th><th>Az.</th><th>P</th><th>S</th><th>LR</th></tr></thead><tbody>${lignes}</tbody></table></div>
      <p class="aide">Heures UTC prévues par le modèle ak135 (P : première arrivée, PKIKP ou PKP dans la zone d'ombre ; LR : ondes de Rayleigh, période 20 s). Az. : azimut de la station vu du séisme.</p>`;
  }
  function dessinerTout() { if (!COUL.paper) lireCouleurs(); dessinerTraces(); dessinerCarte(); dessinerFiche(); }
  function majTout() { dessinerTout(); majAfficheurs(); }

  // ── Interactions ──────────────────────────────────────────────────────────────────────────────────────────────
  // Toucher la carte : l'objet le plus proche (station de la carte ou séisme), dans un rayon plus large au doigt ; sa
  // fiche s'ouvre sous la carte. Toucher un séisme le choisit (arrivées sur les traces, fronts sur la carte).
  function toucherCarte(x, y) {
    if (!geo) return;
    const rayon = window.matchMedia('(pointer: coarse)').matches ? 24 : 14;
    const touches = [
      ...visibles().map(o => ({ type: 'station', objet: o, d: Math.hypot(geo.X(o.lon) - x, geo.Y(o.lat) - 1 - y) })),
      ...etat.seismes.filter(dansVue).map(o => ({ type: 'seisme', objet: o, d: Math.max(0, Math.hypot(geo.X(o.lon) - x, geo.Y(o.lat) - y) - rayonSeisme(o) / 2) })),
    ].filter(c => c.d < rayon).sort((a, b) => a.d - b.d);
    choisir(touches.length ? { type: touches[0].type, objet: touches[0].objet } : null);
  }
  function choisir(sel) {
    etat.selection = sel;
    if (sel && sel.type === 'seisme') { etat.choisi = sel.objet; majSeismes(); majArrivees(); }
    majFiche(); dessinerTout();
  }
  // Suivre une station ou ne plus la suivre (12 au plus) : traces et connexions mises à jour.
  function basculerSuivi(s) {
    if (etat.mode === 'demo') { toast('Démonstration : les stations simulées sont fixées.'); return; }
    const id = ident(s), i = etat.suivies.findIndex(x => ident(x) === id);
    if (i >= 0) { etat.suivies.splice(i, 1); etat.sources.delete(id); }
    else if (etat.suivies.length >= MAX_SUIVIES) { toast(`${MAX_SUIVIES} stations suivies au plus : retirez-en une d'abord.`); return; }
    else etat.suivies.push(s);
    etat.suivies.sort((a, b) => a.lon - b.lon);
    toast(`${s.reseau}.${s.station} ${i >= 0 ? 'retirée des' : 'ajoutée aux'} traces`);
    if (etat.mode === 'seedlink') connecter(); else if (etat.mode === 'fdsn') { majFdsn(); interrogerFdsn(); }
    majFiche(); majArrivees(); majTout();
  }

  // ── Sismogrammes d'un séisme passé : archives des centres (dataselect), stations réparties en distance ────────
  async function chargerSismogrammes(e) {
    const carte = $('#dr-sismo'), cands = [...new Map([...visibles(), ...etat.suivies].map(s => [ident(s), s])).values()];
    const lignes = Direct.stationsSeisme(cands, e, 12), { debut, fin } = Direct.fenetreSeisme(e, lignes.map(l => l.distance));
    const ev = { seisme: e, debut, fin, vue: { t0: debut, t1: fin }, lignes: lignes.map(l => ({ ...l, voie: Direct.voie(3 * 3600 * 1000) })), etat: 'lecture' };
    etat.ev = ev;
    carte.hidden = false;
    $('#dr-ev-titre').textContent = `M ${virg(e.mag, 1)} · ${e.region || ''} · ${new Date(e.temps).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    $('#dr-ev-filtre').value = lignes.length && lignes[lignes.length - 1].distance > 15 ? 'tele' : 'large';
    $('#dr-ev-etat').textContent = `Lecture des archives : ${lignes.length} stations, de ${hms(debut)} à ${hms(fin)} UTC…`;
    carte.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dessinerSismogrammes();
    if (Date.now() - e.temps < 3 * 60000) $('#dr-ev-etat').textContent += ' Le séisme date de moins de 3 minutes : les archives n\'ont peut-être pas encore ses ondes.';
    const parCentre = new Map();
    for (const l of ev.lignes) { if (!parCentre.has(l.s.centre)) parCentre.set(l.s.centre, []); parCentre.get(l.s.centre).push(l); }
    let echecs = 0;
    await Promise.all([...parCentre].map(async ([centre, ls]) => {
      const uniq = f => [...new Set(ls.map(l => f(l.s)))].join(',');
      try {
        const r = await fetch(api('dataselect', { network: uniq(s => s.reseau), station: uniq(s => s.station), channel: uniq(s => s.voie), starttime: Fdsn.heure(debut), endtime: Fdsn.heure(fin) }, centre));
        if (r.status === 204) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const parId = new Map(ls.map(l => [ident(l.s), l]));
        for (const enr of MiniSeed.lire(await r.arrayBuffer())) { const l = parId.get(enr.id); if (l) l.voie.ajouter(enr); }
      } catch (err) { echecs++; journal(`archives ${nomCentre(centre)} : échec (${err.message || err})`); }
      if (etat.ev === ev) dessinerSismogrammes();
    }));
    if (etat.ev !== ev) return;
    ev.etat = 'lu';
    const avec = ev.lignes.filter(l => l.voie.fin() !== null).length;
    $('#dr-ev-etat').textContent = `${avec} station${avec > 1 ? 's' : ''} sur ${ev.lignes.length} avec des données dans les archives${echecs ? ` (${echecs} centre${echecs > 1 ? 's' : ''} injoignable${echecs > 1 ? 's' : ''})` : ''}, de ${hms(debut)} à ${hms(fin)} UTC.`;
    dessinerSismogrammes();
  }
  // Fichier du séisme pour le TP de localisation : trois composantes des stations qui ont des données, d'une minute avant
  // l'origine à cinq minutes après la S de la plus lointaine (les ondes de surface ne servent pas à localiser).
  async function exporterSeisme() {
    const ev = etat.ev;
    if (!ev || ev.etat !== 'lu') { toast('Attendez la fin de la lecture des archives.'); return; }
    const e = ev.seisme, avec = ev.lignes.filter(l => l.voie.fin() !== null);
    if (avec.length < 3) { toast('Il faut au moins trois stations avec des données pour localiser le séisme.'); return; }
    const tS = Math.max(...avec.map(l => { const a = arriveesStation(l.s, e).find(x => x.phase === 'S'); return a ? a.temps : (ev.fin - e.temps) / 1000 - 300; }));
    const debut = ev.debut, fin = Math.min(ev.fin, e.temps + (tS + 300) * 1000), bouton = $('#dr-ev-exporter');
    bouton.disabled = true;
    $('#dr-ev-etat').textContent = `Lecture des trois composantes de ${avec.length} stations…`;
    const parCentre = new Map(), enregistrements = [], recues = new Set();
    for (const l of avec) { if (!parCentre.has(l.s.centre)) parCentre.set(l.s.centre, []); parCentre.get(l.s.centre).push(l.s); }
    try {
      const meta = new Map();
      await Promise.all([...parCentre].map(async ([centre, ss]) => {
        const uniq = f => [...new Set(ss.map(f))].join(',');
        const q = { network: uniq(s => s.reseau), station: uniq(s => s.station), channel: uniq(s => `${s.voie.slice(0, 2)}?`) };
        // sensibilité et orientation de chaque composante (les horizontales ont les leurs)
        const rm = await fetch(api('station', { ...q, level: 'channel', format: 'text', starttime: Fdsn.heure(debut), endtime: Fdsn.heure(fin) }, centre)).catch(() => null);
        if (rm && rm.ok && rm.status !== 204) for (const v of Fdsn.voies(await rm.text())) if (!v.unite || /^m\/s$/i.test(v.unite)) meta.set(`${v.reseau}.${v.station}.${v.emplacement}.${v.voie}`, { sensibilite: v.sensibilite, azimut: v.azimut, pendage: v.pendage });
        const r = await fetch(api('dataselect', { ...q, starttime: Fdsn.heure(debut), endtime: Fdsn.heure(fin) }, centre));
        if (r.status === 204) return;
        if (!r.ok) throw new Error(`${nomCentre(centre)} : HTTP ${r.status}`);
        const voulues = new Map(ss.map(s => [`${s.reseau}.${s.station}.${s.emplacement}`, s.voie.slice(0, 2)]));
        for (const enr of MiniSeed.lire(await r.arrayBuffer())) {
          const cle = `${enr.reseau}.${enr.station}.${enr.emplacement}`;
          if (voulues.get(cle) === enr.voie.slice(0, 2)) { enregistrements.push(enr.brut.slice()); recues.add(cle); }
        }
      }));
      const stations = avec.map(l => l.s).filter(s => recues.has(`${s.reseau}.${s.station}.${s.emplacement}`)).map(s => {
        const composantes = {};
        for (const [cle, m] of meta) if (cle.startsWith(`${s.reseau}.${s.station}.${s.emplacement}.${s.voie.slice(0, 2)}`)) composantes[cle.split('.')[3]] = m;
        return Object.keys(composantes).length ? { ...s, composantes } : s;
      });
      if (stations.length < 3) throw new Error('moins de trois stations reçues');
      const texte = Dossier.ecrire({ seisme: { ...e, catalogue: 'GEOFON' }, debut, fin, stations, enregistrements });
      const nom = `seisme-${new Date(e.temps).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}-${(e.region || 'region').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40)}.json`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
      a.download = nom; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      $('#dr-ev-etat').textContent = `Fichier « ${nom} » enregistré : ${stations.length} stations, trois composantes, ${Math.round(texte.length / 1024)} Ko. Ouvrez-le dans le TP de localisation (Travaux pratiques, banc « Réseau », mode « Séisme réel »).`;
      journal(`fichier du séisme enregistré : ${nom}`);
    } catch (err) {
      $('#dr-ev-etat').textContent = `Enregistrement impossible : ${err.message || err}.`;
    } finally { bouton.disabled = false; }
  }
  let geoSismo = null;
  function zoomerSismogrammes(f, x) {
    const ev = etat.ev;
    if (!ev) return;
    const { t0, t1 } = ev.vue, g = geoSismo, tx = g && x !== undefined ? t0 + ((x - g.x0) / (g.x1 - g.x0)) * (t1 - t0) : (t0 + t1) / 2;
    const d = Math.max(5000, Math.min(ev.fin - ev.debut, (t1 - t0) / f)), r = (tx - t0) / (t1 - t0);
    let a = tx - r * d;
    a = Math.max(ev.debut, Math.min(ev.fin - d, a));
    ev.vue = { t0: a, t1: a + d }; dessinerSismogrammes();
  }
  function deplacerSismogrammes(dx) {
    const ev = etat.ev, g = geoSismo;
    if (!ev || !g) return;
    const d = ev.vue.t1 - ev.vue.t0, a = Math.max(ev.debut, Math.min(ev.fin - d, ev.vue.t0 - (dx / (g.x1 - g.x0)) * d));
    ev.vue = { t0: a, t1: a + d }; dessinerSismogrammes();
  }
  // Une trace par station, rangées par distance ; temps comptés depuis l'origine ; arrivées prévues (ak135).
  function dessinerSismogrammes() {
    const ev = etat.ev, cv = $('#dr-ev-traces');
    if (!ev || !cv || $('#dr-sismo').hidden) return;
    const n = Math.max(1, ev.lignes.length), hautRang = window.innerWidth < 760 ? 58 : 66;
    const { ctx, W, H } = preparer(cv, 30 + n * hautRang + 28), g = { x0: 10, x1: W - 10, y0: 24, y1: H - 28 }, hR = (g.y1 - g.y0) / n;
    const e = ev.seisme, { t0: v0, t1: v1 } = ev.vue, X = t => g.x0 + ((t - v0) / (v1 - v0)) * (g.x1 - g.x0), cle = $('#dr-ev-filtre').value;
    geoSismo = { x0: g.x0, x1: g.x1 };
    // graduations : minutes (ou secondes) après l'origine, sur la partie visible
    const nmax = Math.max(3, Math.min(8, Math.floor((g.x1 - g.x0) / 64))), a = (v0 - e.temps) / 1000, b = (v1 - e.temps) / 1000;
    const pas = [1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1200].find(p => (b - a) / p <= nmax) || 1800;
    ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.save(); ctx.beginPath(); ctx.rect(g.x0, 0, g.x1 - g.x0, H); ctx.clip();
    for (let ts = Math.ceil(a / pas) * pas; ts <= b; ts += pas) {
      const x = Math.round(X(e.temps + ts * 1000)) + 0.5;
      ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
      ctx.fillStyle = COUL.muted; ctx.fillText(pas < 60 ? `${ts} s` : `${virg(ts / 60, ts % 60 ? 1 : 0)} min`, x, g.y1 + 6);
    }
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(e.temps), g.y0 - 4); ctx.lineTo(X(e.temps), g.y1); ctx.stroke();
    texte(ctx, 'origine', X(e.temps) + 4, g.y0 - 12, COUL.ink, `700 10.5px ${POLICE}`);
    ctx.restore();
    ev.lignes.forEach((l, k) => {
      const yc = g.y0 + hR * (k + 0.5), s = l.s;
      if (k) { ctx.strokeStyle = COUL['grid-strong']; ctx.beginPath(); ctx.moveTo(g.x0, Math.round(g.y0 + hR * k) + 0.5); ctx.lineTo(g.x1, Math.round(g.y0 + hR * k) + 0.5); ctx.stroke(); }
      for (const a of arriveesStation(s, e)) {
        const t = e.temps + a.temps * 1000;
        if (t < v0 || t > v1 || /^(PcP|ScS)$/.test(a.phase)) continue;
        const x = X(t), coul = a.phase === 'LR' ? COUL.amp : /^[pP]/.test(a.phase) ? COUL['pick-p'] : COUL['pick-s'];
        ctx.strokeStyle = coul; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, yc - hR / 2 + 2); ctx.lineTo(x, yc + hR / 2 - 2); ctx.stroke(); ctx.setLineDash([]);
        if (/^(P|S|LR|PKIKP|PKP|SKS)$/.test(a.phase)) texte(ctx, a.phase, x + 3, yc + hR / 2 - 9, coul, `800 10px ${POLICE}`);
      }
      // filtre sur toute la fenêtre lue (pas de transitoire au bord de la partie zoomée), dessin de la partie visible
      const x = l.voie.fin() === null ? null : l.voie.extraire(ev.debut, ev.fin);
      let max = 0;
      if (x && x.donnees.length) {
        const fs = x.cadence, f = FILTRES[cle], brut = Direct.preparer(x.donnees, 1e6 / s.sensibilite, Math.round(20 * fs)), tout = f ? Direct.filtrer(brut, sos(cle, fs)) : brut;
        const i0 = Math.max(0, Math.floor(((v0 - x.t0) * fs) / 1000)), y = tout.subarray(i0, Math.min(tout.length, Math.ceil(((v1 - x.t0) * fs) / 1000) + 1)), ty0 = x.t0 + (i0 * 1000) / fs;
        for (const v of y) if (!Number.isNaN(v)) max = Math.max(max, Math.abs(v));
        const ech = (hR * 0.45) / (max || 1), parPx = Math.max(1, Math.floor(y.length / (g.x1 - g.x0)));
        ctx.save(); ctx.beginPath(); ctx.rect(g.x0, yc - hR / 2, g.x1 - g.x0, hR); ctx.clip();
        ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
        let leve = true;
        for (let i = 0; i < y.length; i += parPx) {
          let mn = Infinity, mx = -Infinity;
          for (let j = i; j < Math.min(y.length, i + parPx); j++) { const v = y[j]; if (!Number.isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
          if (mn === Infinity) { leve = true; continue; }
          const xx = X(ty0 + (i * 1000) / fs);
          if (leve) { ctx.moveTo(xx, yc - mx * ech); leve = false; } else ctx.lineTo(xx, yc - mx * ech);
          ctx.lineTo(xx, yc - mn * ech);
        }
        ctx.stroke(); ctx.restore();
      }
      texte(ctx, `${s.reseau}.${s.station} · Δ ${virg(l.distance, 1)}°`, g.x0 + 4, yc - hR / 2 + 9, COUL.ink, `700 11.5px ${MONO}`);
      texte(ctx, x ? `max ${virg(max, max < 1 ? 3 : 1)} µm/s` : ev.etat === 'lecture' ? 'lecture…' : 'pas de donnée', g.x1 - 4, yc - hR / 2 + 9, COUL.muted, `10.5px ${MONO}`, 'right');
    });
  }

  // ── Gestes : glisser (un doigt ou la souris), pincer (deux doigts), molette, double toucher ─────────────────────
  // h : { glisser(dx, dy), zoomer(f, x, y), toucher(x, y), molette: 'libre' | 'ctrl' }. Sur les traces, la molette ne
  // zoome qu'avec Ctrl (sinon elle fait défiler la page) et un glissement vertical fait défiler la page (touch-action).
  function gestes(cv, h) {
    const pts = new Map();
    let glisse = null, pince = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      pts.set(e.pointerId, pos(e));
      if (pts.size === 1) glisse = { p: pos(e), bouge: false };
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; pince = Math.hypot(a[0] - b[0], a[1] - b[1]); glisse = null; }
    });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p = pos(e), avant = pts.get(e.pointerId);
      pts.set(e.pointerId, p);
      if (pts.size >= 2 && pince) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d > 0) h.zoomer(d / pince, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pince = d;
        return;
      }
      if (!glisse) return;
      if (!glisse.bouge && Math.hypot(p[0] - glisse.p[0], p[1] - glisse.p[1]) > 6) { glisse.bouge = true; cv.classList.add('glisse'); }
      if (glisse.bouge && h.glisser) h.glisser(p[0] - avant[0], p[1] - avant[1]);
    });
    const fin = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (e.type === 'pointerup' && glisse && !glisse.bouge && !pts.size && h.toucher) h.toucher(...pos(e));
      if (pts.size < 2) pince = null;
      if (!pts.size) { glisse = null; cv.classList.remove('glisse'); }
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => {
      if (h.molette === 'ctrl' && !e.ctrlKey) return;
      e.preventDefault();
      const [x, y] = pos(e);
      h.zoomer(e.deltaY < 0 ? 1.25 : 0.8, x, y);
    }, { passive: false });
    cv.addEventListener('dblclick', e => { const [x, y] = pos(e); h.zoomer(2, x, y); });
  }

  // ── Fiche de l'objet touché ─────────────────────────────────────────────────────────────────────────────────
  const suivie = s => etat.suivies.some(x => ident(x) === ident(s));
  // D'où viennent les données d'une station suivie, et depuis quand rien n'est arrivé.
  function etatStation(s) {
    if (!suivie(s)) return 'non suivie : « Suivre cette station » l\'ajoute aux traces.';
    if (etat.mode === 'demo') return 'suivie, signaux simulés (démonstration).';
    const m = etat.mesures.get(ident(s)), lat = Direct.latence(m ? m.fin : null, Date.now());
    const par = viaFdsn(s) ? `par le service FDSN du centre ${nomCentre(s.centre)}, toutes les 20 s` : `en temps réel par le serveur SeedLink du centre ${nomServeur(serveurDe(s))}`;
    const n = Centres.candidats(s.centre).length + 1, rang = etat.mode === 'seedlink' ? ` (source ${Math.min(source(s).essai + 1, n)} sur ${n})` : '';
    return `suivie, ${par}${rang} ; ${Number.isFinite(lat) ? `dernier échantillon il y a ${depuisQuand(lat * 1000)}` : 'aucune donnée reçue pour l\'instant'}.`;
  }
  function majFiche() {
    const div = $('#dr-fiche'), sel = etat.selection;
    if (!div) return;
    if (!sel) { div.hidden = true; div.innerHTML = ''; return; }
    div.hidden = false;
    if (sel.type === 'station') {
      const s = sel.objet, r = etat.reseaux.get(s.reseau);
      div.innerHTML = `<p class="fiche-titre"><b>${echapper(`${s.reseau}.${s.station}`)}</b> · station sismologique · ${echapper(s.pays ? s.pays.nom : 'en mer ou petite île')}</p>
        <p class="aide">Réseau ${echapper(s.reseau)}${r && r.description ? ` (${echapper(r.description)})` : ''} · centre ${echapper(nomCentre(s.centre))} · voie ${echapper(s.voie)}, ${virg(s.cadence, 0)} Hz${s.capteur ? ` · ${echapper(s.capteur)}` : ''}</p>
        <p class="aide"><b>État :</b> <span id="dr-fiche-etat">${echapper(etatStation(s))}</span></p>
        ${suivie(s) ? '<canvas id="dr-fiche-trace" aria-label="Trace de la station, sur la fenêtre des traces"></canvas>' : ''}
        <div class="fiche-actions">${etat.mode === 'demo' ? '' : `<button type="button" class="bouton primaire" id="dr-fiche-suivre">${suivie(s) ? 'Ne plus suivre' : 'Suivre cette station'}</button>`}
        ${suivie(s) ? '<button type="button" class="bouton" id="dr-fiche-traces">Voir toutes les traces</button>' : ''}</div>`;
      const b = $('#dr-fiche-suivre');
      if (b) b.addEventListener('click', () => basculerSuivi(s));
    } else {
      const e = sel.objet, t = Date.now();
      const d = etat.suivies.map(s => ({ s, d: Direct.distanceAzimut(e.lat, e.lon, s.lat, s.lon).distance })).sort((a, b) => a.d - b.d).slice(0, 3);
      div.innerHTML = `<p class="fiche-titre"><b>Séisme M ${virg(e.mag, 1)}${e.typeMag ? ` ${echapper(e.typeMag)}` : ''}</b> · ${echapper(e.region || 'région inconnue')}</p>
        <p class="aide">${new Date(e.temps).toISOString().slice(0, 19).replace('T', ' à ')} UTC (il y a ${depuisQuand(t - e.temps)}) · profondeur ${virg(e.h, 0)} km · ${virg(e.lat, 2)}° N, ${virg(e.lon, 2)}° E${e.id === 'demo' ? ' · séisme fictif' : ''}</p>
        <p class="aide">${e.id === 'demo' ? 'Séisme fictif de la démonstration.' : `Séisme réel, lu dans le catalogue de GEOFON (GFZ Potsdam) : position et magnitude calculées par ce centre, identifiant ${/^gfz/.test(e.id) ? `<a href="https://geofon.gfz.de/eqinfo/event.php?id=${encodeURIComponent(e.id)}" target="_blank" rel="noopener">${echapper(e.id)}</a>` : echapper(e.id)}.`}</p>
        <p class="aide">« Sismogrammes de ce séisme » lit dans les archives des centres les enregistrements de stations réparties en distance, autour de ses arrivées prévues, même s'il date de plusieurs jours.${t - e.temps < etat.fenetre * 60000 ? ' Il est aussi assez récent pour paraître sur les traces en direct.' : ''}${d.length ? ` Stations suivies les plus proches : ${d.map(x => `${echapper(x.s.station)} à ${virg(x.d, 1)}°`).join(', ')}.` : ''}</p>
        <div class="fiche-actions">${e.id === 'demo' ? '' : '<button type="button" class="bouton primaire" id="dr-fiche-sismo">Sismogrammes de ce séisme</button>'}<button type="button" class="bouton" id="dr-fiche-traces">Traces en direct</button></div>`;
      const b = $('#dr-fiche-sismo');
      if (b) b.addEventListener('click', () => chargerSismogrammes(e));
    }
    const v = $('#dr-fiche-traces');
    if (v) v.addEventListener('click', () => $('section[aria-label="Traces en temps réel"]').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    dessinerFiche();
  }
  // Trace de la station touchée, sur la fenêtre des traces (mesure déjà faite pour les traces).
  function dessinerFiche() {
    const sel = etat.selection, cv = $('#dr-fiche-trace');
    if (!sel || sel.type !== 'station' || !cv) return;
    const span = $('#dr-fiche-etat');
    if (span) span.textContent = etatStation(sel.objet);
    const { ctx, W, H } = preparer(cv, 96), m = etat.mesures.get(ident(sel.objet)), { t0, t1 } = fenetreTraces();
    if (!m || !m.x.length) { texte(ctx, 'en attente de données', W / 2, H / 2, COUL.muted, `700 12px ${POLICE}`, 'center'); return; }
    let max = 0;
    for (const v of m.x) if (!Number.isNaN(v)) max = Math.max(max, Math.abs(v));
    const X = t => 6 + ((t - t0) / (t1 - t0)) * (W - 12), yc = H / 2 + 6, ech = (H * 0.38) / (max || 1), parPx = Math.max(1, Math.floor(m.x.length / (W - 12)));
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
    let leve = true;
    for (let i = 0; i < m.x.length; i += parPx) {
      let mn = Infinity, mx = -Infinity;
      for (let j = i; j < Math.min(m.x.length, i + parPx); j++) { const v = m.x[j]; if (!Number.isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
      if (mn === Infinity) { leve = true; continue; }
      const x = X(m.t0 + (i * 1000) / m.fs);
      if (leve) { ctx.moveTo(x, yc - mx * ech); leve = false; } else ctx.lineTo(x, yc - mx * ech);
      ctx.lineTo(x, yc - mn * ech);
    }
    ctx.stroke();
    texte(ctx, `${depuisQuand(t1 - t0)} · max ${virg(max, max < 1 ? 3 : 1)} µm/s`, 8, 10, COUL.muted, `10.5px ${MONO}`);
  }

  function brancher() {
    $('#dr-carte').addEventListener('mousemove', ev => {
      if (!geo) return;
      const r = ev.currentTarget.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      const s = visibles().find(o => Math.hypot(geo.X(o.lon) - x, geo.Y(o.lat) - y) < 10);
      ev.currentTarget.title = s ? `${s.reseau}.${s.station} (${s.voie}, ${s.cadence} Hz) · ${s.pays ? s.pays.nom : 'en mer'} · ${nomCentre(s.centre)}` : '';
    });
    $$('[data-dr-fenetre]').forEach(b => b.addEventListener('click', () => { vueT.duree = +b.dataset.drFenetre * 60000; vueT.fin = null; bornerTraces(); dessinerTout(); }));
    $('#dr-traces-plus').addEventListener('click', () => zoomerTraces(2));
    $('#dr-traces-moins').addEventListener('click', () => zoomerTraces(0.5));
    $('#dr-direct').addEventListener('click', () => { vueT.fin = null; bornerTraces(); dessinerTout(); });
    gestes($('#dr-traces'), { molette: 'ctrl', glisser: dx => deplacerTraces(dx), zoomer: (f, x) => zoomerTraces(f, x) });
    // carte : pincer, molette, double toucher, glisser ; un toucher bref ouvre la fiche
    gestes($('#dr-carte'), { molette: 'libre', glisser: (dx, dy) => deplacerCarte(dx, dy), zoomer: (f, x, y) => zoomerCarte(f, x, y), toucher: (x, y) => toucherCarte(x, y) });
    $('#dr-carte-plus').addEventListener('click', () => geo && zoomerCarte(2, geo.W / 2, geo.H / 2));
    $('#dr-carte-moins').addEventListener('click', () => geo && zoomerCarte(0.5, geo.W / 2, geo.H / 2));
    $('#dr-carte-tout').addEventListener('click', vueEnsemble);
    // sismogrammes d'un séisme : mêmes gestes, dans la fenêtre lue
    gestes($('#dr-ev-traces'), { molette: 'ctrl', glisser: dx => deplacerSismogrammes(dx), zoomer: (f, x) => zoomerSismogrammes(f, x) });
    $('#dr-ev-plus').addEventListener('click', () => zoomerSismogrammes(2));
    $('#dr-ev-moins').addEventListener('click', () => zoomerSismogrammes(0.5));
    $('#dr-ev-tout').addEventListener('click', () => { if (etat.ev) { etat.ev.vue = { t0: etat.ev.debut, t1: etat.ev.fin }; dessinerSismogrammes(); } });
    $('#dr-filtre').addEventListener('change', e => { etat.filtre = e.target.value; dessinerTout(); });
    $('#dr-pause').addEventListener('click', e => { etat.pause = etat.pause ? null : Date.now(); e.currentTarget.textContent = etat.pause ? 'Reprendre' : 'Pause'; e.currentTarget.setAttribute('aria-pressed', String(!!etat.pause)); majTout(); });
    $$('[data-dr-mode]').forEach(b => b.addEventListener('click', () => { if (b.dataset.drMode !== etat.mode) changerMode(b.dataset.drMode); }));
    $('#dr-ev-filtre').addEventListener('change', () => dessinerSismogrammes());
    $('#dr-ev-exporter').addEventListener('click', exporterSeisme);
    $('#dr-ev-fermer').addEventListener('click', () => { etat.ev = null; $('#dr-sismo').hidden = true; });
    new ResizeObserver(() => dessinerSismogrammes()).observe($('#dr-sismo'));
    $$('[data-dr-catalogue]').forEach(b => b.addEventListener('click', () => { etat.catalogue = b.dataset.drCatalogue; $$('[data-dr-catalogue]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); chargerSeismes(); }));
    $('#dr-traces').addEventListener('mousemove', ev => {
      const r = ev.currentTarget.getBoundingClientRect(), x = ev.clientX - r.left, W = r.width, { t0, t1 } = fenetreTraces();
      $('#dr-curseur').textContent = `${hms(t0 + ((x - 10) / (W - 20)) * (t1 - t0))} UTC`;
    });
    const redessiner = () => { lireCouleurs(); dessinerTout(); };
    new ResizeObserver(() => dessinerTout()).observe($('#dr-traces'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) majTout(); });
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────────────────────────────────────────
  // Pays (pour situer les stations), puis les stations de tous les centres en parallèle : GEOFON d'abord, les autres
  // pendant 12 s au plus (un centre plus lent ajoute ses réseaux à la liste quand il répond).
  async function demarrer() {
    badge('Chargement des stations…', true);
    if (!etat.pays.length) { try { etat.pays = (await (await fetch('data/pays-mediterranee.json')).json()).pays; } catch { /* stations sans pays */ } }
    etat.stations = []; etat.reseaux.clear(); etat.listeOk = false;
    const promesses = CHARGEMENTS.map(ch => chargerCentre(ch));
    await promesses[0];
    await Promise.race([Promise.allSettled(promesses), delai(12000)]);
    chargerSeismes();
    if (!etat.listeOk) { changerMode('demo'); toast('Listes des stations inaccessibles : mode démonstration (signaux simulés).'); return; }
    if (etat.actifs === null || (etat.actifs.size === 1 && etat.actifs.has('XX'))) etat.actifs = actifsParDefaut();
    etat.suivies = suiviesParDefaut(visibles());
    journal(`${etat.stations.length} stations de ${etat.reseaux.size} réseaux ; ${etat.suivies.length} suivies`);
    majReseaux();
    changerMode(etat.mode === 'demo' ? 'seedlink' : etat.mode);
  }
  lireCouleurs();
  brancher();
  fetch('data/cotes-mediterranee.json').then(r => r.json()).then(j => { etat.cotes = j; dessinerCarte(); }).catch(() => { /* carte sans côtes */ });
  // Légende : les symboles mêmes de la carte (triangles des stations, disques des séismes, fronts)
  const triangle = (fond, trait) => `<svg viewBox="0 0 16 14" width="15" height="13" aria-hidden="true"><path d="M8 1.5 L14.5 12.5 L1.5 12.5 Z" fill="${fond}" stroke="${trait}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const disque = (coul, r) => `<svg viewBox="0 0 ${2 * r + 2} ${2 * r + 2}" width="${2 * r + 2}" height="${2 * r + 2}" aria-hidden="true"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="${coul}" fill-opacity=".55"/></svg>`;
  const front = coul => `<svg viewBox="0 0 22 10" width="22" height="10" aria-hidden="true"><path d="M1 9 Q11 -3 21 9" fill="none" stroke="${coul}" stroke-width="2"/></svg>`;
  $('#dr-legende-carte').innerHTML = `<span class="titre-legende">Stations (triangles)</span>`
    + ['0,01', '0,05', '0,2', '1', '5', '≥ 10'].map((v, i) => `<span>${triangle(['#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626'][i], 'transparent')}${v} µm/s</span>`).join('')
    + `<span>${triangle('#94a3b8', 'transparent')}suivie, pas de donnée</span><span>${triangle('none', 'var(--muted)')}non suivie</span>`
    + `<span><svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--bad)" stroke-width="2"/></svg>déclenchement STA/LTA dans la dernière minute</span>`
    + `<span class="titre-legende">Séismes des 7 derniers jours (disques, taille selon la magnitude)</span>`
    + `<span>${disque('#dc2626', 6)}moins d'une heure</span><span>${disque('#ea580c', 6)}moins d'un jour</span><span>${disque('#ca8a04', 6)}plus ancien</span>`
    + `<span>${front('var(--pick-p)')}front P</span><span>${front('var(--pick-s)')}front S du séisme choisi</span>`;
  demarrer();
  setInterval(() => { if (!document.hidden) majTout(); }, 1000);
  setInterval(surveiller, 5000);
  setInterval(() => { if (etat.mode !== 'demo' && !document.hidden) chargerSeismes(); }, 120000);
})();
