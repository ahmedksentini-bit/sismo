// Calculateur du chapitre 16 : poussée progressive d'une console de cisaillement à étages élastiques
// parfaitement plastiques (profils modal et uniforme), méthode N2 de l'annexe B de l'EN 1998-1:2004, format
// accélération–déplacement (module Poussee, vérifié contre OpenSeesPy).
import { el, num, f, fd, brancher, garde, noter } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Poussee from "./sismo/poussee.js";
import Batiment from "./sismo/batiment.js";
import Spectre from "./sismo/spectre.js";

const G = Spectre.G;
// Mêmes bâtiments que le banc « poussée » : rez souple et faible (raideur × 0,5, résistance × 0,6), toiture × 2,5.
function batiment({ n, profil, ag, sol, q, omega }) {
  const idx = Array.from({ length: n }, (_, i) => i);
  const b = {
    m: idx.map((i) => 200 * (profil === "toiture" && i === n - 1 && n > 1 ? 2.5 : 1)),
    k: idx.map((i) => 2e5 * (profil === "souple" && i === 0 ? 0.5 : 1)),
    h: idx.map(() => 3),
  };
  const Sd = (T) => Spectre.ec8Calcul(T, { type: 1, sol, ag, q }) * G;
  b.Vy = Poussee.resistances(b, Sd, { omega }).map((v, i) => (profil === "souple" && i === 0 ? 0.6 : 1) * v);
  return b;
}

const majPoussee = garde("puOut", () => {
  const r = { n: Math.round(num("puN")), profil: el("puProfil").value, ag: num("puAg"), sol: el("puSol").value, q: num("puQ"), omega: num("puOmega") };
  if (!(r.n >= 2 && r.n <= 20 && r.ag > 0 && r.q >= 1 && r.omega >= 1)) { el("puOut").textContent = "De 2 à 20 étages, ag positif, q et ω au moins égaux à 1."; el("puFig").innerHTML = el("puTab").innerHTML = ""; return; }
  const bat = batiment(r), md = Batiment.modes(bat), TC = Spectre.EC8_2004[1][r.sol].TC, se = (T) => Spectre.ec8(T, { type: 1, sol: r.sol, ag: r.ag }) * G;
  const cas = [["modal", md[0].phi, COULEURS.bleu], ["uniforme", bat.m.map(() => 1), COULEURS.effort]].map(([nom, phi, couleur]) => ({ nom, couleur, ...Poussee.n2(bat, phi, { se, TC }) }));
  const dmax = Math.max(...cas.map((c) => c.dt)) * 1.4, Vmax = Math.max(...cas.map((c) => c.cap.Fb)) * 1.15;
  const courbe = (c) => [[0, 0], [c.cap.dy * 1000, c.cap.Fb], [dmax * 1000, c.cap.Fb]];
  const Tg = Array.from({ length: 200 }, (_, i) => 0.02 + i * 0.02);
  const sdMax = Math.max(...cas.map((c) => c.dtEtoile)) * 1.5;
  el("puFig").innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${graphe({
    largeur: 300, hauteur: 300, xmin: 0, xmax: Math.ceil(dmax * 1000 / 10) * 10, ymin: 0, ymax: Math.ceil(Vmax / 100) * 100,
    xlabel: "déplacement en tête (mm)", ylabel: "effort à la base (kN)",
    series: cas.map((c) => ({ points: courbe(c), couleur: c.couleur, epaisseur: 2.4, libelle: `${c.nom} (étage ${c.cap.critique + 1})` })),
    marques: cas.map((c) => ({ x: c.dt * 1000, y: c.cap.effort(c.dt), couleur: c.couleur, libelle: `d_t = ${f(c.dt * 1000, 3)} mm` })),
  })}${graphe({
    largeur: 300, hauteur: 300, xmin: 0, xmax: Math.ceil(sdMax * 1000 / 10) * 10, ymin: 0, ymax: Math.ceil(Math.max(...Tg.map((t) => se(t))) / G * 11) / 10,
    xlabel: "déplacement spectral (mm)", ylabel: "accélération spectrale (g)",
    series: [
      { points: Tg.map((t) => [se(t) * (t / (2 * Math.PI)) ** 2 * 1000, se(t) / G]), couleur: COULEURS.encre, epaisseur: 2, libelle: "demande Se" },
      ...cas.map((c) => ({ points: [[0, 0], [c.dy * 1000, c.Fy / c.mEtoile / G], [sdMax * 1000, c.Fy / c.mEtoile / G]], couleur: c.couleur, epaisseur: 2, tirets: "6 4", libelle: `capacité, ${c.nom}` })),
    ],
    marques: cas.map((c) => ({ x: c.dtEtoile * 1000, y: c.Fy / c.mEtoile / G, couleur: c.couleur })),
  })}</div>`;
  const ligne = (lib, fn) => `<tr><td>${lib}</td>${cas.map((c) => `<td class="n">${fn(c)}</td>`).join("")}</tr>`;
  el("puTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>Méthode N2 (annexe B)</th><th class="num">modal</th><th class="num">uniforme</th></tr></thead><tbody>
    ${ligne("étage critique (mécanisme)", (c) => c.cap.critique + 1)}
    ${ligne("m* ; Γ", (c) => `${f(c.mEtoile, 4)} t ; ${fd(c.gamma, 3)}`)}
    ${ligne("F*<sub>y</sub> ; d*<sub>y</sub>", (c) => `${f(c.Fy, 4)} kN ; ${f(c.dy * 1000, 3)} mm`)}
    ${ligne("T* ; S<sub>e</sub>(T*)", (c) => `${f(c.T, 3)} s ; ${f(c.se / G, 3)} g`)}
    ${ligne("q<sub>u</sub> ; règle", (c) => `${fd(c.qu, 2)} ; ${c.regle}`)}
    ${ligne("d*<sub>t</sub> ; d<sub>t</sub> = Γ·d*<sub>t</sub>", (c) => `${f(c.dtEtoile * 1000, 3)} ; <strong>${f(c.dt * 1000, 3)} mm</strong>`)}
    ${ligne("glissements d'étage à d<sub>t</sub> (mm, du bas vers le haut)", (c) => c.glissements.map((g) => f(g * 1000, 2)).join(" · "))}
  </tbody></table></div>`;
  const c0 = cas[0], phi = md[0].phi, smp = bat.m.reduce((a1, x, i) => a1 + x * phi[i], 0), smp2 = bat.m.reduce((a1, x, i) => a1 + x * phi[i] ** 2, 0);
  const de = c0.se * (c0.T / (2 * Math.PI)) ** 2;
  noter("calcPousseeNote", {
    donnees: [["étages", `${r.n} de 3 m, 200 t, 2·10⁵ kN/m`], ["profil", el("puProfil").selectedOptions[0]?.textContent || r.profil], ["a<sub>g</sub>", `${fd(r.ag, 3)} g`], ["sol", `${r.sol} (T<sub>C</sub> = ${fd(TC, 2)} s)`], ["q, ω", `${fd(r.q, 2)} ; ${fd(r.omega, 2)}`]],
    etapes: [
      { titre: "Système équivalent (répartition modale, φ normée au sommet)", formule: "m* = Σ m<sub>i</sub>φ<sub>i</sub> ; Γ = m* / Σ m<sub>i</sub>φ<sub>i</sub>²", calcul: `m* = <b>${f(smp, 4)} t</b> ; Γ = ${f(smp, 4)} / ${f(smp2, 4)} = <b>${fd(c0.gamma, 4)}</b>` },
      { titre: "Courbe de capacité du bâtiment", formule: "mécanisme à l'étage où V<sub>y,i</sub>/S<sub>i</sub> est minimal ; F<sub>b,y</sub> et d<sub>y</sub> au sommet", calcul: `étage critique ${c0.cap.critique + 1} ; F<sub>b,y</sub> = <b>${f(c0.cap.Fb, 4)} kN</b> à d<sub>y</sub> = ${f(c0.cap.dy * 1000, 3)} mm` },
      { titre: "Capacité du système équivalent (idéalisation à aires égales, exacte ici)", formule: "F*<sub>y</sub> = F<sub>b,y</sub>/Γ ; d*<sub>y</sub> = d<sub>y</sub>/Γ", calcul: `F*<sub>y</sub> = ${f(c0.cap.Fb, 4)} / ${fd(c0.gamma, 4)} = <b>${f(c0.Fy, 4)} kN</b> ; d*<sub>y</sub> = <b>${f(c0.dy * 1000, 4)} mm</b>` },
      { titre: "Période du système équivalent", formule: "T* = 2π·√(m*·d*<sub>y</sub> / F*<sub>y</sub>)", calcul: `T* = 2π × √(${f(c0.mEtoile, 4)} × ${f(c0.dy, 4)} / ${f(c0.Fy, 4)}) = <b>${f(c0.T, 3)} s</b>` },
      { titre: "Déplacement élastique demandé", formule: "d*<sub>et</sub> = S<sub>e</sub>(T*)·(T*/2π)²", calcul: `S<sub>e</sub>(T*) = ${f(c0.se / G, 3)} g ; d*<sub>et</sub> = ${f(c0.se, 4)} × (${f(c0.T, 3)}/2π)² = <b>${f(de * 1000, 4)} mm</b>` },
      { titre: "Déplacement cible du système équivalent (annexe B)", formule: "q<sub>u</sub> = S<sub>e</sub>(T*)·m*/F*<sub>y</sub> ; si T* ≥ T<sub>C</sub> : d*<sub>t</sub> = d*<sub>et</sub> ; sinon d*<sub>t</sub> = d*<sub>et</sub>/q<sub>u</sub>·(1 + (q<sub>u</sub> − 1)·T<sub>C</sub>/T*) ≥ d*<sub>et</sub>",
        calcul: `q<sub>u</sub> = <b>${fd(c0.qu, 3)}</b> (${c0.regle}) → d*<sub>t</sub> = <b>${f(c0.dtEtoile * 1000, 4)} mm</b>` },
      { titre: "Déplacement cible du bâtiment", formule: "d<sub>t</sub> = Γ·d*<sub>t</sub>", calcul: `d<sub>t</sub> = ${fd(c0.gamma, 4)} × ${f(c0.dtEtoile * 1000, 4)} = <b>${f(c0.dt * 1000, 4)} mm</b> ; répartition uniforme : ${f(cas[1].dt * 1000, 4)} mm` },
    ],
  });
  const pire = cas.reduce((a, c) => (Math.max(...c.glissements) > Math.max(...a.glissements) ? c : a));
  const g = Math.max(...pire.glissements), i = pire.glissements.indexOf(g);
  el("puOut").innerHTML = `Déplacements cibles : <strong>${f(cas[0].dt * 1000, 3)} mm</strong> (modal) et <strong>${f(cas[1].dt * 1000, 3)} mm</strong> (uniforme) ·
    glissement d'étage le plus fort : <strong>${f(g * 1000, 3)} mm à l'étage ${i + 1}</strong> (${fd((100 * g) / 3, 2)} % de la hauteur, répartition ${pire.nom})
    <small>T₁ élastique = ${f(md[0].T, 3)} s, T<sub>C</sub> = ${fd(TC, 2)} s. Dans une console à étages élastiques parfaitement plastiques, l'idéalisation à aires égales est exacte.</small>`;
});
brancher(["puN", "puProfil", "puAg", "puSol", "puQ", "puOmega"], majPoussee);
