// tools/oq/exporter-catalogue.mjs — écrit le catalogue de référence que HMTK va traiter
// (tests/references/catalogue.csv). Les dates sont ramenées au jour, comme HMTK les lit :
// année décimale = année + (jour de l'année − 1) / 365 ; les positions sont converties en
// longitude et latitude sur l'équateur (1° = 111,195 km).
import { writeFileSync } from 'node:fs';
import Sc from '../../src/sismo/sismicite.js';

const DEBUTS_MOIS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const KM_DEG = 6371.0 * Math.PI / 180;
// Magnitudes à 10⁻⁴ près : sans ex aequo, l'ordre de traitement du déclusterage est le même qu'HMTK.
const cat = Sc.genererCatalogue({ b: 1, taux4: 2, Mmax: 7.5, graine: 2024, arrondi: 1e-4 });
const lignes = ['id,annee,mois,jour,dtime,magnitude,x,y,longitude,latitude,replique'];
for (const e of cat) {
  const an = Math.floor(e.t), j = Math.min(364, Math.floor((e.t - an) * 365));
  let mois = 11;
  while (DEBUTS_MOIS[mois] > j) mois--;
  const jour = j - DEBUTS_MOIS[mois] + 1, dtime = an + j / 365;
  lignes.push([e.id, an, mois + 1, jour, dtime.toFixed(9), e.M.toFixed(4), e.x.toFixed(4), e.y.toFixed(4),
    (e.x / KM_DEG).toFixed(7), (e.y / KM_DEG).toFixed(7), e.rep ? 1 : 0].join(','));
}
writeFileSync(new URL('../../tests/references/catalogue.csv', import.meta.url), lignes.join('\n') + '\n');
console.log(`écrit tests/references/catalogue.csv (${cat.length} séismes)`);
