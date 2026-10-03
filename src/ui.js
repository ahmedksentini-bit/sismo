// Petites aides communes aux calculateurs du cours et à l'exerciseur (reprises du site de fondations).

export const el = (id) => document.getElementById(id);

/** Lecture d'un champ numérique : virgule acceptée, espaces ignorés. */
export function num(id, defaut = NaN) {
  const e = el(id);
  if (!e) return defaut;
  const v = parseFloat(String(e.value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : defaut;
}

/**
 * Tableau de nombres saisi ou collé depuis un tableur, une ligne par mesure :
 * séparateurs espace, tabulation ou point-virgule (virgule décimale alors
 * acceptée), ou virgule seule (CSV). Les lignes d'en-tête sont ignorées.
 */
export function lireTableau(texte) {
  return String(texte ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[A-Za-zÀ-ÿ#]/.test(l))
    .map((l) => {
      const champs = /[;\t]/.test(l) ? l.split(/[;\t]+/) : /\s/.test(l) ? l.split(/\s+/) : l.split(",");
      return champs.map((c) => parseFloat(c.trim().replace(",", ".")));
    })
    .filter((r) => r.length && Number.isFinite(r[0]));
}

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Nombre au format français, chiffres significatifs. */
export const f = (x, c = 3) => (Number.isFinite(x)
  ? Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: c })
  : "—");

/** Nombre au format français, décimales fixes. */
export const fd = (x, d = 2) => (Number.isFinite(x)
  ? Number(x).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })
  : "—");

/** Pastille de verdict. */
export const verdict = (ok, texteOk = "vérifié", texteKo = "non vérifié") =>
  ok === null || ok === undefined
    ? `<span class="verdict na">sans objet</span>`
    : `<span class="verdict ${ok ? "ok" : "ko"}">${ok ? "✓ " + texteOk : "✕ " + texteKo}</span>`;

/** Branche une fonction de mise à jour sur une liste de champs (saisie et changement). */
export function brancher(ids, maj) {
  for (const id of ids) {
    const e = el(id);
    if (!e) continue;
    e.addEventListener("input", maj);
    e.addEventListener("change", maj);
  }
  maj();
}

/** Affiche une panne dans la zone de résultat plutôt que de laisser un calcul muet. */
export function garde(idSortie, fn) {
  return () => {
    try { fn(); } catch (e) {
      const s = el(idSortie);
      if (s) s.innerHTML = `<span class="verdict ko">calcul impossible</span> <small>${esc(e.message)}</small>`;
      console.error(e);
    }
  };
}
