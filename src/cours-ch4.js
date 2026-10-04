// Calculateurs du chapitre 4 : moment et magnitude d'une rupture, spectre de Brune et fréquence coin
// (saturation de ML), analyse du spectre des ondes S d'un enregistrement du générateur.
import { el, num, f, fd, brancher, garde, noter } from "./ui.js";
import { graphe, echantillon, COULEURS } from "./figures.js";
import Sismo from "./sismo/signal.js";
import Source from "./sismo/source.js";
import Faille from "./sismo/faille.js";
import { ruptureMoment } from "./schemas-notes.js";

const BETA = Sismo.MODELE.vs1 * 1000;
const moment = (Mw) => 10 ** (1.5 * Mw + 9.05);
const fcBrune = (M0, ds) => 0.4906 * BETA * Math.cbrt((ds * 1e6) / M0); // Δσ en MPa
const sci = (x, c = 3) => { const e = Math.floor(Math.log10(x)); return `${f(x / 10 ** e, c)}·10<sup>${String(e).replace("-", "−")}</sup>`; };

// ── Du glissement à la magnitude ─────────────────────────────────────────
const majMoment = garde("moOut", () => {
  const L = num("moL"), W = num("moW"), D = num("moD"), mu = num("moMu");
  if (!(L > 0 && W > 0 && D > 0 && mu > 0)) { el("moOut").textContent = "Saisir des valeurs positives."; return; }
  const M0 = mu * 1e9 * L * 1e3 * W * 1e3 * D, Mw = (Math.log10(M0) - 9.05) / 1.5, Mw91 = (Math.log10(M0) - 9.1) / 1.5;
  const Awc = Faille.aireWC1994(Mw), Dwc = M0 / (mu * 1e9 * Awc * 1e6);
  noter("calcMomentNote", {
    donnees: [["L", `${f(L, 4)} km`], ["W", `${f(W, 4)} km`], ["D", `${f(D, 3)} m`], ["μ", `${fd(mu, 0)} GPa`]],
    etapes: [
      { titre: "Surface rompue (en m²)", formule: "A = L × W", calcul: `A = ${f(L * 1e3, 4)} × ${f(W * 1e3, 4)} = <b>${sci(L * W * 1e6)} m²</b>` },
      { titre: "Moment sismique", formule: "M<sub>0</sub> = μ·A·D", calcul: `M<sub>0</sub> = ${fd(mu, 0)}·10<sup>9</sup> × ${sci(L * W * 1e6)} × ${f(D, 3)} = <b>${sci(M0)} N·m</b>` },
      { titre: "Magnitude de moment", formule: "Mw = (log<sub>10</sub> M<sub>0</sub> − 9,05) / 1,5", calcul: `log<sub>10</sub> M<sub>0</sub> = ${fd(Math.log10(M0), 3)} ; Mw = (${fd(Math.log10(M0), 3)} − 9,05) / 1,5 = <b>${fd(Mw, 2)}</b>`, note: `Avec la constante 9,1 de l'IASPEI : ${fd(Mw91, 2)}.` },
      { titre: "Comparaison à Wells et Coppersmith (1994)", formule: "log<sub>10</sub> A = −3,49 + 0,91·Mw (km²) ; D = M<sub>0</sub>/(μA)", calcul: `A = 10<sup>−3,49 + 0,91 × ${fd(Mw, 2)}</sup> = ${f(Awc, 3)} km² ; D = ${sci(M0)} / (${fd(mu, 0)}·10<sup>9</sup> × ${f(Awc * 1e6, 3)}) = <b>${f(Dwc, 2)} m</b>`,
        schema: ruptureMoment({ L, W, D, Awc, M0, Mw }),
        legende: "À la même échelle, la surface rompue saisie et la surface médiane d'un séisme du même moment selon Wells et Coppersmith (1994), dessinée avec le même allongement L/W." },
    ],
  });
  el("moOut").innerHTML = `M<sub>0</sub> = ${fd(mu, 0)}·10<sup>9</sup> × ${f(L * 1e3, 4)} × ${f(W * 1e3, 4)} × ${f(D, 3)} = ${sci(M0)} N·m →
    <strong>Mw = (${fd(Math.log10(M0), 2)} − 9,05) / 1,5 = ${fd(Mw, 2)}</strong> (IASPEI, 9,1 : ${fd(Mw91, 2)})
    <small>Pour cette magnitude, la loi médiane de Wells et Coppersmith (1994) donne A ≈ ${f(Awc, 3)} km² (ici ${f(L * W, 3)} km²) et un glissement moyen de ${f(Dwc, 2)} m.</small>`;
});
brancher(["moL", "moW", "moD", "moMu"], majMoment);

// ── Spectre de Brune et fréquence coin ───────────────────────────────────
const majBrune = garde("brOut", () => {
  const Mw = num("brMw"), ds = num("brDs");
  if (!(Mw >= 2 && Mw <= 9 && ds > 0)) { el("brOut").textContent = "Mw de 2 à 9, Δσ positive."; el("brFig").innerHTML = ""; return; }
  const spectre = (M) => { const M0 = moment(M), fc = fcBrune(M0, ds); return { M0, fc, s: (x) => M0 / (1 + (x / fc) ** 2) }; };
  const cas = [[Mw - 1, COULEURS.discret, "5 4"], [Mw, COULEURS.bleu, null], [Mw + 1, COULEURS.violet, "5 4"]].map(([M, couleur, tirets]) => ({ M, couleur, tirets, ...spectre(M) }));
  // échelle en 10¹⁵ N·m : des graduations lisibles de Mw 2 à Mw 9
  const U = 1e15, ymax = 10 ** Math.ceil(Math.log10(cas[2].M0 / U) + 0.3), ymin = 10 ** Math.floor(Math.log10(cas[0].s(30) / U));
  el("brFig").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0.01, xmax: 30, ymin, ymax, logX: true, logY: true,
    xlabel: "fréquence (Hz)", ylabel: "spectre de moment (10¹⁵ N·m)",
    series: cas.map((c) => ({ points: echantillon((lf) => [10 ** lf, c.s(10 ** lf) / U], -2, Math.log10(30), 120).map(([, p]) => p), couleur: c.couleur, tirets: c.tirets, epaisseur: c.M === Mw ? 2.8 : 1.6, libelle: `Mw ${fd(c.M, 1)}, fc = ${f(c.fc, 2)} Hz` })),
    zones: [{ x0: 1.1, x1: 1.4, y0: ymin, y1: ymax, couleur: COULEURS.f62, opacite: 0.15 }],
    textes: [{ x: 1.25, y: ymin * 3, texte: "Wood-Anderson", couleur: COULEURS.f62 }],
    marques: cas.map((c) => ({ x: c.fc, y: c.s(c.fc) / U, couleur: c.couleur, rayon: 4 })),
  });
  const r125 = cas[2].s(1.25) / cas[1].s(1.25), c = cas[1];
  noter("calcBruneNote", {
    donnees: [["Mw", fd(Mw, 1)], ["Δσ", `${f(ds, 3)} MPa`], ["β", `${f(BETA, 4)} m/s`]],
    etapes: [
      { titre: "Moment sismique", formule: "M<sub>0</sub> = 10<sup>1,5·Mw + 9,05</sup>", calcul: `M<sub>0</sub> = 10<sup>1,5 × ${fd(Mw, 1)} + 9,05</sup> = <b>${sci(c.M0)} N·m</b>` },
      { titre: "Fréquence coin de Brune (1970)", formule: "f<sub>c</sub> = 0,4906·β·(Δσ/M<sub>0</sub>)<sup>1/3</sup>", calcul: `f<sub>c</sub> = 0,4906 × ${f(BETA, 4)} × (${f(ds, 3)}·10<sup>6</sup> / ${sci(c.M0)})<sup>1/3</sup> = <b>${f(c.fc, 3)} Hz</b>` },
      { titre: "Spectre de déplacement de la source", formule: "Ω(f) = M<sub>0</sub> / (1 + (f/f<sub>c</sub>)²)", calcul: `à 1,25 Hz (Wood-Anderson) : Ω = ${sci(c.M0)} / (1 + (1,25/${f(c.fc, 3)})²) = <b>${sci(c.s(1.25))} N·m·s</b>` },
      { titre: "Saturation de ML", formule: "rapport des spectres de Mw + 1 et Mw à 1,25 Hz", calcul: `${sci(cas[2].s(1.25))} / ${sci(c.s(1.25))} = <b>${f(r125, 3)}</b> (contre 10<sup>1,5</sup> = 31,6 sur le plateau)`, note: r125 < 10 ? "Moins de 10 : une magnitude de plus ne multiplie plus l'amplitude par 10, ML sature." : "Encore près de 10 ou plus : ML suit Mw." },
    ],
  });
  el("brOut").innerHTML = `Mw ${fd(Mw, 1)} : M<sub>0</sub> = ${sci(cas[1].M0)} N·m, <strong>f<sub>c</sub> = 0,49 × ${f(BETA, 4)} × (${f(ds, 3)}·10<sup>6</sup> / M<sub>0</sub>)<sup>1/3</sup> = ${f(cas[1].fc, 3)} Hz</strong>
    <small>D'une magnitude à la suivante, le plateau est multiplié par 31,6 ; à 1,25 Hz (Wood-Anderson), le spectre l'est par ${f(r125, 2)}${r125 < 10 ? " : ML commence à saturer" : ""}.</small>`;
});
brancher(["brMw", "brDs"], majBrune);

// ── Le spectre des ondes S d'un enregistrement ───────────────────────────
let cle = "", res = null;
const majSource = garde("soOut", () => {
  const Mw = num("soMw"), ds = num("soDs"), d = num("soR");
  if (!(Mw >= 3 && Mw <= 6 && ds >= 0.5 && ds <= 30 && d >= 20 && d <= 150)) { el("soOut").textContent = "Mw de 3 à 6, Δσ de 0,5 à 30 MPa, distance de 20 à 150 km."; el("soFig").innerHTML = ""; return; }
  const c = `${Mw}|${ds}|${d}`;
  if (c !== cle) {
    const ev = Sismo.generer({ Mw, delta: d, h: 10, baz: 40, graine: 21, modele: { dsigma: 10 * ds } });
    res = Source.analyser(ev); cle = c;
  }
  // échelle en µm·s
  const U = 1e6, brune = (x) => (U * res.omega0) / (1 + (x / res.fc) ** 2), parU = (pts) => pts.map(([x, y]) => [x, U * y]);
  const tous = [...res.brut, ...res.corrige].map((p) => U * p[1]);
  el("soFig").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0.1, xmax: 15, logX: true, logY: true,
    ymin: 10 ** Math.floor(Math.log10(Math.min(...tous))), ymax: 10 ** Math.ceil(Math.log10(Math.max(...tous) * 1.5)),
    xlabel: "fréquence (Hz)", ylabel: "spectre de déplacement (µm·s)",
    series: [
      { points: parU(res.brut), couleur: COULEURS.discret, epaisseur: 1.6, libelle: "brut (enregistré)" },
      { points: parU(res.corrige), couleur: COULEURS.encre, epaisseur: 2, libelle: "corrigé du trajet et du site" },
      { points: echantillon((lf) => [10 ** lf, brune(10 ** lf)], -1, Math.log10(15), 100).map(([, p]) => p), couleur: COULEURS.effort, epaisseur: 2.2, tirets: "6 4", libelle: "modèle de Brune ajusté" },
    ],
    marques: [{ x: res.fc, y: brune(res.fc), couleur: COULEURS.effort, libelle: `fc = ${f(res.fc, 2)} Hz` }],
  });
  const fcVrai = fcBrune(moment(Mw), ds);
  noter("calcSourceNote", {
    donnees: [["Mw vraie", fd(Mw, 1)], ["Δσ vraie", `${f(ds, 3)} MPa`], ["Δ", `${fd(d, 0)} km`], ["h", "10 km"], ["β", `${f(BETA, 4)} m/s`]],
    etapes: [
      { titre: "Spectre corrigé", formule: "Ω(f) = spectre de la fenêtre S / (expansion géométrique × e<sup>−πfR/(Qβ)</sup> × e<sup>−πκf</sup> × amplification du site)", calcul: `fenêtre S de ${fd(res.n * 0.01, 1)} s ; distance au foyer R = ${fd(res.R, 0)} km` },
      { titre: "Ajustement du modèle de Brune", formule: "min Σ [ln Ω(f) − ln(Ω<sub>0</sub>/(1 + (f/f<sub>c</sub>)²))]²", calcul: `Ω<sub>0</sub> = <b>${sci(res.omega0)} m·s</b>, f<sub>c</sub> = <b>${f(res.fc, 3)} Hz</b>, écart ${fd(res.rms, 2)} en ln` },
      { titre: "Moment sismique depuis le plateau", formule: "M<sub>0</sub> = 4π·ρ·β³·Ω<sub>0</sub> / (R<sub>θφ</sub>·F)  (R<sub>θφ</sub> = 0,63 rayonnement moyen des ondes S, F = 2 surface libre)", calcul: `M<sub>0</sub> = <b>${sci(res.M0)} N·m</b>` },
      { titre: "Magnitude de moment", formule: "Mw = (log<sub>10</sub> M<sub>0</sub> − 9,05)/1,5", calcul: `Mw = (${fd(Math.log10(res.M0), 3)} − 9,05)/1,5 = <b>${fd(res.Mw, 2)}</b> (vraie ${fd(Mw, 1)})` },
      { titre: "Chute de contrainte", formule: "Δσ = M<sub>0</sub>·(f<sub>c</sub> / (0,4906·β))³ (en Pa)", calcul: `Δσ = ${sci(res.M0)} × (${f(res.fc, 3)} / (0,4906 × ${f(BETA, 4)}))³ = <b>${f(res.dsigma, 3)} MPa</b> (vraie ${f(ds, 3)})`, note: "Δσ dépend du cube de f<sub>c</sub> : 10 % d'erreur sur f<sub>c</sub> en font 33 % sur Δσ." },
    ],
  });
  el("soOut").innerHTML = `Ω<sub>0</sub> = ${sci(res.omega0)} m·s → M<sub>0</sub> = ${sci(res.M0)} N·m, <strong>Mw = ${fd(res.Mw, 2)}</strong> (vraie ${fd(Mw, 1)}) ·
    <strong>f<sub>c</sub> = ${f(res.fc, 2)} Hz</strong> (vraie ${f(fcVrai, 2)}) · Δσ = ${f(res.dsigma, 2)} MPa (vraie ${f(ds, 2)})
    <small>Fenêtre S de ${fd(res.n * 0.01, 1)} s, distance au foyer ${fd(res.R, 0)} km, écart du modèle ${fd(res.rms, 2)} en ln. Δσ, qui dépend du cube de f<sub>c</sub>, est la grandeur la moins précise.</small>`;
});
brancher(["soMw", "soDs", "soR"], majSource);
