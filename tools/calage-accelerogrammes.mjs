// tools/calage-accelerogrammes.mjs — correction spectrale c(f) des accélérogrammes synthétiques
// (src/sismo/accelerogramme.js) : sur une grille de scénarios (M, R) et de graines, la moyenne des
// ln Sa simulés est ramenée à la médiane des trois lois d'atténuation, période par période, en
// corrigeant le spectre de Fourier à f = 1/T (itérations, principe de la méthode hybride empirique de
// Campbell 2003). Écrit src/sismo/coefficients/accelerogrammes.js.
import { writeFileSync } from 'node:fs';
import Accelero from '../src/sismo/accelerogramme.js';

export const GRILLE = { M: [5, 5.5, 6, 6.5, 7, 7.5], R: [5, 10, 20, 40, 80, 150], graines: 12 };
export const PERIODES = [0.04, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3];
// Résidu moyen ln(Sa simulé / médiane des lois) à chaque période, sur la grille.
export function residus(table, grille = GRILLE, decalage = 0) {
  const r = PERIODES.map(() => 0);
  let n = 0;
  for (const M of grille.M) for (const R of grille.R) {
    const med = PERIODES.map(T => Accelero.medianeLois(M, R, T));
    for (let g = 0; g < grille.graines; g++) {
      const rec = Accelero.simuler({ M, R, graine: decalage + 1000 * g + Math.round(100 * M) + R, table });
      Accelero.spectre(rec, PERIODES).Sa.forEach((v, k) => { r[k] += Math.log(v) - med[k]; });
      n++;
    }
  }
  return r.map(v => v / n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // fréquences de la table : 1/T, triées
  let table = PERIODES.map(T => [1 / T, 1]).reverse();
  for (let it = 0; it < 6; it++) {
    const r = residus(table).reverse();
    table = table.map(([f, c], k) => [f, c * Math.exp(-r[k])]);
    console.log(`itération ${it + 1} : résidu max ${Math.max(...r.map(Math.abs)).toFixed(3)}`);
  }
  const fin = residus(table);
  const arr = v => +v.toPrecision(5);
  const contenu = `// Fichier produit par tools/calage-accelerogrammes.mjs (npm run calage) : ne pas modifier à la main.
// Correction c(f) du spectre de Fourier des accélérogrammes synthétiques (f en Hz), qui ramène la moyenne
// des ln Sa sur la médiane d'Akkar et al. (2014), Bindi et al. (2014) et Boore et al. (2014) à Vs30 = 800 m/s,
// sur M ${GRILLE.M.join(', ')} × Rjb ${GRILLE.R.join(', ')} km × ${GRILLE.graines} graines.
const CalageAccelerogrammes = ${JSON.stringify({ correction: table.map(([f, c]) => [arr(f), arr(c)]), periodes: PERIODES, residus: fin.map(v => +v.toFixed(4)) })};
export default CalageAccelerogrammes;
`;
  writeFileSync(new URL('../src/sismo/coefficients/accelerogrammes.js', import.meta.url), contenu);
  console.log('résidus finals', fin.map(v => v.toFixed(3)).join(' '));
}
