// Mode impression du cours (cours.html?impression=1), utilisé par
// tools/polycopie.py : une fois les calculateurs exécutés, chaque champ de
// saisie est remplacé par sa valeur. Sur papier, un menu déroulant ou un
// curseur n'a pas de sens ; la valeur qu'il porte, si.

const SVG = "http://www.w3.org/2000/svg";

/**
 * Motifs de sol en vecteurs. Chrome imprime un <pattern> SVG en image : un
 * polycopié plein de coupes de terrain pesait trois fois plus lourd, et ses
 * hachures devenaient floues au zoom. Chaque remplissage par motif est donc
 * redessiné en tracés, répétés sur l'étendue de la forme et découpés par elle
 * — les hachures restent nettes, et distinguent les sols sur une copie en noir
 * et blanc, où les couleurs ne le font plus.
 */
function motifsEnVecteurs() {
  let n = 0;
  for (const forme of [...document.querySelectorAll('svg [fill^="url(#"]')]) {
    const svg = forme.ownerSVGElement, id = forme.getAttribute("fill").slice(5, -1);
    const motif = svg?.querySelector(`pattern[id="${CSS.escape(id)}"]`);
    if (!motif || motif.getAttribute("patternUnits") !== "userSpaceOnUse") continue;
    const w = Number(motif.getAttribute("width")), h = Number(motif.getAttribute("height"));
    let b;
    try { b = forme.getBBox(); } catch { continue; }
    if (!(w > 0 && h > 0 && b.width > 0 && b.height > 0)) continue;
    // Étendue à couvrir, dans le repère du motif (tourné pour le béton hachuré).
    const tr = motif.getAttribute("patternTransform") ?? "";
    const a = ((Number(/rotate\(([-\d.]+)/.exec(tr)?.[1]) || 0) * Math.PI) / 180;
    const coins = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => [x * Math.cos(a) + y * Math.sin(a), -x * Math.sin(a) + y * Math.cos(a)]);
    const i0 = Math.floor(Math.min(...coins.map((c) => c[0])) / w) - 1, i1 = Math.ceil(Math.max(...coins.map((c) => c[0])) / w) + 1;
    const j0 = Math.floor(Math.min(...coins.map((c) => c[1])) / h) - 1, j1 = Math.ceil(Math.max(...coins.map((c) => c[1])) / h) + 1;
    if ((i1 - i0) * (j1 - j0) > 40000) continue;
    const clip = document.createElementNS(SVG, "clipPath");
    clip.id = `motif-imprime-${n++}`;
    const gabarit = forme.cloneNode();
    for (const att of ["fill", "opacity", "stroke"]) gabarit.removeAttribute(att);
    clip.appendChild(gabarit);
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("clip-path", `url(#${clip.id})`);
    if (forme.getAttribute("opacity")) g.setAttribute("opacity", forme.getAttribute("opacity"));
    const tuiles = document.createElementNS(SVG, "g");
    if (tr) tuiles.setAttribute("transform", tr);
    for (const e of motif.children) {
      let d = "";
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
        const tx = i * w, ty = j * h;
        if (e.tagName === "circle") {
          const cx = Number(e.getAttribute("cx")) + tx, cy = Number(e.getAttribute("cy")) + ty, r = Number(e.getAttribute("r"));
          d += `M${(cx + r).toFixed(2)} ${cy.toFixed(2)}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0`;
        } else if (e.tagName === "path") {
          // Les motifs n'emploient que des M absolus suivis de commandes relatives.
          d += e.getAttribute("d").replace(/M\s*([-\d.]+)[\s,]+([-\d.]+)/g, (_, x, y) => `M${(Number(x) + tx).toFixed(2)} ${(Number(y) + ty).toFixed(2)}`);
        }
      }
      if (!d) continue;
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", d);
      for (const att of ["fill", "stroke", "stroke-width", "opacity"]) if (e.getAttribute(att)) p.setAttribute(att, e.getAttribute(att));
      if (e.tagName === "path" && !e.getAttribute("fill")) p.setAttribute("fill", "none");
      tuiles.appendChild(p);
    }
    g.appendChild(tuiles);
    (svg.querySelector("defs") ?? svg).appendChild(clip);
    forme.replaceWith(g);
  }
}

if (new URLSearchParams(location.search).has("impression")) {
  document.documentElement.classList.add("impression");
  window.addEventListener("load", () => setTimeout(() => {
    motifsEnVecteurs();
    // Les réglettes de calcul en direct doublent leur case : seule la case s'imprime.
    for (const r of document.querySelectorAll(".curseur")) r.remove();
    // Un tableau de relevés s'imprime tel quel, en chasse fixe.
    for (const zone of document.querySelectorAll(".calc textarea")) {
      const pre = document.createElement("pre");
      pre.className = "valeur-imprimee releves-imprimes";
      pre.textContent = zone.value.trim() || "—";
      zone.replaceWith(pre);
    }
    for (const champ of document.querySelectorAll(".calc input, .calc select")) {
      const wrap = champ.closest(".input-wrap");
      const u = wrap?.querySelector(".unit")?.textContent.trim() ?? "";
      const unite = u === "—" ? "" : u;
      const valeur = champ.tagName === "SELECT" ? champ.options[champ.selectedIndex]?.text ?? "" : champ.value;
      // Un curseur affiche déjà sa valeur dans son étiquette d'unité (« 30° »).
      const texte = champ.type === "range" ? (unite || valeur) : !String(valeur).trim() ? "—" : unite ? `${valeur} ${unite}` : valeur;
      const span = document.createElement("span");
      span.className = "valeur-imprimee";
      span.textContent = texte;
      (wrap && wrap.querySelectorAll("input, select").length === 1 ? wrap : champ).replaceWith(span);
    }
  }, 600));
}
