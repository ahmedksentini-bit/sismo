// tools/obspy/exporter-mecanisme.mjs — mécanismes de test (types purs, obliques, pendages extrêmes), leurs
// tenseurs des moments calculés par le site (NED) et des directions de rai. Écrit
// tests/references/modele_mecanisme.json, que tools/obspy/mecanisme.py vérifie avec ObsPy.
import { writeFileSync } from 'node:fs';
import Me from '../../src/sismo/mecanisme.js';

const MECS = [[0, 45, -90], [30, 60, 90], [120, 89, 0], [200, 70, 180], [45, 30, 60], [310, 55, -120], [75, 20, 15], [160, 80, -35], [250, 40, 135], [10, 85, -170]];
if (import.meta.url === `file://${process.argv[1]}`) {
  const rais = [];
  for (let i = 5; i < 180; i += 20) for (let phi = 0; phi < 360; phi += 40) rais.push([i, phi]);
  const modele = { mecanismes: MECS.map(([s, d, r]) => ({ azimut: s, pendage: d, glissement: r, M: Me.tenseur(s, d, r) })), rais, directions: rais.map(([i, p]) => Me.direction(i, p)) };
  writeFileSync(new URL('../../tests/references/modele_mecanisme.json', import.meta.url), JSON.stringify(modele));
  console.log(`écrit tests/references/modele_mecanisme.json : ${MECS.length} mécanismes, ${rais.length} rais`);
}
