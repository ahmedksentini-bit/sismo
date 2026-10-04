// Décodeur miniSEED (src/sismo/miniseed.js) : chaque codage écrit par ObsPy (Steim 1, Steim 2, entiers, réels,
// gros- et petit-boutiste, enregistrements de 512 octets) est relu à l'identique : identifiant, heure du premier
// échantillon, cadence, échantillons, et contrôle de Steim (dernier échantillon de la trame d'en-tête).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MS from '../src/sismo/miniseed.js';

const ref = JSON.parse(readFileSync(new URL('./references/miniseed.json', import.meta.url), 'utf-8')).cas;

test('chaque codage d\'ObsPy est relu à l\'identique', () => {
  for (const c of ref) {
    const octets = readFileSync(new URL(`./references/${c.fichier}`, import.meta.url));
    const enr = MS.lire(new Uint8Array(octets.buffer, octets.byteOffset, octets.byteLength));
    assert.ok(enr.length >= 2, `${c.codage} : ${enr.length} enregistrements`);
    const tout = enr.flatMap(e => Array.from(e.echantillons));
    assert.equal(tout.length, c.echantillons.length, `${c.codage} ${c.ordre} : nombre d'échantillons`);
    const tol = c.codage === 'FLOAT32' ? 1e-6 * Math.max(...c.echantillons.map(Math.abs)) : 0;
    tout.forEach((v, i) => assert.ok(Math.abs(v - c.echantillons[i]) <= tol, `${c.codage} ${c.ordre} : échantillon ${i} ${v} contre ${c.echantillons[i]}`));
    const e0 = enr[0];
    assert.equal(e0.id, `${c.reseau}.${c.station}.${c.emplacement}.${c.voie}`);
    assert.equal(e0.codage, c.codage);
    assert.equal(e0.cadence, c.cadence);
    assert.ok(Math.abs(e0.debut - c.debut * 1000) < 0.01, `${c.codage} : début ${e0.debut} contre ${c.debut * 1000}`);
    assert.equal(e0.longueur, 512);
    assert.ok(enr.every(e => e.controle), `${c.codage} : contrôle`);
    // les enregistrements se suivent sans trou : début du suivant = début + n / cadence
    for (let k = 1; k < enr.length; k++) assert.ok(Math.abs(enr[k].debut - (enr[k - 1].debut + (1000 * enr[k - 1].echantillons.length) / c.cadence)) < 0.01);
  }
});

test('cadence à partir du facteur et du multiplicateur (SEED 2.4)', () => {
  assert.equal(MS.cadence(20, 1), 20);
  assert.equal(MS.cadence(1, -10), 0.1);
  assert.equal(MS.cadence(-10, 1), 0.1);
  assert.equal(MS.cadence(-2, -5), 0.1);
  assert.equal(MS.cadence(0, 1), 0);
});

test('un enregistrement abîmé ou étranger est ignoré sans erreur', () => {
  const faux = new Uint8Array(512).fill(65);
  assert.equal(MS.enregistrement(faux), null);
  assert.deepEqual(MS.lire(faux), []);
});
