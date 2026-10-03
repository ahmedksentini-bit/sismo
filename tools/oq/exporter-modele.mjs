// tools/oq/exporter-modele.mjs — écrit le modèle d'aléa d'école tel que le moteur du site le voit
// (tests/references/modele_psha.json) : points de chaque zone (km et degrés), variantes du modèle de
// taux (catalogue : a et b ; géodésie : taux de moment et b), branches de l'arbre logique, niveaux et
// grandeurs, niveaux à désagréger. tools/oq/psha.py le traduit en NRML et le fait calculer par OpenQuake.
// Positions en degrés sur l'équateur : 1° = 6371·π/180 km, la sphère d'OpenQuake.
import { writeFileSync } from 'node:fs';
import Psha from '../../src/sismo/psha.js';

const KM_DEG = 6371.0 * Math.PI / 180;
const m = Psha.modeleDefaut();
const sortie = {
  ...m,
  kmParDegre: KM_DEG,
  variantes: Psha.variantes(m),
  zones: m.zones.map(z => ({
    ...z,
    points: Psha.discretiser(z.polygone, m.pasGrille).map(p => ({ ...p, lon: p.x / KM_DEG, lat: p.y / KM_DEG })),
  })),
};
// Niveaux à désagréger : UHS moyen à 10 % en 50 ans pour le PGA et Sa(1 s), arrondis au millième de g.
const res = Psha.calculer(sortie);
sortie.desagregation = { largeurM: 0.5, largeurR: 20, niveaux: ['PGA', 1].map(imt => {
  const k = m.imts.indexOf(imt);
  return { imt, x: Math.round(Psha.niveauPourProba(res.niveaux, res.moyenne[k], 0.1) * 1000) / 1000 };
}) };
// Spectre conditionnel : conditionné à Sa(1 s), aux probabilités de 10 % et 2 % en 50 ans.
sortie.spectreConditionnel = { imtRef: 1, poes: [0.1, 0.02] };
// Carte d'aléa : PGA moyen à 10 % en 50 ans en six sites de la grille du banc (pas de 20 km), dans et hors des zones.
sortie.carte = { imt: 'PGA', poe: 0.1, sites: [[-40, 0], [0, 60], [60, -40], [140, 0], [180, 80], [-80, 110]].map(([x, y]) => ({ x, y, lon: x / KM_DEG, lat: y / KM_DEG })) };
writeFileSync(new URL('../../tests/references/modele_psha.json', import.meta.url), JSON.stringify(sortie, null, 1) + '\n');
console.log(`écrit tests/references/modele_psha.json (${sortie.zones.map(z => `${z.id} : ${z.points.length} points`).join(', ')})`);
