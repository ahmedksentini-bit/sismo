// tools/temps-localisation.mjs — table des temps de trajet de la localisation d'un séisme réel (banc « réseau », mode
// « Séisme réel ») : premières arrivées P et S en fonction de la distance épicentrale (0 à 100°, pas de 0,25°) et de la
// profondeur (0 à 40 km). Jusqu'à 1° : croûte du cours (Sismo.temps : P = Pg ou Pn, S = Sg ou Sn, la première) ; au-delà
// de 2° : ak135 (Globe, vérifié contre TauP) ; entre les deux, raccord linéaire (les deux modèles diffèrent de moins
// d'une seconde en P et de quelques secondes en S vers 1,5°). Écrit data/temps-localisation.json (fichier produit).
// Usage : npm run temps-localisation
import { writeFileSync } from 'node:fs';
import Sismo from '../src/sismo/signal.js';
import Globe from '../src/sismo/globe.js';

const PROFONDEURS = [0, 5, 10, 15, 20, 25, 30, 35, 40], PAS = 0.25, DMAX = 100;
const RAD = Math.PI / 180;
const premiere = (ph, h, d) => { const a = Globe.arrivees(ph, h, d); return a.length ? Math.min(...a.map(x => x.temps)) : null; };

function temps(h, d) {
  const km = d * RAD * Globe.R, c = Sismo.temps(km, h);
  const croute = { P: c.tP, S: c.tSn !== null ? Math.min(c.tSg, c.tSn) : c.tSg };
  if (d <= 1) return croute;
  const ak = { P: premiere('P', Math.max(h, 0.01), d), S: premiere('S', Math.max(h, 0.01), d) };
  if (d >= 2) return ak;
  const w = d - 1, r = {};
  for (const ph of ['P', 'S']) r[ph] = ak[ph] === null ? croute[ph] : (1 - w) * croute[ph] + w * ak[ph];
  return r;
}

const sortie = { source: 'tools/temps-localisation.mjs : croûte du cours jusqu\'à 1°, ak135 (Globe) au-delà de 2°, raccord linéaire entre les deux', profondeurs: PROFONDEURS, pas: PAS, dmax: DMAX, P: [], S: [] };
for (const h of PROFONDEURS) {
  const P = [], S = [];
  for (let i = 0; i * PAS <= DMAX + 1e-9; i++) {
    const t = temps(h, i * PAS);
    P.push(t.P === null ? null : Math.round(t.P * 100) / 100);
    S.push(t.S === null ? null : Math.round(t.S * 100) / 100);
  }
  sortie.P.push(P); sortie.S.push(S);
  process.stdout.write(`h = ${h} km `);
}
const chemin = new URL('../data/temps-localisation.json', import.meta.url);
writeFileSync(chemin, JSON.stringify(sortie));
console.log(`\nécrit data/temps-localisation.json`);
