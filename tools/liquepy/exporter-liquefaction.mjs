// tools/liquepy/exporter-liquefaction.mjs — sondage CPT d'école (couches de sable lâche, de limon, de sable
// dense et d'argile) et trois scénarios (nappe, amax, magnitude). Écrit tests/references/modele_liquefaction.json,
// que tools/liquepy/liquefaction.py fait calculer par liquepy (Boulanger et Idriss 2014).
import { writeFileSync } from 'node:fs';
import L from '../../src/sismo/liquefaction.js';

export const COUCHES = [
  { h: 1.5, qc: 3, rf: 1.5 },    // remblai sableux
  { h: 4.5, qc: 5, rf: 0.6 },    // sable lâche
  { h: 2, qc: 1.5, rf: 3 },      // limon argileux
  { h: 5, qc: 9, rf: 0.7 },      // sable moyennement dense
  { h: 3, qc: 0.9, rf: 4.5 },    // argile
  { h: 4, qc: 18, rf: 0.6 },     // sable dense
];
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = L.sondageSynthetique(COUCHES, { pas: 0.1, graine: 42, gwl: 1.5 });
  const modele = {
    sondage: { z: s.z, qc: s.qc.map(v => +v.toPrecision(10)), fs: s.fs.map(v => +v.toPrecision(10)) },
    scenarios: [{ gwl: 1.5, amax: 0.25, M: 6.5 }, { gwl: 3, amax: 0.4, M: 7.2 }, { gwl: 1.5, amax: 0.15, M: 7.5 }],
    spt: { n: [0, 2, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45], sve: [30, 60, 100, 150, 250, 400] },
  };
  writeFileSync(new URL('../../tests/references/modele_liquefaction.json', import.meta.url), JSON.stringify(modele));
  console.log(`écrit tests/references/modele_liquefaction.json : ${s.z.length} points de 0,1 à ${s.z[s.z.length - 1]} m`);
}
