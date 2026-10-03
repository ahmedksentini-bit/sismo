// Oscillateur inélastique : ressort bilinéaire, limite élastique, comparaison à OpenSeesPy
// (tests/references/inelastique.json), facteur de réduction, méthode N2 (EN 1998-1:2004, annexe B).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import I from '../src/sismo/inelastique.js';
import Spectre from '../src/sismo/spectre.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);

test('ressort bilinéaire cinématique : plastification, écrouissage, décharge élastique, effet Bauschinger', () => {
  const r = I.ressort(100, 1, 0.1); // uy = 0,01
  proche(r.essai(0, 0, 0.005).f, 0.5, 1e-15);
  const p = r.essai(0, 0, 0.03); // au-delà : droite de pente 10 décalée de 0,9
  proche(p.f, 10 * 0.03 + 0.9, 1e-15); assert.equal(p.kt, 10);
  const d = r.essai(0.03, 1.2, 0.025); // décharge élastique
  proche(d.f, 1.2 - 0.5, 1e-15); assert.equal(d.kt, 100);
  // plastification inverse avant −fy : bornée par la droite basse
  const b = r.essai(0.03, 1.2, 0.005);
  proche(b.f, 10 * 0.005 - 0.9, 1e-15);
});

const modele = lire('modele_inelastique.json'), ref = lire('inelastique.json'), acc = Float64Array.from(modele.acc);

test('limite élastique : même déplacement maximal que le spectre de réponse (Newmark, sous-pas T/20)', () => {
  for (const T of [0.07, 0.3, 1.2]) {
    const r = I.integrer(acc, modele.dt, { T, xi: 0.05 }), sd = Spectre.reponse(acc, modele.dt, [T], 0.05).Sd[0];
    proche(r.umax / sd, 1, 1e-9, `T = ${T}`);
  }
});

test('OpenSeesPy : déplacement et force au fil du temps, huit oscillateurs (Steel01, Newmark, Newton)', () => {
  for (const c of ref.cas) {
    const r = I.integrer(acc, modele.dt, { T: c.T, xi: c.xi, fy: c.fy, alpha: c.alpha });
    proche(r.umax / c.umax, 1, 1e-9, `T ${c.T} R ${c.R} : umax`);
    const fm = Math.max(...c.f.map(Math.abs));
    r.u.forEach((v, i) => assert.ok(Math.abs(v - c.u[i]) <= 1e-6 * c.umax && Math.abs(r.f[i] - c.f[i]) <= 1e-6 * fm, `T ${c.T} R ${c.R} pas ${i}`));
  }
});

test('ductilité : μ croît avec R ; Rμ redonne la ductilité visée ; périodes courtes plus exigeantes', () => {
  const dt = modele.dt;
  const mu = R => I.ductiliteR(acc, dt, 0.5, R);
  assert.ok(mu(4) > mu(2) && mu(2) > 1);
  const R4 = I.facteurPourDuctilite(acc, dt, 0.5, 4);
  proche(I.ductiliteR(acc, dt, 0.5, R4), 4, 0.01, 'μ(Rμ)');
  assert.ok(I.ductiliteR(acc, dt, 0.5, R4 * 0.97) < 4);
  // même R : la règle des égaux déplacements tombe en défaut aux périodes courtes (μ ≫ R), pas aux longues
  const court = I.ductiliteR(acc, dt, 0.1, 3), long = I.ductiliteR(acc, dt, 2, 3);
  assert.ok(court > 1.8 * 3 && court > long && Math.abs(long / 3 - 1) < 0.5, `μ(0,1 s) ${court}, μ(2 s) ${long}`);
});

test('méthode N2 (EN 1998-1:2004, annexe B) et règles R-μ-T', () => {
  const g = 9.81, de = 0.8 * g * (0.3 / (2 * Math.PI)) ** 2;
  // T* < TC et qu = 4 : d*t = (d*e/qu)(1 + (qu − 1)TC/T*) = 1,5·d*e
  const a = I.n2({ T: 0.3, saY: 0.2 * g, se: 0.8 * g, TC: 0.5 });
  proche(a.qu, 4, 1e-12); proche(a.de, de, 1e-15); proche(a.dt, 1.5 * de, 1e-15); assert.equal(a.regle, 'périodes courtes');
  proche(a.mu, a.dt / a.dy, 1e-12);
  // réponse élastique (Fy*/m* ≥ Se) et périodes longues : d*t = d*e
  assert.equal(I.n2({ T: 0.3, saY: 0.9 * g, se: 0.8 * g, TC: 0.5 }).regle, 'élastique');
  const b = I.n2({ T: 1, saY: 0.1 * g, se: 0.4 * g, TC: 0.5 });
  proche(b.dt, b.de, 1e-15); assert.equal(b.regle, 'égaux déplacements');
  // plancher d*t ≥ d*e et continuité de la règle en TC
  assert.ok(I.n2({ T: 0.49, saY: 0.79 * g, se: 0.8 * g, TC: 0.5 }).dt >= I.n2({ T: 0.49, saY: 0.79 * g, se: 0.8 * g, TC: 0.5 }).de);
  proche(I.regles.n2(4, 0.5, 0.5), 4, 1e-12); proche(I.regles.n2(4, 0.25, 0.5), 7, 1e-12);
  proche(I.regles.energies(3), 5, 1e-12);
});
