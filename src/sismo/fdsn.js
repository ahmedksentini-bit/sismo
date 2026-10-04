// src/sismo/fdsn.js — services web FDSN (station, dataselect, event) d'un centre de données (GEOFON) : validation des
// requêtes transmises par le relais (functions/api/geofon.js : paramètres autorisés, durée et nombre de stations
// bornés), lecture des réponses au format texte (stations et voies avec leur sensibilité, séismes), choix d'une voie
// verticale par station. Solveurs purs, sans accès au DOM ni au réseau.
const Fdsn = (() => {
  'use strict';
  const CHEMINS = { station: '/fdsnws/station/1/query', dataselect: '/fdsnws/dataselect/1/query', event: '/fdsnws/event/1/query' };
  const PERMIS = {
    station: ['network', 'station', 'location', 'channel', 'level', 'format', 'minlatitude', 'maxlatitude', 'minlongitude', 'maxlongitude', 'starttime', 'endtime', 'startafter', 'endafter', 'includerestricted'],
    dataselect: ['network', 'station', 'location', 'channel', 'starttime', 'endtime', 'nodata'],
    event: ['starttime', 'endtime', 'minlatitude', 'maxlatitude', 'minlongitude', 'maxlongitude', 'minmagnitude', 'maxmagnitude', 'mindepth', 'maxdepth', 'orderby', 'limit', 'format', 'eventid'],
  };
  const VALEUR = /^[A-Za-z0-9.,:*?\-_]{1,300}$/;
  const DUREE_MAX = 2 * 3600 * 1000, STATIONS_MAX = 12;

  // Requête transmise au centre de données : { chemin, params } ou { erreur }.
  function requete(service, entree) {
    if (!CHEMINS[service]) return { erreur: 'service inconnu' };
    const params = {};
    for (const [k, v] of Object.entries(entree)) {
      if (k === 'service') continue;
      if (!PERMIS[service].includes(k)) return { erreur: `paramètre refusé : ${k}` };
      if (!VALEUR.test(String(v))) return { erreur: `valeur refusée : ${k}` };
      params[k] = String(v);
    }
    if (service === 'dataselect') {
      for (const k of ['network', 'station', 'channel', 'starttime', 'endtime']) if (!params[k]) return { erreur: `paramètre manquant : ${k}` };
      const d = Date.parse(params.endtime + (/[zZ]$/.test(params.endtime) ? '' : 'Z')) - Date.parse(params.starttime + (/[zZ]$/.test(params.starttime) ? '' : 'Z'));
      if (!(d > 0 && d <= DUREE_MAX)) return { erreur: 'durée hors de 0 à 2 h' };
      if (params.station.split(',').length > STATIONS_MAX || /[*?]/.test(params.station + params.network)) return { erreur: 'trop de stations' };
    }
    if (service === 'event' && params.limit && !(+params.limit > 0 && +params.limit <= 500)) return { erreur: 'limite hors de 1 à 500' };
    if (service !== 'dataselect' && params.format && params.format !== 'text') return { erreur: 'format texte seulement' };
    return { chemin: CHEMINS[service], params };
  }

  // Tableau du format texte FDSN : première ligne « #Col1 | Col2 | … », puis une ligne par objet, champs séparés par « | ».
  function tableau(texte) {
    const lignes = String(texte).split(/\r?\n/).filter(l => l.trim());
    if (!lignes.length || !lignes[0].startsWith('#')) return [];
    const noms = lignes[0].slice(1).split('|').map(s => s.trim().toLowerCase());
    return lignes.slice(1).filter(l => !l.startsWith('#')).map(l => { const c = l.split('|'); const o = {}; noms.forEach((n, i) => { o[n] = (c[i] ?? '').trim(); }); return o; });
  }
  const iso = s => (s ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z') : null);

  // Voies (level=channel) : identifiant, position, capteur, sensibilité (coups par unité, à la fréquence donnée), cadence.
  function voies(texte) {
    return tableau(texte).map(o => ({
      reseau: o.network, station: o.station, emplacement: o.location, voie: o.channel,
      lat: +o.latitude, lon: +o.longitude, altitude: +o.elevation, capteur: o.sensordescription || '',
      sensibilite: +o.scale, frequenceSensibilite: +o.scalefreq, unite: o.scaleunits || '', cadence: +o.samplerate,
      debut: iso(o.starttime), fin: o.endtime ? iso(o.endtime) : null,
    })).filter(v => v.reseau && v.station && Number.isFinite(v.lat) && Number.isFinite(v.lon));
  }
  // Stations (level=station) : code, position, nom du site.
  function stations(texte) {
    return tableau(texte).map(o => ({ reseau: o.network, station: o.station, lat: +o.latitude, lon: +o.longitude, altitude: +o.elevation, site: o.sitename || '' }))
      .filter(s => s.reseau && s.station && Number.isFinite(s.lat));
  }
  // Une voie verticale par station, ouverte à l'instant donné : large bande à 20 Hz (BHZ) de préférence, puis HHZ ;
  // emplacement vide, puis « 00 » ; sensibilité en m/s connue.
  function choisirVoies(liste, maintenant = Date.now()) {
    const rang = v => (v.voie === 'BHZ' ? 0 : v.voie === 'HHZ' ? 1 : 2) * 10 + (v.emplacement === '' ? 0 : v.emplacement === '00' ? 1 : 2);
    const parStation = new Map();
    for (const v of liste) {
      if (!/Z$/.test(v.voie) || (v.fin !== null && v.fin < maintenant) || !(v.sensibilite > 0)) continue;
      if (v.unite && !/^m\/s$/i.test(v.unite)) continue;
      const cle = `${v.reseau}.${v.station}`, ancien = parStation.get(cle);
      if (!ancien || rang(v) < rang(ancien)) parStation.set(cle, v);
    }
    return [...parStation.values()].sort((a, b) => a.station.localeCompare(b.station));
  }
  // Séismes (format texte) : identifiant, heure (ms), position, profondeur, magnitude et son type, région.
  function evenements(texte) {
    return tableau(texte).map(o => ({
      id: o.eventid, temps: iso(o.time), lat: +o.latitude, lon: +o.longitude, h: +o['depth/km'],
      mag: o.magnitude === '' ? null : +o.magnitude, typeMag: o.magtype || '', region: o.eventlocationname || '', auteur: o.author || '',
    })).filter(e => e.id && Number.isFinite(e.temps) && Number.isFinite(e.lat));
  }
  // Heure au format des requêtes FDSN (UTC, à la seconde, sans « Z »).
  const heure = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().slice(0, 19);

  return { CHEMINS, PERMIS, DUREE_MAX, STATIONS_MAX, requete, tableau, voies, stations, choisirVoies, evenements, heure };
})();
export default Fdsn;
