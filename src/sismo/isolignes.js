// src/sismo/isolignes.js — isolignes d'un champ échantillonné sur une grille régulière (carrés marchants),
// interpolation linéaire sur les arêtes ; les cas de selle sont tranchés par la valeur au centre de la
// maille. Coordonnées rendues en indices de grille fractionnaires (i, j). Solveurs purs.
const Isolignes = (() => {
  'use strict';
  // v[j·nx + i] ; renvoie les segments [[i1, j1], [i2, j2]] de l'isoligne `niveau`.
  function segments(v, nx, ny, niveau) {
    const out = [], val = (i, j) => v[j * nx + i];
    // point de passage sur l'arête (a → b), a et b en indices
    const coupe = (ia, ja, ib, jb) => {
      const va = val(ia, ja), vb = val(ib, jb), t = (niveau - va) / (vb - va);
      return [ia + t * (ib - ia), ja + t * (jb - ja)];
    };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      // coins : 0 (i, j), 1 (i+1, j), 2 (i+1, j+1), 3 (i, j+1)
      const c = [val(i, j), val(i + 1, j), val(i + 1, j + 1), val(i, j + 1)];
      if (c.some(x => !Number.isFinite(x))) continue;
      const code = (c[0] >= niveau ? 1 : 0) | (c[1] >= niveau ? 2 : 0) | (c[2] >= niveau ? 4 : 0) | (c[3] >= niveau ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const bas = () => coupe(i, j, i + 1, j), droite = () => coupe(i + 1, j, i + 1, j + 1);
      const haut = () => coupe(i, j + 1, i + 1, j + 1), gauche = () => coupe(i, j, i, j + 1);
      const centre = (c[0] + c[1] + c[2] + c[3]) / 4 >= niveau;
      switch (code) {
        case 1: case 14: out.push([gauche(), bas()]); break;
        case 2: case 13: out.push([bas(), droite()]); break;
        case 3: case 12: out.push([gauche(), droite()]); break;
        case 4: case 11: out.push([droite(), haut()]); break;
        case 6: case 9: out.push([bas(), haut()]); break;
        case 7: case 8: out.push([gauche(), haut()]); break;
        case 5: // coins 0 et 2 au-dessus
          if (centre) { out.push([gauche(), haut()]); out.push([bas(), droite()]); } else { out.push([gauche(), bas()]); out.push([droite(), haut()]); }
          break;
        case 10: // coins 1 et 3 au-dessus
          if (centre) { out.push([gauche(), bas()]); out.push([droite(), haut()]); } else { out.push([gauche(), haut()]); out.push([bas(), droite()]); }
          break;
      }
    }
    return out;
  }
  // Niveaux « ronds » (1 ; 1,5 ; 2 ; 3 ; 5 ; 7 × 10ⁿ) strictement entre deux bornes, n au plus.
  function niveauxRonds(min, max, n = 6) {
    const tous = [];
    for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)); e++) for (const m of [1, 1.5, 2, 3, 5, 7]) { const v = +(m * Math.pow(10, e)).toPrecision(3); if (v > min && v < max) tous.push(v); }
    if (tous.length <= n) return tous;
    const k = Math.ceil(tous.length / n);
    return tous.filter((_, i) => i % k === 0);
  }
  return { segments, niveauxRonds };
})();
export default Isolignes;
