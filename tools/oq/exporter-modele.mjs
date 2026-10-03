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
writeFileSync(new URL('../../tests/references/modele_psha.json', import.meta.url), JSON.stringify(sortie, null, 1) + '\n');
console.log(`écrit tests/references/modele_psha.json (${sortie.zones.map(z => `${z.id} : ${z.points.length} points`).join(', ')})`);
