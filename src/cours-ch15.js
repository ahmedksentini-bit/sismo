// Calculateurs du chapitre 15 : modes propres d'une console de cisaillement ; forces latérales et analyse
// modale spectrale de l'EN 1998-1:2004 avec limitation des dommages et coefficient θ (module Batiment, vérifié
// contre OpenSeesPy).
import { el, num, f, fd, brancher, garde, verdict } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Batiment from "./sismo/batiment.js";
import Spectre from "./sismo/spectre.js";

const G = Spectre.G;
// Profils du banc « bâtiment » : multiplicateurs de masse et de raideur par étage i (0 = rez-de-chaussée).
const PROFILS = {
  regulier: { regulier: true, m: () => 1, k: () => 1 },
  degressif: { regulier: true, m: () => 1, k: (i, n) => (n > 1 ? 1 - (0.5 * i) / (n - 1) : 1) },
  souple: { regulier: false, m: () => 1, k: (i) => (i === 0 ? 0.4 : 1) },
  toiture: { regulier: false, m: (i, n) => (i === n - 1 && n > 1 ? 2.5 : 1), k: () => 1 },
};
const construire = (n, profil, masse, raideur) => {
  const p = PROFILS[profil], idx = Array.from({ length: n }, (_, i) => i);
  return { m: idx.map((i) => masse * p.m(i, n)), k: idx.map((i) => raideur * p.k(i, n)), h: idx.map(() => 3) };
};
const COUL = [COULEURS.bleu, COULEURS.effort, COULEURS.reaction];

// ── Modes propres ────────────────────────────────────────────────────────
const majModes = garde("mpOut", () => {
  const n = Math.round(num("mpN")), profil = el("mpProfil").value, masse = num("mpMasse"), raideur = num("mpK") * 1000;
  if (!(n >= 1 && n <= 30 && masse > 0 && raideur > 0 && PROFILS[profil])) { el("mpOut").textContent = "De 1 à 30 étages, masse et raideur positives."; el("mpFig").innerHTML = el("mpTab").innerHTML = ""; return; }
  const bat = construire(n, profil, masse, raideur), md = Batiment.modes(bat), z = Batiment.cotes(bat.h), H = z[n - 1];
  const nm = Math.min(3, n);
  el("mpFig").innerHTML = graphe({
    largeur: 420, hauteur: 360, xmin: -1.2, xmax: 1.2, ymin: 0, ymax: H, pasY: n > 8 ? 6 : 3,
    xlabel: "déformée modale (normée)", ylabel: "hauteur (m)",
    series: md.slice(0, nm).map((x, j) => { const mx = Math.max(...x.phi.map(Math.abs)); return { points: [[0, 0], ...x.phi.map((v, i) => [v / mx * Math.sign(x.phi[n - 1] || 1), z[i]])], couleur: COUL[j], epaisseur: 2.4, marqueurs: true, libelle: `mode ${j + 1} : T = ${f(x.T, 3)} s` }; }),
  });
  let cumul = 0;
  const lignes = md.slice(0, Math.min(6, n)).map((x, j) => { cumul += x.part; return `<tr><td>${j + 1}</td><td class="n">${f(x.T, 3)} s</td><td class="n">${fd(x.gamma, 3)}</td><td class="n">${fd(100 * x.part, 1)} %</td><td class="n">${fd(100 * cumul, 1)} %</td></tr>`; }).join("");
  el("mpTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>Mode</th><th class="num">T</th><th class="num">Γ (φ = 1 au sommet)</th><th class="num">masse effective</th><th class="num">cumul</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
  const ret = Batiment.modesRetenus(md), ind = Batiment.independants(md, ret.n);
  el("mpOut").innerHTML = `<strong>T<sub>1</sub> = ${f(md[0].T, 3)} s</strong> · modes à retenir (90 % et tous ceux de plus de 5 %) : <strong>${ret.n}</strong> (${fd(100 * ret.cumul, 1)} % de la masse) · combinaison ${ind ? "SRSS (périodes séparées)" : "CQC (périodes voisines)"}
    <small>Estimations : C<sub>t</sub>·H<sup>3/4</sup> = ${f(Spectre.periodeApprochee(H, "beton"), 3)} s (portique en béton) ; 2·√d = ${f(Batiment.periodeDeplacement(bat), 3)} s.</small>`;
});
brancher(["mpN", "mpProfil", "mpMasse", "mpK"], majModes);

// ── Forces latérales et analyse modale ───────────────────────────────────
const majAnalyse = garde("anOut", () => {
  const n = Math.round(num("anN")), profil = el("anProfil").value, ag = num("anAg"), sol = el("anSol").value, q = num("anQ");
  if (!(n >= 2 && n <= 30 && ag > 0 && q >= 1 && PROFILS[profil])) { el("anOut").textContent = "De 2 à 30 étages, ag positif, q ≥ 1."; el("anFig").innerHTML = el("anTab").innerHTML = ""; return; }
  const bat = construire(n, profil, 200, 2e5), md = Batiment.modes(bat), T1 = md[0].T, TC = Spectre.EC8_2004[1][sol].TC;
  const Sd = (T) => Spectre.ec8Calcul(T, { type: 1, sol, ag, q }) * G, M = bat.m.reduce((s, x) => s + x, 0);
  const fl = Batiment.forcesLaterales(bat, { T1, Sd: Sd(T1), TC }), flV = Batiment.statique(bat.k, fl.F);
  const ret = Batiment.modesRetenus(md), regle = Batiment.independants(md, ret.n) ? "srss" : "cqc", sp = Batiment.spectrale(bat, md, Sd, { n: ret.n, regle });
  const ver = Batiment.verifications(bat, sp, { q }), z = Batiment.cotes(bat.h);
  const etage = (V) => V.flatMap((v, i) => [[v, i * 3], [v, (i + 1) * 3]]);
  const permis = Batiment.forcesLateralesPermises(T1, TC) && PROFILS[profil].regulier;
  el("anFig").innerHTML = graphe({
    largeur: 420, hauteur: 340, xmin: 0, xmax: Math.ceil(Math.max(fl.Fb, sp.V[0]) * 1.1 / 100) * 100, ymin: 0, ymax: z[n - 1],
    xlabel: "effort tranchant d'étage (kN)", ylabel: "hauteur (m)",
    series: [
      { points: etage(flV.V), couleur: COULEURS.effort, epaisseur: 2, tirets: permis ? null : "6 4", libelle: `forces latérales${permis ? "" : " (hors domaine)"}` },
      { points: etage(sp.V), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: `analyse modale, ${ret.n} modes, ${regle.toUpperCase()}` },
    ],
  });
  const iT = ver.theta.indexOf(Math.max(...ver.theta)), iR = ver.ratio.indexOf(Math.max(...ver.ratio));
  el("anTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>Étage</th><th class="num">V modal</th><th class="num">d<sub>e</sub></th><th class="num">d<sub>r</sub> = q·d<sub>e</sub></th><th class="num">d<sub>r</sub>ν/h</th><th class="num">θ</th></tr></thead><tbody>${
    bat.m.map((_, i) => `<tr><td>${i + 1}</td><td class="n">${f(sp.V[i], 4)} kN</td><td class="n">${f(sp.d[i] * 1000, 3)} mm</td><td class="n">${f(ver.dr[i] * 1000, 3)} mm</td><td class="n">${fd(100 * ver.ratio[i], 2)} %</td><td class="n">${fd(ver.theta[i], 3)}</td></tr>`).reverse().join("")
  }</tbody></table></div>`;
  el("anOut").innerHTML = `T<sub>1</sub> = ${f(T1, 3)} s, S<sub>d</sub>(T<sub>1</sub>) = ${f(Sd(T1) / G, 3)} g · <strong>forces latérales F<sub>b</sub> = ${f(fl.Fb, 4)} kN</strong> (λ = ${fd(fl.lambda, 2)}${permis ? "" : ", méthode hors de son domaine"}) · <strong>analyse modale V<sub>base</sub> = ${f(sp.V[0], 4)} kN</strong>
    · d<sub>r</sub>ν/h maximal ${fd(100 * ver.ratio[iR], 2)} % (étage ${iR + 1}) ${verdict(ver.ratio[iR] <= 0.005, "≤ 0,5 %", "> 0,5 %")} · θ maximal ${fd(ver.theta[iT], 3)} ${verdict(ver.theta[iT] <= 0.1, "≤ 0,10", "> 0,10")}
    <small>Masse totale ${f(M, 4)} t ; ν = 0,5.</small>`;
});
brancher(["anN", "anProfil", "anAg", "anSol", "anQ"], majAnalyse);
