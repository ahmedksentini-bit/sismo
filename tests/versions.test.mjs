// Versions des fichiers du site (tools/versions.mjs) : chaque page qui charge des modules porte une carte d'import à
// jour (empreinte du contenu de chaque module de src/), placée avant tout script de module, et ses scripts d'entrée et
// feuilles de style portent l'empreinte de leur contenu. Sans cela, un navigateur qui garde les scripts en cache
// exécute d'anciens modules sous une page neuve. Après toute modification d'un script ou d'une feuille de style :
// npm run versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pages } from '../tools/versions.mjs';

const RACINE = new URL('../', import.meta.url);

test('pages à jour : cartes d\'import, scripts d\'entrée et feuilles de style versionnés (sinon : npm run versions)', () => {
  const attendu = pages();
  assert.deepEqual(Object.keys(attendu), ['cours.html', 'direct.html', 'exerciseur.html', 'index.html', 'labo.html']);
  for (const [page, html] of Object.entries(attendu)) {
    assert.ok(readFileSync(new URL(page, RACINE), 'utf-8') === html, `${page} n'est pas à jour : lancer npm run versions`);
    const carte = /<script type="importmap">\n([\s\S]*?)\n<\/script>/.exec(html);
    assert.ok(carte && html.indexOf(carte[0]) < html.indexOf('<script type="module"'), `${page} : carte d'import avant les modules`);
    const imports = JSON.parse(carte[1]).imports;
    for (const [cle, val] of Object.entries(imports)) assert.match(val, new RegExp(`^${cle.replace(/[.?]/g, '\\$&')}\\?v=[0-9a-f]{10}$`));
    assert.ok(Object.keys(imports).includes('./src/sismo/direct.js'));
    assert.ok(!/<script type="module" src="src\/[^"?]+\.js"/.test(html) && !/<link rel="stylesheet" href="[^"?]+\.css"/.test(html), `${page} : adresse sans version`);
  }
});

test('un script d\'entrée n\'est importé par aucun module (un navigateur sans carte d\'import le chargerait deux fois)', () => {
  const entrees = new Set();
  for (const page of readdirSync(RACINE).filter(f => f.endsWith('.html'))) {
    for (const m of readFileSync(new URL(page, RACINE), 'utf-8').matchAll(/<script type="module" src="src\/([^"?]+\.js)/g)) entrees.add(m[1].split('/').pop());
  }
  const pile = ['src'], fautifs = [];
  while (pile.length) {
    const d = pile.pop();
    for (const e of readdirSync(new URL(`${d}/`, RACINE), { withFileTypes: true })) {
      if (e.isDirectory()) { pile.push(`${d}/${e.name}`); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = readFileSync(new URL(`${d}/${e.name}`, RACINE), 'utf-8');
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) if (entrees.has(m[1].split('/').pop())) fautifs.push(`${d}/${e.name} → ${m[1]}`);
    }
  }
  assert.deepEqual(fautifs, []);
});
