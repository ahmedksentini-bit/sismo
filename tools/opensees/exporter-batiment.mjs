// tools/opensees/exporter-batiment.mjs — cas de référence du bâtiment en console de cisaillement : quatre bâtiments
// (régulier, rigidité dégressive, étage souple, toiture lourde), le spectre de calcul de l'EN 1998-1:2004 et un
// accélérogramme d'école (M 6,5 à 20 km). Le sous-pas imposé est le plus fin des modes, pour qu'OpenSees, qui
// intègre le système couplé à pas constant, et la superposition modale du site fassent le même calcul. Écrit
// tests/references/modele_batiment.json, que tools/opensees/batiment.py fait calculer par OpenSeesPy.
import { writeFileSync } from 'node:fs';
import Accelero from '../../src/sismo/accelerogramme.js';
import Spectre from '../../src/sismo/spectre.js';
import B from '../../src/sismo/batiment.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = Accelero.simuler({ M: 6.5, R: 20, graine: 3141 });
  let p = 0;
  for (const v of rec.acc) p = Math.max(p, Math.abs(v));
  const acc = Array.from(rec.acc, v => +((v / p) * 0.25 * 9.81).toPrecision(10));
  const etages = (n, f) => Array.from({ length: n }, (_, i) => f(i, n));
  const batiments = [
    { nom: 'régulier', m: etages(5, () => 300), k: etages(5, () => 4e5), h: etages(5, () => 3) },
    { nom: 'dégressif', m: etages(10, () => 350), k: etages(10, (i, n) => 9e5 * (1 - (0.5 * i) / (n - 1))), h: etages(10, () => 3) },
    { nom: 'étage souple', m: etages(4, () => 300), k: etages(4, i => (i === 0 ? 0.4 : 1) * 3e5), h: etages(4, i => (i === 0 ? 4 : 3)) },
    { nom: 'toiture lourde', m: etages(8, (i, n) => (i === n - 1 ? 2.5 : 1) * 250), k: etages(8, () => 5e5), h: etages(8, () => 3) },
  ].map(b => ({ ...b, sousPas: Math.max(...B.modes(b).map(x => Spectre.sousPas(rec.dt, x.T))) }));
  const spectre = { type: 1, sol: 'C', ag: 0.25, q: 3, beta: 0.2 };
  writeFileSync(new URL('../../tests/references/modele_batiment.json', import.meta.url), JSON.stringify({ dt: rec.dt, acc, spectre, batiments }));
  console.log(`écrit tests/references/modele_batiment.json : ${acc.length} pas, ${batiments.length} bâtiments (sous-pas ${batiments.map(b => b.sousPas).join(', ')})`);
}
