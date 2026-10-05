// tools/failles/gem.mjs — extrait méditerranéen de la base GEM des failles actives (GEM Global Active Faults Database,
// version harmonisée) pour le banc « aléa » : data/failles-mediterranee.json (format « sismo-failles » v1, lu par
// src/sismo/failles.js). La lecture, les écarts (frontières de plaques, plis, types absents) et les composantes de vitesse
// sont ceux du solveur ; l'outil garde les failles qui touchent le domaine, simplifie les traces (≈ 100 m) et arrondit les
// coordonnées au millième de degré.
//
//   curl -L -o /tmp/gem.geojson https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults_harmonized.geojson
//   node tools/failles/gem.mjs /tmp/gem.geojson
//
// Licence des données : CC BY-SA 4.0 (Styron et Pagani, 2020) ; l'extrait garde cette licence et sa source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Failles from '../../src/sismo/failles.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const entree = process.argv[2];
if (!entree) { console.error('usage : node tools/failles/gem.mjs gem_active_faults_harmonized.geojson'); process.exit(1); }
const DOMAINE = { lon: [-20, 50], lat: [22, 53] }; // même domaine que le fond « Méditerranée » des cartes
const dedans = ([lon, lat]) => lon >= DOMAINE.lon[0] && lon <= DOMAINE.lon[1] && lat >= DOMAINE.lat[0] && lat <= DOMAINE.lat[1];

const brut = JSON.parse(fs.readFileSync(entree, 'utf8'));
const lu = Failles.lireGem(brut);
const failles = lu.failles.filter(f => f.trace.some(dedans)).map(f => ({ ...f, trace: Failles.simplifier(f.trace, 0.001) }));
const parCatalogue = {};
for (const f of failles) parCatalogue[f.catalogue] = (parCatalogue[f.catalogue] || 0) + 1;
const source = {
  nom: 'GEM Global Active Faults Database (GEM GAF-DB), version harmonisée',
  reference: 'Styron, R. et Pagani, M. (2020). The GEM Global Active Faults Database. Earthquake Spectra, 36(1_suppl), 160–180. doi:10.1177/8755293020944182',
  licence: 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)',
  url: 'https://github.com/GEMScienceTools/gem-global-active-faults',
  extrait: new Date().toISOString().slice(0, 10), domaine: DOMAINE, catalogues: parCatalogue,
  note: 'extrait : failles qui touchent le domaine, traces simplifiées (≈ 100 m), coordonnées au millième de degré ; frontières de plaques (Bird 2003), subductions, dorsales, transformantes et plis écartés',
};
const sortie = path.join(ici, '../../data/failles-mediterranee.json');
fs.writeFileSync(sortie, Failles.ecrire({ source, failles }) + '\n');
const avec = failles.filter(f => f.glissement).length;
console.log(`${failles.length} failles (${avec} avec vitesse de glissement) → ${path.relative(process.cwd(), sortie)} (${Math.round(fs.statSync(sortie).size / 1024)} ko)`);
console.log('écartées de la base entière :', lu.ecartees, '; par catalogue :', parCatalogue);
