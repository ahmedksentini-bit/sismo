// tools/opensees/exporter-inelastique.mjs — cas de référence de l'oscillateur inélastique : un accélérogramme
// d'école (M 6,5 à 20 km, PGA 0,3 g) et des oscillateurs (T, ξ, fy = Sa,élastique/R, α). Écrit
// tests/references/modele_inelastique.json, que tools/opensees/sdof.py fait calculer par OpenSeesPy.
import { writeFileSync } from 'node:fs';
import Accelero from '../../src/sismo/accelerogramme.js';
import I from '../../src/sismo/inelastique.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = Accelero.simuler({ M: 6.5, R: 20, graine: 2718 });
  let p = 0;
  for (const v of rec.acc) p = Math.max(p, Math.abs(v));
  const acc = Array.from(rec.acc, v => +((v / p) * 0.3 * 9.81).toPrecision(10));
  const cas = [];
  for (const [T, R, alpha] of [[0.2, 1, 0], [0.2, 3, 0], [0.5, 2, 0], [0.5, 4, 0.05], [1, 2, 0], [1, 4, 0], [2, 3, 0.05], [0.1, 4, 0]]) {
    const sae = I.saElastique(Float64Array.from(acc), rec.dt, T, 0.05);
    cas.push({ T, xi: 0.05, R, alpha, fy: R === 1 ? 1e12 : +(sae / R).toPrecision(12) });
  }
  writeFileSync(new URL('../../tests/references/modele_inelastique.json', import.meta.url), JSON.stringify({ dt: rec.dt, acc, cas }));
  console.log(`écrit tests/references/modele_inelastique.json : ${acc.length} pas, ${cas.length} oscillateurs`);
}
