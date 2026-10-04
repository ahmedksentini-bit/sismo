// Calculateurs du chapitre 15 : modes propres d'une console de cisaillement ; forces latérales et analyse
// modale spectrale de l'EN 1998-1:2004 avec limitation des dommages et coefficient θ (module Batiment, vérifié
// contre OpenSeesPy).
import { el, num, f, fd, brancher, garde, verdict, noter } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Batiment from "./sismo/batiment.js";
import Spectre from "./sismo/spectre.js";
import { consoleModele, forcesEtages } from "./schemas-notes.js";

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
  const ret = Batiment.modesRetenus(md), ind = Batiment.independants(md, ret.n), m1 = md[0], Mt = bat.m.reduce((a1, x) => a1 + x, 0);
  const smp = bat.m.reduce((a1, x, i) => a1 + x * m1.phi[i], 0), smp2 = bat.m.reduce((a1, x, i) => a1 + x * m1.phi[i] ** 2, 0), court = n <= 6;
  noter("calcModesNote", {
    donnees: [["étages", `${n} de 3 m`], ["profil", el("mpProfil").selectedOptions[0]?.textContent || profil], ["masse", `${f(masse, 4)} t par étage (×profil)`], ["raideur", `${f(raideur, 4)} kN/m par étage (×profil)`]],
    etapes: [
      { titre: "Matrices de masse et de rigidité", formule: "M = diag(m<sub>i</sub>) ; K<sub>ii</sub> = k<sub>i</sub> + k<sub>i+1</sub>, K<sub>i,i+1</sub> = −k<sub>i+1</sub> (console de cisaillement)", calcul: `masse totale M = <b>${f(Mt, 4)} t</b>`,
        schema: consoleModele({ m: bat.m, k: bat.k }),
        legende: "Planchers rigides, poteaux souples : chaque étage se réduit à une masse et à un ressort de cisaillement. La masse m<sub>i</sub> ne se couple qu'aux niveaux voisins, d'où une matrice de rigidité tridiagonale." },
      { titre: "Problème aux valeurs propres", formule: "(K − ω²·M)·φ = 0, résolu par la méthode de Jacobi ; T = 2π/ω",
        calcul: `ω<sub>1</sub> = ${f(m1.w, 4)} rad/s → T<sub>1</sub> = 2π/${f(m1.w, 4)} = <b>${f(m1.T, 3)} s</b>${n > 1 ? ` ; T<sub>2</sub> = ${f(md[1].T, 3)} s` : ""}${n > 2 ? ` ; T<sub>3</sub> = ${f(md[2].T, 3)} s` : ""}` },
      { titre: "Déformée du mode 1 (normée au sommet)", calcul: court ? `φ<sub>1</sub> = (${m1.phi.map((x) => fd(x, 3)).join(" ; ")})` : `φ<sub>1</sub> de ${fd(m1.phi[0], 3)} au premier étage à 1 au sommet` },
      { titre: "Facteur de participation et masse effective du mode 1", formule: "Γ = Σ m<sub>i</sub>φ<sub>i</sub> / Σ m<sub>i</sub>φ<sub>i</sub>² ; m<sub>eff</sub> = (Σ m<sub>i</sub>φ<sub>i</sub>)² / Σ m<sub>i</sub>φ<sub>i</sub>²",
        calcul: `Σmφ = ${f(smp, 4)} t, Σmφ² = ${f(smp2, 4)} t → Γ = <b>${fd(m1.gamma, 3)}</b> ; m<sub>eff</sub> = <b>${f(m1.meff, 4)} t</b>, soit ${fd(100 * m1.part, 1)} % de M` },
      { titre: "Modes à retenir (EN 1998-1, § 4.3.3.3.1 (3))", formule: "somme des masses effectives ≥ 90 % et tous les modes de plus de 5 %", calcul: `<b>${ret.n} mode${ret.n > 1 ? "s" : ""}</b>, ${fd(100 * ret.cumul, 1)} % de la masse ; ${ind ? "T<sub>j</sub> ≤ 0,9·T<sub>i</sub> : SRSS" : "périodes voisines : CQC"}` },
      { titre: "Contrôles de T<sub>1</sub>", formule: "C<sub>t</sub>·H<sup>3/4</sup> (portique béton, C<sub>t</sub> = 0,075) ; 2·√d, d flèche en tête sous les poids appliqués horizontalement (m)",
        calcul: `0,075 × ${f(H, 3)}<sup>0,75</sup> = ${f(Spectre.periodeApprochee(H, "beton"), 3)} s ; 2·√d = ${f(Batiment.periodeDeplacement(bat), 3)} s` },
    ],
  });
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
  const pS = Spectre.EC8_2004[1][sol], zc = Batiment.cotes(bat.h), szm = bat.m.reduce((a1, x, i) => a1 + x * zc[i], 0);
  const vb = sp.modes.map((x) => x.V[0]);
  noter("calcAnalyseNote", {
    donnees: [["étages", `${n} de 3 m, 200 t et 2·10⁵ kN/m (×profil)`], ["a<sub>g</sub>", `${fd(ag, 3)} g`], ["sol", `${sol} (S = ${fd(pS.S, 2)}, T<sub>C</sub> = ${fd(pS.TC, 2)} s)`], ["q", fd(q, 2)], ["ν", "0,5"]],
    etapes: [
      { titre: "Ordonnée du spectre de calcul à T<sub>1</sub>", formule: "S<sub>d</sub>(T<sub>1</sub>) (expressions 3.13 à 3.16)", calcul: `T<sub>1</sub> = ${f(T1, 3)} s → S<sub>d</sub> = <b>${f(Sd(T1) / G, 3)} g</b> = ${f(Sd(T1), 3)} m/s²` },
      { titre: "Forces latérales : effort à la base", formule: "F<sub>b</sub> = S<sub>d</sub>(T<sub>1</sub>)·M·λ, λ = 0,85 si T<sub>1</sub> ≤ 2T<sub>C</sub> et plus de deux étages", calcul: `F<sub>b</sub> = ${f(Sd(T1), 3)} × ${f(M, 4)} × ${fd(fl.lambda, 2)} = <b>${f(fl.Fb, 4)} kN</b>${permis ? "" : " (méthode hors de son domaine : T<sub>1</sub> trop long ou bâtiment irrégulier)"}` },
      { titre: "Répartition sur la hauteur", formule: "F<sub>i</sub> = F<sub>b</sub>·z<sub>i</sub>m<sub>i</sub> / Σ z<sub>j</sub>m<sub>j</sub>", calcul: `Σ z·m = ${f(szm, 4)} t·m ; au sommet : F = ${f(fl.Fb, 4)} × ${f(zc[n - 1], 3)} × ${f(bat.m[n - 1], 4)} / ${f(szm, 4)} = <b>${f(fl.F[n - 1], 4)} kN</b>`,
        schema: forcesEtages({ z: zc, F: fl.F, Fb: fl.Fb }),
        legende: "Forces à l'échelle : proportionnelles à z<sub>i</sub>·m<sub>i</sub>, elles croissent avec la hauteur comme la déformée du premier mode ; leur somme est l'effort à la base F<sub>b</sub>." },
      { titre: "Analyse modale : effort à la base de chaque mode", formule: "V<sub>b,j</sub> = S<sub>d</sub>(T<sub>j</sub>)·m<sub>eff,j</sub>", calcul: vb.map((v, j) => `mode ${j + 1} : ${f(md[j].meff, 4)} t × ${f(sp.modes[j].Sa, 3)} m/s² = ${f(v, 4)} kN`).join(" ; ") },
      { titre: `Combinaison ${regle.toUpperCase()}`, formule: regle === "srss" ? "V = √(Σ V<sub>j</sub>²)" : "V = √(Σ<sub>i</sub>Σ<sub>j</sub> ρ<sub>ij</sub>V<sub>i</sub>V<sub>j</sub>), ρ de Der Kiureghian", calcul: `V<sub>base</sub> = <b>${f(sp.V[0], 4)} kN</b> (forces latérales : ${f(fl.Fb, 4)} kN)` },
      { titre: `Limitation des dommages, étage ${iR + 1}`, formule: "d<sub>r</sub> = q·d<sub>e</sub> ; d<sub>r</sub>·ν/h ≤ 0,5 %", calcul: `d<sub>r</sub> = ${fd(q, 2)} × ${f(sp.d[iR] * 1000, 3)} = ${f(ver.dr[iR] * 1000, 3)} mm ; ${f(ver.dr[iR] * 1000, 3)} × 0,5 / 3 000 = <b>${fd(100 * ver.ratio[iR], 3)} %</b>` },
      { titre: `Effets du second ordre, étage ${iT + 1}`, formule: "θ = P<sub>tot</sub>·d<sub>r</sub> / (V<sub>tot</sub>·h), P<sub>tot</sub> = g·Σ m au-dessus", calcul: `θ = ${f(ver.P[iT], 4)} × ${f(ver.dr[iT], 3)} / (${f(sp.V[iT], 4)} × 3) = <b>${fd(ver.theta[iT], 4)}</b> ${ver.theta[iT] <= 0.1 ? "≤ 0,10 : négligeables" : "&gt; 0,10 : à prendre en compte"}` },
    ],
  });
  el("anTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>Étage</th><th class="num">V modal</th><th class="num">d<sub>e</sub></th><th class="num">d<sub>r</sub> = q·d<sub>e</sub></th><th class="num">d<sub>r</sub>ν/h</th><th class="num">θ</th></tr></thead><tbody>${
    bat.m.map((_, i) => `<tr><td>${i + 1}</td><td class="n">${f(sp.V[i], 4)} kN</td><td class="n">${f(sp.d[i] * 1000, 3)} mm</td><td class="n">${f(ver.dr[i] * 1000, 3)} mm</td><td class="n">${fd(100 * ver.ratio[i], 2)} %</td><td class="n">${fd(ver.theta[i], 3)}</td></tr>`).reverse().join("")
  }</tbody></table></div>`;
  el("anOut").innerHTML = `T<sub>1</sub> = ${f(T1, 3)} s, S<sub>d</sub>(T<sub>1</sub>) = ${f(Sd(T1) / G, 3)} g · <strong>forces latérales F<sub>b</sub> = ${f(fl.Fb, 4)} kN</strong> (λ = ${fd(fl.lambda, 2)}${permis ? "" : ", méthode hors de son domaine"}) · <strong>analyse modale V<sub>base</sub> = ${f(sp.V[0], 4)} kN</strong>
    · d<sub>r</sub>ν/h maximal ${fd(100 * ver.ratio[iR], 2)} % (étage ${iR + 1}) ${verdict(ver.ratio[iR] <= 0.005, "≤ 0,5 %", "> 0,5 %")} · θ maximal ${fd(ver.theta[iT], 3)} ${verdict(ver.theta[iT] <= 0.1, "≤ 0,10", "> 0,10")}
    <small>Masse totale ${f(M, 4)} t ; ν = 0,5.</small>`;
});
brancher(["anN", "anProfil", "anAg", "anSol", "anQ"], majAnalyse);
