// Calculateurs du chapitre 7 : spectre de réponse d'un accélérogramme synthétique (oscillateur à la période
// choisie, Newmark avec sous-pas) ; spectre élastique de l'EN 1998-1:2004 et période approchée T₁ = Ct·H^¾.
import { el, num, f, fd, brancher, garde, noter } from "./ui.js";
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
const majSpectre = garde("rsOut", () => {
  const M = num("rsM"), R = num("rsR"), T = num("rsT"), xi = num("rsXi");
  if (!(M >= 4.5 && M <= 8 && R >= 1 && R <= 200 && T >= 0.02 && T <= 4 && xi > 0 && xi < 1)) {
    el("rsOut").textContent = "Mw de 4,5 à 8, distance de 1 à 200 km, période de 0,02 à 4 s, amortissement entre 0 et 1."; el("rsFigA").innerHTML = el("rsFigS").innerHTML = ""; return;
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
  el("rsFigA").innerHTML = graphe({
    largeur: 560, hauteur: 230, xmin: 0, xmax: Math.ceil(duree), ymin: -ech, ymax: ech,
    xlabel: "temps (s)", ylabel: "accélération (g)",
    series: [
      { points: Array.from(rec.acc, (v, i) => [i * rec.dt, v / G]).filter((_, i) => i % pas === 0), couleur: COULEURS.discret, epaisseur: 1, libelle: `sol : PGA ${f(pga, 2)} g` },
      { points: Array.from(x, (v, i) => [(i * rec.dt) / k, (w * w * v) / G]).filter((_, i) => i % pasX === 0), couleur: COULEURS.bleu, epaisseur: 1.6, libelle: `oscillateur T = ${f(T, 2)} s : ω²·x` },
    ],
    marques: [{ x: (isd * rec.dt) / k, y: (w * w * x[isd]) / G, couleur: COULEURS.effort, libelle: `${f(sa, 2)} g` }],
  });
  const ec = (Tt) => Spectre.ec8(Tt, { type: M > 5.5 ? 1 : 2, sol: "A", ag: pga, xi });
  el("rsFigS").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 0, xmax: 4, ymin: 0, ymax: Math.ceil(Math.max(...spec.Sa) / G * 12) / 10,
    xlabel: "période T (s)", ylabel: "pseudo-accélération Sa (g)",
    series: [
      { points: TS.map((t, i) => [t, spec.Sa[i] / G]), couleur: COULEURS.bleu, epaisseur: 2.4, libelle: `spectre de l'accélérogramme, ξ = ${fd(100 * xi, 0)} %` },
      { points: TS.map((t) => [t, ec(t)]), couleur: COULEURS.reaction, epaisseur: 1.8, tirets: "6 4", libelle: `forme EC8 sol A, type ${M > 5.5 ? 1 : 2}, calée sur le PGA` },
    ],
    marques: [{ x: T, y: sa, couleur: COULEURS.effort, guides: true, libelle: `T = ${f(T, 2)} s` }],
  });
  const ty = M > 5.5 ? 1 : 2, pA = Spectre.EC8_2004[ty].A, seT = ec(T);
  noter("calcSpectreNote", {
    donnees: [["Mw", fd(M, 1)], ["R", `${fd(R, 0)} km`], ["T", `${f(T, 3)} s`], ["ξ", `${fd(100 * xi, 0)} %`], ["accélérogramme", `simulé, pas Δt = ${fd(rec.dt * 1000, 0)} ms, ${f(duree, 3)} s`]],
    etapes: [
      { titre: "Accélération maximale du sol", formule: "PGA = max |a<sub>g</sub>(t)| / g", calcul: `PGA = <b>${f(pga, 3)} g</b>` },
      { titre: "Pulsation et sous-pas d'intégration", formule: "ω = 2π/T ; k = ⌈Δt / (T/20)⌉ sous-pas, a<sub>g</sub> interpolée linéairement", calcul: `ω = 2π/${f(T, 3)} = ${f(w, 4)} rad/s ; k = ⌈${fd(rec.dt, 3)} / ${f(T / 20, 3)}⌉ = <b>${k}</b>` },
      { titre: "Réponse de l'oscillateur (Newmark à accélération moyenne)", formule: "ẍ + 2ξωẋ + ω²x = −a<sub>g</sub>(t) ; Sd = max |x(t)|", calcul: `Sd = <b>${f(sd * 1000, 4)} mm</b>, atteint à t = ${fd((isd * rec.dt) / k, 2)} s` },
      { titre: "Pseudo-vitesse et pseudo-accélération", formule: "Sv = ω·Sd ; Sa = ω²·Sd", calcul: `Sv = ${f(w, 4)} × ${f(sd, 4)} = ${f(w * sd, 3)} m/s ; Sa = ${f(w * w, 4)} × ${f(sd, 4)} = ${f(w * w * sd, 4)} m/s² = <b>${f(sa, 3)} g</b>, soit ${f(sa / pga, 3)} × PGA` },
      { titre: `Forme de l'EN 1998-1:2004 calée sur le PGA (sol A, type ${ty})`, formule: "Se(T) : montée, plateau a<sub>g</sub>·S·η·2,5, puis T<sub>C</sub>/T et T<sub>C</sub>T<sub>D</sub>/T²",
        calcul: `S = ${fd(pA.S, 2)}, T<sub>B</sub> = ${fd(pA.TB, 2)} s, T<sub>C</sub> = ${fd(pA.TC, 2)} s, T<sub>D</sub> = ${fd(pA.TD, 1)} s, η = ${fd(Spectre.eta(xi), 3)} → Se(${f(T, 3)} s) = <b>${f(seT, 3)} g</b> (accélérogramme : ${f(sa, 3)} g)` },
    ],
  });
  el("rsOut").innerHTML = `Oscillateur T = ${f(T, 3)} s, ξ = ${fd(100 * xi, 0)} % : <strong>Sd = ${f(sd * 1000, 3)} mm</strong>, <strong>Sa = ω²·Sd = ${f(sa, 3)} g</strong> (${f(sa / pga, 2)} × PGA)
    <small>PGA ${f(pga, 2)} g ; maximum du spectre ${f(Math.max(...spec.Sa) / G, 2)} g à ${f(TS[spec.Sa.indexOf(Math.max(...spec.Sa))], 2)} s. Sous-pas : ${k} par pas de ${fd(rec.dt * 1000, 0)} ms.</small>`;
});
brancher(["rsM", "rsR", "rsT", "rsXi"], majSpectre);

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
  const formule = T1 <= p.TB ? ["Se = a<sub>g</sub>·S·(1 + T/T<sub>B</sub>·(2,5η − 1))", `${fd(ag, 3)} × ${fd(p.S, 2)} × (1 + ${f(T1, 3)}/${fd(p.TB, 2)} × (2,5 × ${fd(eta, 3)} − 1))`]
    : T1 <= p.TC ? ["Se = a<sub>g</sub>·S·η·2,5", `${fd(ag, 3)} × ${fd(p.S, 2)} × ${fd(eta, 3)} × 2,5`]
      : T1 <= p.TD ? ["Se = a<sub>g</sub>·S·η·2,5·T<sub>C</sub>/T", `${fd(ag, 3)} × ${fd(p.S, 2)} × ${fd(eta, 3)} × 2,5 × ${fd(p.TC, 2)}/${f(T1, 3)}`]
        : ["Se = a<sub>g</sub>·S·η·2,5·T<sub>C</sub>·T<sub>D</sub>/T²", `${fd(ag, 3)} × ${fd(p.S, 2)} × ${fd(eta, 3)} × 2,5 × ${fd(p.TC, 2)} × ${fd(p.TD, 1)}/${f(T1, 3)}²`];
  noter("calcEC8Note", {
    donnees: [["a<sub>g</sub>", `${fd(ag, 3)} g`], ["type", `${type}`], ["sol", sol], ["ξ", `${fd(100 * xi, 0)} %`], ["H", `${f(H, 3)} m`], ["structure", sys === "acier" ? "portique acier" : sys === "beton" ? "portique béton" : "autres"]],
    etapes: [
      { titre: "Paramètres du sol (EN 1998-1:2004, valeurs recommandées)", calcul: `S = ${fd(p.S, 2)} ; T<sub>B</sub> = ${fd(p.TB, 2)} s ; T<sub>C</sub> = ${fd(p.TC, 2)} s ; T<sub>D</sub> = ${fd(p.TD, 1)} s` },
      { titre: "Correction d'amortissement", formule: "η = √(10 / (5 + ξ)) ≥ 0,55 (ξ en %)", calcul: `η = √(10 / (5 + ${fd(100 * xi, 0)})) = <b>${fd(eta, 3)}</b>` },
      { titre: "Plateau", formule: "a<sub>g</sub>·S·η·2,5", calcul: `${fd(ag, 3)} × ${fd(p.S, 2)} × ${fd(eta, 3)} × 2,5 = <b>${f(plateau, 3)} g</b>` },
      { titre: "Période fondamentale approchée", formule: "T<sub>1</sub> = C<sub>t</sub>·H<sup>3/4</sup>", calcul: `T<sub>1</sub> = ${fd(Spectre.CT[sys], 3)} × ${f(H, 3)}<sup>0,75</sup> = <b>${f(T1, 3)} s</b> → ${branche}` },
      { titre: "Accélération spectrale à T<sub>1</sub>", formule: formule[0], calcul: `Se = ${formule[1]} = <b>${f(se1, 3)} g</b>` },
      { titre: "Déplacement spectral", formule: "Sd = Se·g·(T/2π)²", calcul: `Sd = ${f(se1, 3)} × 9,81 × (${f(T1, 3)}/2π)² = <b>${f(se1 * G * (T1 / (2 * Math.PI)) ** 2 * 1000, 3)} mm</b>` },
    ],
  });
  el("ecOut").innerHTML = `S = ${fd(p.S, 2)}, T<sub>B</sub> = ${fd(p.TB, 2)} s, T<sub>C</sub> = ${fd(p.TC, 2)} s, T<sub>D</sub> = ${fd(p.TD, 1)} s, η = ${fd(eta, 3)} · plateau a<sub>g</sub>·S·η·2,5 = <strong>${f(plateau, 3)} g</strong> ·
    T<sub>1</sub> = ${fd(Spectre.CT[sys], 3)} × ${f(H, 3)}<sup>0,75</sup> = ${f(T1, 3)} s (${branche}) → <strong>S<sub>e</sub>(T<sub>1</sub>) = ${f(se1, 3)} g</strong>
    <small>Déplacement spectral S<sub>e</sub>·(T<sub>1</sub>/2π)² = ${f(se1 * G * (T1 / (2 * Math.PI)) ** 2 * 1000, 3)} mm.</small>`;
});
brancher(["ecAg", "ecType", "ecSol", "ecXi", "ecH", "ecSys"], majEC8);
