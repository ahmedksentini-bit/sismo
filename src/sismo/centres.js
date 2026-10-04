// src/sismo/centres.js — centres de données dont la page « En direct » montre les stations : service web FDSN (station,
// dataselect) et serveur SeedLink de chacun. C'est aussi la liste blanche des deux relais du site (functions/api/fdsn.js,
// functions/api/seedlink.js) : aucun autre hôte n'est joignable par eux. Choix d'un serveur temps réel par station,
// fusion des listes de stations, réseaux temporaires. Solveurs purs, sans accès au DOM ni au réseau.
const Centres = (() => {
  'use strict';
  const GEOFON = 'geofon.gfz.de:18000';
  // Serveurs SeedLink : GEOFON vérifié (relais en service) ; Résif et EarthScope tels que les cite la documentation
  // d'ObsPy ; pour les autres, l'hôte du service FDSN au port 18000, supposé (verifie: false) et confirmé ou non par la
  // sonde du relais (api/seedlink?sonde=1). Une station essaie le serveur de son centre, puis GEOFON, qui redistribue
  // beaucoup de réseaux partenaires, puis le service FDSN de son centre toutes les 20 s.
  const LISTE = [
    { id: 'geofon', nom: 'GEOFON', organisme: 'GFZ, Potsdam', fdsn: 'https://geofon.gfz.de', seedlink: [GEOFON], verifie: true },
    { id: 'ingv', nom: 'INGV', organisme: 'Rome', fdsn: 'https://webservices.ingv.it', seedlink: ['webservices.ingv.it:18000'], verifie: false },
    { id: 'resif', nom: 'Epos-France', organisme: 'Résif, Grenoble', fdsn: 'https://ws.resif.fr', seedlink: ['rtserve.resif.fr:18000'], verifie: true },
    { id: 'noa', nom: 'NOA', organisme: 'Athènes', fdsn: 'https://eida.gein.noa.gr', seedlink: ['eida.gein.noa.gr:18000'], verifie: false },
    { id: 'koeri', nom: 'KOERI', organisme: 'Istanbul', fdsn: 'https://eida.koeri.boun.edu.tr', seedlink: ['eida.koeri.boun.edu.tr:18000'], verifie: false },
    { id: 'eth', nom: 'SED', organisme: 'ETH Zurich', fdsn: 'https://eida.ethz.ch', seedlink: ['eida.ethz.ch:18000'], verifie: false },
    { id: 'niep', nom: 'NIEP', organisme: 'Bucarest', fdsn: 'https://eida-sc3.infp.ro', seedlink: ['eida-sc3.infp.ro:18000'], verifie: false },
    { id: 'orfeus', nom: 'ORFEUS', organisme: 'De Bilt', fdsn: 'https://www.orfeus-eu.org', seedlink: ['www.orfeus-eu.org:18000'], verifie: false },
    { id: 'ign', nom: 'IGN', organisme: 'Madrid', fdsn: 'https://fdsnws.sismologia.ign.es', seedlink: ['fdsnws.sismologia.ign.es:18000'], verifie: false },
    { id: 'icgc', nom: 'ICGC', organisme: 'Barcelone', fdsn: 'https://ws.icgc.cat', seedlink: ['ws.icgc.cat:18000'], verifie: false },
    { id: 'earthscope', nom: 'EarthScope', organisme: 'États-Unis', fdsn: 'https://service.earthscope.org', seedlink: ['rtserve.earthscope.org:18000'], verifie: true },
  ];
  const CENTRES = Object.fromEntries(LISTE.map(c => [c.id, c]));
  const SEEDLINK = [...new Set(LISTE.flatMap(c => c.seedlink))];

  const permis = id => Object.prototype.hasOwnProperty.call(CENTRES, id);
  const serveurPermis = adresse => SEEDLINK.includes(adresse);
  // Serveurs SeedLink à essayer, dans l'ordre, pour une station d'un centre : le sien, puis GEOFON.
  const candidats = id => [...new Set([...(permis(id) ? CENTRES[id].seedlink : []), GEOFON])];
  // Centre d'un serveur SeedLink (le premier qui le déclare).
  const centreDuServeur = adresse => (LISTE.find(c => c.seedlink.includes(adresse)) || null);

  // Réseau temporaire (convention de la FDSN : code commençant par X, Y, Z ou un chiffre) : campagnes de quelques
  // années, souvent sans flux temps réel ; la page ne les propose pas.
  const temporaire = code => /^[XYZ0-9]/.test(String(code));

  // Fusion des stations de plusieurs centres, dans l'ordre de priorité des listes : une station (réseau.station) déjà
  // fournie par un centre précédent est ignorée (EarthScope, par exemple, garde des copies de réseaux européens).
  function fusionner(listes) {
    const vues = new Set(), out = [];
    for (const liste of listes) for (const s of liste) {
      const cle = `${s.reseau}.${s.station}`;
      if (vues.has(cle)) continue;
      vues.add(cle); out.push(s);
    }
    return out;
  }

  return { GEOFON, LISTE, CENTRES, SEEDLINK, permis, serveurPermis, candidats, centreDuServeur, temporaire, fusionner };
})();
export default Centres;
