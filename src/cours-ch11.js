// Calculateurs du chapitre 11 : indicateurs d'un accélérogramme synthétique (Arias, Husid, D5–95, CAV) ;
// calage de sept accélérogrammes sur le spectre de l'EN 1998-1:2004 et vérification des règles du
// § 3.2.3.1.2 (4) (Selection.verifierEC8).
import { el, num, f, fd, brancher, garde, verdict } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Accelero from "./sismo/accelerogramme.js";
import Intensite from "./sismo/intensite.js";
import Spectre from "./sismo/spectre.js";
import Selection from "./sismo/selection.js";

const G = Spectre.G;

// ── Indicateurs d'un accélérogramme ──────────────────────────────────────
const majAccelero = garde("acOut", () => {
  const M = num("acM"), R = num("acR");
  if (!(M >= 4.5 && M <= 8 && R >= 1 && R <= 200)) { el("acOut").textContent = "Mw de 4,5 à 8, distance de 1 à 200 km."; el("acFig").innerHTML = ""; return; }
  const rec = Accelero.simuler({ M, R, graine: 7 }), ind = Intensite.indicateurs(rec.acc, rec.dt), n = rec.acc.length, pas = Math.max(1, Math.floor(n / 900));
  const duree = n * rec.dt, pga = ind.pga / G;
  el("acFig").innerHTML = graphe({
    largeur: 560, hauteur: 220, xmin: 0, xmax: Math.ceil(duree), ymin: -Math.ceil(pga * 12) / 10, ymax: Math.ceil(pga * 12) / 10,
    xlabel: "temps (s)", ylabel: "accélération (g)",
    zones: [{ x0: ind.t5, x1: ind.t95, y0: -1, y1: 1, couleur: COULEURS.bleu, opacite: 0.1, libelle: "D5–95" }],
    series: [{ points: Array.from(rec.acc, (v, i) => [i * rec.dt, v / G]).filter((_, i) => i % pas === 0), couleur: COULEURS.encre, epaisseur: 1 }],
  }) + graphe({
    largeur: 560, hauteur: 200, xmin: 0, xmax: Math.ceil(duree), ymin: 0, ymax: 1,
    xlabel: "temps (s)", ylabel: "Arias cumulée / Ia",
    series: [{ points: Array.from(ind.husid, (v, i) => [i * rec.dt, v]).filter((_, i) => i % pas === 0), couleur: COULEURS.bleu, epaisseur: 2.4, libelle: "courbe de Husid" },
      { points: [[ind.t5, 0.05], [ind.t95, 0.95]], couleur: COULEURS.effort, nuage: true, rayon: 4.5, libelle: "5 % et 95 %" }],
  });
  el("acOut").innerHTML = `PGA ${f(pga, 3)} g · PGV ${f(ind.pgv * 100, 3)} cm/s · <strong>I<sub>a</sub> = ${f(ind.arias, 3)} m/s</strong> · <strong>D<sub>5–95</sub> = ${fd(ind.d595, 1)} s</strong> · CAV = ${f(ind.cav, 3)} m/s
    <small>La durée de la source (1/f<sub>a</sub>) et celle du trajet (0,05·R) s'ajoutent : D<sub>5–95</sub> s'allonge avec la magnitude et la distance.</small>`;
});
brancher(["acM", "acR"], majAccelero);

// ── Caler sept accélérogrammes ───────────────────────────────────────────
const T = Spectre.periodes(60, 0.05, 4);
let cle = "", recs = null;
const majCalage = garde("caResultat", () => {
  const M = num("caM"), R = num("caR"), ag = num("caAg"), sol = el("caSol").value, T1 = num("caT1"), commun = el("caCommun").value === "oui";
  if (!(M >= 5 && M <= 8 && R >= 1 && R <= 150 && ag > 0 && T1 >= 0.1 && T1 <= 2)) { el("caResultat").textContent = "Mw de 5 à 8, distance de 1 à 150 km, ag positif, T1 de 0,1 à 2 s."; el("caFigure").innerHTML = el("caTab").innerHTML = ""; return; }
  const c = `${M}|${R}`;
  if (c !== cle) { recs = Array.from({ length: 7 }, (_, k) => { const rec = Accelero.simuler({ M, R, graine: 101 + k }), sp = Accelero.spectre(rec, T); return { Sa: sp.Sa, pga: sp.pga }; }); cle = c; }
  const p = Spectre.EC8_2004[1][sol], Se = T.map((t) => Spectre.ec8(t, { type: 1, sol, ag })), ln = Se.map(Math.log), idx = Selection.plage(T, 0.2 * T1, 2 * T1);
  const indiv = recs.map((r) => { const s = Selection.facteur(r.Sa, ln, idx); return { s, Sa: r.Sa.map((v) => v * s), pga: r.pga * s }; });
  const v0 = Selection.verifierEC8(indiv, T, Se, ag * p.S, T1), k = commun ? v0.facteurConformite : 1;
  const jeu = indiv.map((r) => ({ s: r.s * k, Sa: r.Sa.map((x) => x * k), pga: r.pga * k })), v = Selection.verifierEC8(jeu, T, Se, ag * p.S, T1);
  const ymax = Math.ceil(Math.max(...Se, ...jeu.flatMap((r) => r.Sa)) * 10) / 10;
  el("caFigure").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0, xmax: 4, ymin: 0, ymax,
    xlabel: "période T (s)", ylabel: "Sa (g), ξ = 5 %",
    zones: [{ x0: 0.2 * T1, x1: 2 * T1, y0: 0, y1: ymax, couleur: COULEURS.bleu, opacite: 0.07, libelle: "0,2·T₁ à 2·T₁" }],
    series: [
      ...jeu.map((r, i) => ({ points: T.map((t, j) => [t, r.Sa[j]]), couleur: "#94a3b8", epaisseur: 1, libelle: i === 0 ? "accélérogrammes calés" : undefined })),
      { points: T.map((t, j) => [t, Se[j]]), couleur: COULEURS.encre, epaisseur: 2.2, libelle: `Se, sol ${sol}` },
      { points: T.map((t, j) => [t, 0.9 * Se[j]]), couleur: COULEURS.encre, epaisseur: 1.2, tirets: "5 4", libelle: "0,9·Se" },
      { points: T.map((t, j) => [t, v.moyenne[j]]), couleur: COULEURS.effort, epaisseur: 2.6, libelle: "moyenne du jeu" },
    ],
  });
  el("caTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>Règle (EN 1998-1:2004)</th><th class="num">valeur</th><th>verdict</th></tr></thead><tbody>
    <tr><td>au moins 3 accélérogrammes</td><td class="n">${v.regles.nombre.valeur}</td><td>${verdict(v.regles.nombre.ok)}</td></tr>
    <tr><td>PGA moyen ≥ a<sub>g</sub>·S = ${f(ag * p.S, 3)} g</td><td class="n">${f(v.pgaMoyen, 3)} g</td><td>${verdict(v.regles.pga.ok)}</td></tr>
    <tr><td>moyenne ≥ 0,9·S<sub>e</sub> de ${fd(0.2 * T1, 2)} à ${fd(2 * T1, 2)} s</td><td class="n">${fd(100 * 0.9 * v.regles.spectre.rapportMin, 0)} % de S<sub>e</sub> à ${fd(v.regles.spectre.Tpire, 2)} s</td><td>${verdict(v.regles.spectre.ok)}</td></tr>
  </tbody></table></div>`;
  el("caResultat").innerHTML = `Facteurs individuels ${jeu.map((r) => fd(r.s, 2)).join(" ; ")}${commun ? ` (dont le facteur commun ${fd(k, 3)})` : ""} ·
    <strong>${v.conforme ? "jeu conforme" : `jeu non conforme : facteur commun nécessaire ${fd(v0.facteurConformite, 3)}`}</strong> · réponse à retenir : ${v.reponse} (7 calculs)
    <small>${jeu.some((r) => r.s > 4 || r.s < 0.25) ? "Un facteur sort de 0,25 à 4 : mieux vaudrait un autre enregistrement." : "Tous les facteurs restent entre 0,25 et 4."}</small>`;
});
brancher(["caM", "caR", "caAg", "caSol", "caT1", "caCommun"], majCalage);
