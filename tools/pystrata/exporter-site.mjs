// tools/pystrata/exporter-site.mjs — modèle de référence des effets de site : colonne de sol d'école
// (sous-couches, contraintes moyennes et paramètres de Darendeli calculés par src/sismo/site.js) et deux
// accélérogrammes d'entrée à l'affleurement du rocher (faible et fort), complétés de zéros. Écrit
// tests/references/modele_site.json, que tools/pystrata/site.py fait calculer par pystrata.
import { writeFileSync } from 'node:fs';
import Site from '../../src/sismo/site.js';
import Accelero from '../../src/sismo/accelerogramme.js';

export const PROFIL = {
  couches: [
    { h: 4, vs: 160, poids: 17.5, ip: 30 },
    { h: 8, vs: 220, poids: 18.5, ip: 15 },
    { h: 12, vs: 320, poids: 19.5, ip: 0 },
    { h: 10, vs: 450, poids: 20.5, ip: 0 },
  ],
  rocher: { vs: 1200, poids: 22, xi: 0.01 },
};

export function mouvement(pga, graine = 314159) {
  const rec = Accelero.simuler({ M: 6.5, R: 15, graine });
  let p = 0;
  for (const v of rec.acc) p = Math.max(p, Math.abs(v));
  const n = rec.acc.length, acc = new Array(n + Math.round(20 / rec.dt)).fill(0);
  for (let i = 0; i < n; i++) acc[i] = +((rec.acc[i] / p) * pga).toPrecision(10);
  return { dt: rec.dt, acc };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const col = Site.colonne(PROFIL.couches, PROFIL.rocher);
  const modele = {
    profil: PROFIL,
    couches: col.couches.map(c => ({ h: c.h, vs: c.vs, poids: c.poids, ip: c.ip || 0, ocr: c.ocr || 1, sigmaM: c.sigmaM })),
    rocher: PROFIL.rocher,
    frequences: Array.from({ length: 60 }, (_, i) => +(0.1 * Math.pow(250, i / 59)).toPrecision(6)),
    periodes: [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3],
    ratio: 0.65,
    mouvements: [{ nom: 'faible', ...mouvement(0.05) }, { nom: 'fort', ...mouvement(0.35) }],
  };
  writeFileSync(new URL('../../tests/references/modele_site.json', import.meta.url), JSON.stringify(modele));
  console.log(`écrit tests/references/modele_site.json : ${modele.couches.length} sous-couches, ${modele.mouvements[0].acc.length} pas`);
}
