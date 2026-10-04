// Protocole SeedLink (src/sismo/seedlink.js) : validation des flux demandés au relais, commandes de la poignée de
// main, découpage d'un flux d'octets coupé n'importe où en paquets « SL » + miniSEED, relus par le décodeur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import SL from '../src/sismo/seedlink.js';
import MS from '../src/sismo/miniseed.js';

test('flux demandés : bien formés, 12 au plus ; reprise bornée à 30 minutes', () => {
  assert.deepEqual(SL.lireFlux('GE.TNTN..BHZ,ge.isp.00.hhz'), [
    { reseau: 'GE', station: 'TNTN', emplacement: '', voie: 'BHZ' }, { reseau: 'GE', station: 'ISP', emplacement: '00', voie: 'HHZ' }]);
  for (const faux of ['', 'GE.TNTN.BHZ', 'GE.TNTN..BHZ;DROP', 'GE.TROPLONG..BHZ', 'GE.TNTN..XYZ', 'GE.A..BHZ\r\nEND', null])
    assert.equal(SL.lireFlux(faux), null, String(faux));
  assert.equal(SL.lireFlux(Array.from({ length: 13 }, (_, i) => `GE.S${i}..BHZ`).join(',')), null);
  const m = Date.UTC(2026, 9, 4, 20, 0, 0);
  assert.equal(SL.lireDepuis('2026-10-04T19:55:00Z', m), m - 5 * 60000);
  assert.equal(SL.lireDepuis('2026-10-04T10:00:00Z', m), m - 30 * 60000);
  assert.equal(SL.lireDepuis('2027-01-01T00:00:00Z', m), m);
  assert.equal(SL.lireDepuis('n\'importe quoi', m), null);
  assert.equal(SL.versFlux(SL.lireFlux('GE.TNTN..BHZ,GE.ISP.00.HHZ')), 'GE.TNTN..BHZ,GE.ISP.00.HHZ');
});

test('poignée de main : STATION, SELECT, TIME ou DATA par station, puis END', () => {
  const f = SL.lireFlux('GE.TNTN..BHZ,GE.TNTN..BHN,GE.ISP.00.HHZ');
  assert.deepEqual(SL.commandes(f, Date.UTC(2026, 9, 4, 19, 55, 7)).map(c => c.ligne), [
    'STATION TNTN GE', 'SELECT ??BHZ.D', 'SELECT ??BHN.D', 'TIME 2026,10,04,19,55,07',
    'STATION ISP GE', 'SELECT 00HHZ.D', 'TIME 2026,10,04,19,55,07', 'END']);
  assert.deepEqual(SL.commandes(f.slice(2)).map(c => c.ligne), ['STATION ISP GE', 'SELECT 00HHZ.D', 'DATA', 'END']);
  const l = SL.lecteurLignes();
  assert.deepEqual(l.pousser(new TextEncoder().encode('SeedLink v3.1 (2020)\r\nGFZ Pots')), ['SeedLink v3.1 (2020)']);
  assert.deepEqual(l.pousser(new TextEncoder().encode('dam\r\nOK\r\n')), ['GFZ Potsdam', 'OK']);
});

test('flux coupé n\'importe où : paquets retrouvés, enregistrements identiques, resynchronisation sur « SL »', () => {
  const lire = f => { const b = readFileSync(new URL(`./references/miniseed/${f}`, import.meta.url)); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); };
  const enr = [];
  for (const f of ['steim2.mseed', 'steim1.mseed']) { const o = lire(f); for (let i = 0; i < o.length; i += 512) enr.push(o.slice(i, i + 512)); }
  const parties = [new Uint8Array([79, 75, 13, 10])]; // reste d'une réponse avant le flux : ignoré
  enr.forEach((e, k) => parties.push(SL.paquet(0x1a0 + k, e)));
  const tout = new Uint8Array(parties.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parties) { tout.set(p, o); o += p.length; }
  for (const taille of [1, 7, 100, 513, 5000]) {
    const d = SL.decoupeur(), recus = [];
    for (let i = 0; i < tout.length; i += taille) recus.push(...d.pousser(tout.slice(i, i + taille)));
    assert.equal(recus.length, enr.length, `morceaux de ${taille} octets`);
    recus.forEach((p, k) => {
      assert.equal(p.sequence, 0x1a0 + k);
      assert.deepEqual(Array.from(p.enregistrement), Array.from(enr[k]));
    });
    assert.equal(d.reste(), 0);
    const e = MS.enregistrement(recus[0].enregistrement);
    assert.equal(e.id, 'GE.TEST.00.BHZ');
  }
});
