// Produit les banques data/exercices-chN.json à partir des modèles de
// src/exos : chaque exercice est tiré avec une graine fixe (dérivée de son
// identifiant), si bien que la banque est reproductible et que ses réponses
// sortent des mêmes solveurs que le cours et le bureau de calcul.
//
//   node tools/generer-exercices.mjs            → toutes les banques
//   node tools/generer-exercices.mjs ch6 ch11    → quelques chapitres
import { readFileSync, writeFileSync } from "node:fs";
import { creerAlea } from "../src/exos/alea.js";
import { MODELES, graineDe, controler } from "../src/exos/index.js";

const racine = new URL("../", import.meta.url);
const { chapitres } = JSON.parse(readFileSync(new URL("data/chapitres.json", racine), "utf8"));
const demandes = process.argv.slice(2);
let anomalies = 0;

for (const ch of chapitres) {
  if (!MODELES[ch.id] || (demandes.length && !demandes.includes(ch.id))) continue;
  const modeles = (await MODELES[ch.id]()).default;
  const exercices = modeles.map((m) => {
    const graine = graineDe(m.id);
    const r = m.generer(creerAlea(graine));
    const exo = { id: m.id, titre: m.titre, difficulte: m.difficulte, graine, ...r };
    for (const pb of controler(exo)) { anomalies++; console.error(`${m.id} : ${pb}`); }
    return exo;
  });
  if (exercices.length !== ch.exercices)
    console.warn(`${ch.id} : ${exercices.length} exercices, chapitres.json en annonce ${ch.exercices}`);
  writeFileSync(new URL(`data/exercices-${ch.id}.json`, racine), JSON.stringify({ chapitre: ch.id, exercices }, null, 1) + "\n");
  console.log(`${ch.id} : ${exercices.length} exercices, ${exercices.reduce((s, e) => s + e.questions.length, 0)} questions`);
}
if (anomalies) { console.error(`${anomalies} anomalie(s)`); process.exit(1); }
