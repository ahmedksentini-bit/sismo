import Zones from './sismo/zones.js';

// src/zones-reel.js — modèle de zones sismogènes partagé entre le banc « sismicité » (qui le trace sur un catalogue réel)
// et le banc « aléa » (qui en calcule l'aléa) : dernier modèle publié, validé par Zones.lire, et sa version ; un banc qui
// s'ouvre le reprend si la version a changé depuis sa dernière lecture. Sans accès au DOM.
const ZonesReel = (() => {
  'use strict';
  let courant = null, version = 0;
  // Publie un modèle { source, site, zones } (format « sismo-zones ») ; lève une erreur lisible s'il n'est pas valable.
  function publier(modele) { courant = Zones.lire(modele); return ++version; }
  return { publier, courant: () => courant, version: () => version };
})();
export default ZonesReel;
