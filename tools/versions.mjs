// tools/versions.mjs — versions des fichiers du site, pour qu'un navigateur ne garde jamais un script périmé après une
// mise à jour. Les pages HTML ne sont pas gardées en cache, mais les scripts et les feuilles de style peuvent l'être
// plusieurs heures (réglages de cache du domaine) : une page neuve chargeait alors d'anciens modules. Chaque fichier
// reçoit une empreinte de son contenu (?v=…, 10 caractères de SHA-256) :
//   - les modules de src/ par une carte d'import (<script type="importmap">) en tête de chaque page, qui s'applique à
//     tous les imports, statiques, dynamiques ou en ligne ;
//   - les scripts d'entrée (<script type="module" src>) et les feuilles de style (<link rel="stylesheet">) dans leur
//     attribut.
// Un fichier inchangé garde son adresse (et son cache) ; un fichier modifié change d'adresse. À relancer après toute
// modification d'un script ou d'une feuille de style (npm run versions) ; tests/versions.test.mjs le vérifie.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const empreinte = chemin => createHash('sha256').update(readFileSync(join(RACINE, chemin))).digest('hex').slice(0, 10);
const posix = p => p.split(sep).join('/');

function modules(dossier = 'src') {
  const out = [];
  for (const nom of readdirSync(join(RACINE, dossier)).sort()) {
    const chemin = `${dossier}/${nom}`;
    if (statSync(join(RACINE, chemin)).isDirectory()) out.push(...modules(chemin));
    else if (nom.endsWith('.js')) out.push(posix(chemin));
  }
  return out;
}

const DEBUT = '<!-- versions des modules : produit par npm run versions (tools/versions.mjs), ne pas modifier à la main -->';
const BLOC = /<!-- versions des modules : [^>]*-->\n<script type="importmap">\n[\s\S]*?\n<\/script>\n/;

// Contenu attendu de chaque page qui charge des modules : { 'direct.html': '<!doctype html>…', … }.
export function pages() {
  const js = modules(), v = new Map(js.map(f => [f, empreinte(f)]));
  const carte = `{"imports": {\n${js.map(f => `  "./${f}": "./${f}?v=${v.get(f)}"`).join(',\n')}\n}}`;
  const bloc = `${DEBUT}\n<script type="importmap">\n${carte}\n</script>\n`;
  const out = {};
  for (const page of readdirSync(RACINE).filter(f => f.endsWith('.html')).sort()) {
    let html = readFileSync(join(RACINE, page), 'utf-8');
    if (!html.includes('type="module"')) continue;
    html = BLOC.test(html) ? html.replace(BLOC, bloc) : html.replace('</head>', `${bloc}</head>`);
    html = html.replace(/(<script type="module" src=")(src\/[^"?]+\.js)(\?v=[0-9a-f]+)?"/g, (m, a, f) => {
      if (!v.has(f)) throw new Error(`${page} : module inconnu ${f}`);
      return `${a}${f}?v=${v.get(f)}"`;
    });
    html = html.replace(/(<link rel="stylesheet" href=")([^":?]+\.css)(\?v=[0-9a-f]+)?"/g, (m, a, f) => `${a}${f}?v=${empreinte(f)}"`);
    out[page] = html;
  }
  return out;
}

if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  let n = 0;
  for (const [page, html] of Object.entries(pages())) {
    if (readFileSync(join(RACINE, page), 'utf-8') !== html) { writeFileSync(join(RACINE, page), html); n++; }
  }
  console.log(`versions : ${n} page${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour, ${modules().length} modules`);
}
