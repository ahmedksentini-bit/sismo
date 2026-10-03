// Calculateurs du chapitre 7 : spectre de réponse d'un accélérogramme synthétique (oscillateur à la période
// choisie, Newmark avec sous-pas) ; spectre élastique de l'EN 1998-1:2004 et période approchée T₁ = Ct·H^¾.
import { el, num, f, fd, brancher, garde } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Spectre from "./sismo/spectre.js";
import Oscillateur from "./sismo/oscillateur.js";
import Accelero from "./sismo/accelerogramme.js";

const G = Spectre.G, SOLS = ["A", "B", "C", "D", "E"];

// Tableau des valeurs recommandées, tiré du module (aucune valeur recopiée à la main).
{
  const t = el("tabEC8");
  if (t) t.innerHTML = `<thead><tr><th>Sol</th><th class="num">S (type 1)</th><th class="num">T<sub>B</sub></th><th class="num">T<sub>C</sub></th><th class="num">T<sub>D</sub></th><th class="num">S (type 2)</th><th class="num">T<sub>B</sub></th><th class="num">T<sub>C</sub></th><th class="num">T<sub>D</sub></th></tr></thead><tbody>${
    SOLS.map((s) => { const a = Spectre.EC8_2004[1][s], b = Spectre.EC8_2004[2][s]; return `<tr><td>${s}</td>${[a, b].map((p) => `<td class="n">${fd(p.S, 2)}</td><td class="n">${fd(p.TB, 2)} s</td><td class="n">${fd(p.TC, 2)} s</td><td class="n">${fd(p.TD, 1)} s</td>`).join("")}</tr>`; }).join("")
  }</tbody>`;
}

// ── Spectre de réponse d'un accélérogramme ───────────────────────────────
const TS = Spectre.periodes(90, 0.02, 4);
let cle = "", rec = null, cleS = "", spec = null;
const majSpectre = garde("spOut", () => {
  const M = num("spM"), R = num("spR"), T = num("spT"), xi = num("spXi");
  if (!(M >= 4.5 && M <= 8 && R >= 1 && R <= 200 && T >= 0.02 && T <= 4 && xi > 0 && xi < 1)) {
    el("spOut").textContent = "Mw de 4,5 à 8, distance de 1 à 200 km, période de 0,02 à 4 s, amortissement entre 0 et 1."; el("spFigA").innerHTML = el("spFigS").innerHTML = ""; return;
  }
  const c = `${M}|${R}`;
  if (c !== cle) { rec = Accelero.simuler({ M, R, graine: 7 }); cle = c; cleS = ""; }
  if (`${c}|${xi}` !== cleS) { spec = Spectre.reponse(rec.acc, rec.dt, TS, xi); cleS = `${c}|${xi}`; }
  // réponse de l'oscillateur choisi, sur la même discrétisation que le spectre
  const k = Spectre.sousPas(rec.dt, T), { x } = Oscillateur.integrer(Spectre.surEchantillonner(rec.acc, k), rec.dt / k, 1 / T, xi);
  let sd = 0, isd = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > sd) { sd = Math.abs(x[i]); isd = i; }
  const w = (2 * Math.PI) / T, sa = (w * w * sd) / G;
  let pga = 0;
  for (const v of rec.acc) pga = Math.max(pga, Math.abs(v));
  pga /= G;
  const duree = rec.acc.length * rec.dt, pas = Math.max(1, Math.floor(rec.acc.length / 900)), pasX = Math.max(1, Math.floor(x.length / 900));
  const ech = Math.max(pga, (w * w * sd) / G) * 1.15;
  el("spFigA").innerHTML = graphe({
    largeur: 560, hauteur: 230, xmin: 0, xmax: Math.ceil(duree), ymin: -ech, ymax: ech,
    xlabel: "temps (s)", ylabel: "accélération (g)",
    series: [
      { points: Array.from(rec.acc, (v, i) => [i * rec.dt, v / G]).filter((_, i) => i % pas === 0), couleur: COULEURS.discret, epaisseur: 1, libelle: `sol : PGA ${f(pga, 2)} g` },
      { points: Array.from(x, (v, i) => [(i * rec.dt) / k, (w * w * v) / G]).filter((_, i) => i % pasX === 0), couleur: COULEURS.bleu, epaisseur: 1.6, libelle: `oscillateur T = ${f(T, 2)} s : ω²·x` },
    ],
    marques: [{ x: (isd * rec.dt) / k, y: (w * w * x[isd]) / G, couleur: COULEURS.effort, libelle: `${f(sa, 2)} g` }],
  });
  const ec = (Tt) => Spectre.ec8(Tt, { type: M > 5.5 ? 1 : 2, sol: "A", ag: pga, xi });
  el("spFigS").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 0, xmax: 4, ymin: 0, ymax: Math.ceil(Math.max(...spec.Sa) / G * 12) / 10,
    xlabel: "période T (s)", ylabel: "pseudo-accélération Sa (g)",
    series: [
      { points: TS.map((t, i) => [t, spec.Sa[i] / G]), couleur: COULEURS.bleu, epaisseur: 2.4, libelle: `spectre de l'accélérogramme, ξ = ${fd(100 * xi, 0)} %` },
      { points: TS.map((t) => [t, ec(t)]), couleur: COULEURS.reaction, epaisseur: 1.8, tirets: "6 4", libelle: `forme EC8 sol A, type ${M > 5.5 ? 1 : 2}, calée sur le PGA` },
    ],
    marques: [{ x: T, y: sa, couleur: COULEURS.effort, guides: true, libelle: `T = ${f(T, 2)} s` }],
  });
  el("spOut").innerHTML = `Oscillateur T = ${f(T, 3)} s, ξ = ${fd(100 * xi, 0)} % : <strong>Sd = ${f(sd * 1000, 3)} mm</strong>, <strong>Sa = ω²·Sd = ${f(sa, 3)} g</strong> (${f(sa / pga, 2)} × PGA)
    <small>PGA ${f(pga, 2)} g ; maximum du spectre ${f(Math.max(...spec.Sa) / G, 2)} g à ${f(TS[spec.Sa.indexOf(Math.max(...spec.Sa))], 2)} s. Sous-pas : ${k} par pas de ${fd(rec.dt * 1000, 0)} ms.</small>`;
});
brancher(["spM", "spR", "spT", "spXi"], majSpectre);

// ── Spectre élastique de l'EN 1998-1:2004 ────────────────────────────────
const majEC8 = garde("ecOut", () => {
  const ag = num("ecAg"), type = Number(el("ecType").value), sol = el("ecSol").value, xi = num("ecXi") / 100, H = num("ecH"), sys = el("ecSys").value;
  if (!(ag > 0 && xi > 0 && H > 0)) { el("ecOut").textContent = "Saisir des valeurs positives."; el("ecFig").innerHTML = ""; return; }
  const p = Spectre.EC8_2004[type][sol], eta = Spectre.eta(xi), T1 = Spectre.periodeApprochee(H, sys), se1 = Spectre.ec8(T1, { type, sol, ag, xi });
  const Tg = Array.from({ length: 401 }, (_, i) => i * 0.01);
  const plateau = ag * p.S * eta * 2.5;
  el("ecFig").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0, xmax: 4, ymin: 0, ymax: Math.ceil(Math.max(...SOLS.map((s) => Spectre.ec8(0.3, { type, sol: s, ag, xi })), plateau) * 11) / 10,
    xlabel: "période T (s)", ylabel: "Se (g)",
    series: [
      ...SOLS.filter((s) => s !== sol).map((s) => ({ points: Tg.map((t) => [t, Spectre.ec8(t, { type, sol: s, ag, xi })]), couleur: "#cbd5e1", epaisseur: 1.2 })),
      { points: Tg.map((t) => [t, Spectre.ec8(t, { type, sol, ag, xi })]), couleur: COULEURS.bleu, epaisseur: 2.8, libelle: `sol ${sol}, type ${type}, ξ = ${fd(xi * 100, 0)} %` },
      { points: [], couleur: "#cbd5e1", epaisseur: 1.2, libelle: "autres sols" },
    ],
    marques: [{ x: T1, y: se1, couleur: COULEURS.effort, guides: true, libelle: `T₁ = ${f(T1, 2)} s` }],
  });
  const branche = T1 <= p.TB ? "montée" : T1 <= p.TC ? "plateau" : T1 <= p.TD ? "branche en 1/T" : "branche en 1/T²";
  el("ecOut").innerHTML = `S = ${fd(p.S, 2)}, T<sub>B</sub> = ${fd(p.TB, 2)} s, T<sub>C</sub> = ${fd(p.TC, 2)} s, T<sub>D</sub> = ${fd(p.TD, 1)} s, η = ${fd(eta, 3)} · plateau a<sub>g</sub>·S·η·2,5 = <strong>${f(plateau, 3)} g</strong> ·
    T<sub>1</sub> = ${fd(Spectre.CT[sys], 3)} × ${f(H, 3)}<sup>0,75</sup> = ${f(T1, 3)} s (${branche}) → <strong>S<sub>e</sub>(T<sub>1</sub>) = ${f(se1, 3)} g</strong>
    <small>Déplacement spectral S<sub>e</sub>·(T<sub>1</sub>/2π)² = ${f(se1 * G * (T1 / (2 * Math.PI)) ** 2 * 1000, 3)} mm.</small>`;
});
brancher(["ecAg", "ecType", "ecSol", "ecXi", "ecH", "ecSys"], majEC8);
