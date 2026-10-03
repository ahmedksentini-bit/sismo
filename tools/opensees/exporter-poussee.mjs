// tools/opensees/exporter-poussee.mjs — cas de référence de la poussée progressive et du calcul temporel non
// linéaire : trois bâtiments en console de cisaillement dimensionnés à l'EN 1998-1:2004 (résistances d'étage = 1,5 fois
// les efforts de l'analyse modale), dont un à rez souple et faible et un à toiture lourde avec écrouissage, et un
// accélérogramme d'école (M 6,5 à 20 km, PGA 0,6 g : les étages plastifient). Écrit tests/references/modele_poussee.json, que
// tools/opensees/poussee.py fait calculer par OpenSeesPy.
import { writeFileSync } from 'node:fs';
import Accelero from '../../src/sismo/accelerogramme.js';
import Spectre from '../../src/sismo/spectre.js';
import B from '../../src/sismo/batiment.js';
import P from '../../src/sismo/poussee.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = Accelero.simuler({ M: 6.5, R: 20, graine: 1618 });
  let pga = 0;
  for (const v of rec.acc) pga = Math.max(pga, Math.abs(v));
  const acc = Array.from(rec.acc, v => +((v / pga) * 0.6 * 9.81).toPrecision(10));
  const Sd = T => Spectre.ec8Calcul(T, { type: 1, sol: 'B', ag: 0.3, q: 3 }) * Spectre.G;
  const etages = (n, f) => Array.from({ length: n }, (_, i) => f(i, n));
  const batiments = [
    { nom: 'régulier', m: etages(5, () => 300), k: etages(5, () => 4e5), h: etages(5, () => 3), alpha: 0 },
    { nom: 'rez souple et faible', m: etages(4, () => 300), k: etages(4, i => (i ? 1 : 0.5) * 3.5e5), h: etages(4, () => 3), alpha: 0, faible: 0.6 },
    { nom: 'toiture lourde', m: etages(6, (i, n) => (i === n - 1 ? 2.5 : 1) * 250), k: etages(6, () => 4.5e5), h: etages(6, () => 3), alpha: 0.03 },
  ].map(({ faible, ...b }) => {
    const Vy = P.resistances(b, Sd, { omega: 1.5 }).map((v, i) => +((i === 0 && faible ? faible : 1) * v).toPrecision(10));
    return { ...b, Vy, phi: B.modes(b)[0].phi, sousPas: Math.max(...B.modes(b).map(x => Spectre.sousPas(rec.dt, x.T))) };
  });
  writeFileSync(new URL('../../tests/references/modele_poussee.json', import.meta.url), JSON.stringify({ dt: rec.dt, acc, xi: 0.05, batiments }));
  console.log(`écrit tests/references/modele_poussee.json : ${acc.length} pas, ${batiments.length} bâtiments`);
}
