// tools/gcmt/extrait.mjs — extrait méditerranéen du catalogue Global CMT pour le banc « sismicité » (mode « Catalogue réel ») :
// data/mecanismes-mediterranee.json (format « sismo-mecanismes » v1, lu par src/sismo/mecanismes.js). Lecture des fichiers
// ndk par Mecanismes.lireNdk (Mw du moment scalaire, premier plan nodal), séismes du domaine 20° O – 50° E, 22° N – 53° N,
// un seul par identifiant ou par séisme : le premier fichier donné l'emporte (catalogue complet, puis fichiers mensuels).
//
//   node tools/gcmt/extrait.mjs <catalogue complet .ndk> <fichiers mensuels .ndk…>
//
// Chaque argument est un fichier local ou une adresse http(s), téléchargée telle quelle. Les adresses exactes du catalogue
// complet et des fichiers mensuels récents se prennent sur la page « Catalog search / Download » de globalcmt.org
// (www.ldeo.columbia.edu/~gcmt/projects/CMT/catalog/) : elles n'ont pas pu être vérifiées à l'écriture de l'outil (réseau
// refusé) et ne sont donc pas inscrites ici.
//
// Données : Global CMT Project (Dziewonski, Chou et Woodhouse 1981 ; Ekström, Nettles et Dziewonski 2012), à citer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Mecanismes from '../../src/sismo/mecanismes.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const entrees = process.argv.slice(2);
if (!entrees.length) { console.error('usage : node tools/gcmt/extrait.mjs catalogue.ndk [mensuel.ndk …] (fichiers ou adresses http(s))'); process.exit(1); }

async function texte(e) {
  if (!/^https?:\/\//.test(e)) return fs.readFileSync(e, 'latin1');
  const r = await fetch(e);
  if (!r.ok) throw new Error(`${e} : HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString('latin1');
}
const listes = [], lus = [];
for (const e of entrees) {
  const r = Mecanismes.lireNdk((await texte(e)).split(/\r\n|\n|\r/).filter(l => l.trim()));
  listes.push(r.mecanismes); lus.push({ fichier: path.basename(e), seismes: r.mecanismes.length, rejetes: r.rejetees });
  console.log(`${path.basename(e)} : ${r.mecanismes.length} séismes lus, ${r.rejetees} rejetés`);
}
const mecanismes = Mecanismes.extraire(listes);
const iso = t => new Date(t).toISOString().slice(0, 10);
const source = {
  nom: 'Global CMT Project (Global Centroid-Moment-Tensor), fichiers ndk',
  references: [
    'Dziewonski, A. M., Chou, T.-A. et Woodhouse, J. H. (1981). Determination of earthquake source parameters from waveform data for studies of global and regional seismicity. J. Geophys. Res., 86, 2825–2852. doi:10.1029/JB086iB04p02825',
    'Ekström, G., Nettles, M. et Dziewonski, A. M. (2012). The global CMT project 2004–2010: Centroid-moment tensors for 13,017 earthquakes. Phys. Earth Planet. Inter., 200–201, 1–9. doi:10.1016/j.pepi.2012.04.002',
  ],
  url: 'https://www.globalcmt.org',
  extrait: new Date().toISOString().slice(0, 10), fichiers: lus, domaine: Mecanismes.DOMAINE,
  periode: mecanismes.length ? [iso(mecanismes[0].t), iso(mecanismes[mecanismes.length - 1].t)] : null,
  note: 'extrait : séismes du domaine ; position et profondeur de la ligne 1 du ndk (hypocentre de référence), Mw du moment scalaire, premier plan nodal ; coordonnées au centième de degré, angles au degré',
};
const sortie = path.join(ici, '../../data/mecanismes-mediterranee.json');
fs.writeFileSync(sortie, Mecanismes.ecrire({ source, mecanismes }) + '\n');
console.log(`${mecanismes.length} mécanismes (${source.periode ? source.periode.join(' – ') : '—'}) → ${path.relative(process.cwd(), sortie)} (${Math.round(fs.statSync(sortie).size / 1024)} ko)`);
