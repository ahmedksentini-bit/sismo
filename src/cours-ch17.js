// Calculateurs du chapitre 17 : isolateur bilinéaire et linéarisation équivalente par point fixe ; calcul
// temporel non linéaire du bâtiment isolé face à la base fixe (module Isolation, vérifié contre OpenSeesPy).
import { el, num, f, fd, brancher, garde } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Isolation from "./sismo/isolation.js";
import Spectre from "./sismo/spectre.js";
import Oscillateur from "./sismo/oscillateur.js";
import Accelero from "./sismo/accelerogramme.js";

const G = Spectre.G, TS = 0.4, XI_S = 0.05;
let etat = null; // dernier dimensionnement, repris par le calcul temporel

// ── Dimensionner un isolateur ────────────────────────────────────────────
const majIsolateur = garde("isOut", () => {
  const M = num("isM"), Tiso = num("isT"), q = num("isQ"), dy = num("isDy") / 1000, ag = num("isAg"), sol = el("isSol").value;
  if (!(M > 0 && Tiso >= 1 && q > 0 && dy > 0 && ag > 0)) { el("isOut").textContent = "Saisir des valeurs positives, Tiso d'au moins 1 s."; el("isFig").innerHTML = ""; etat = null; return; }
  const iso = Isolation.isolateur({ M, Tiso, q, dy }), se = (T, xi = 0.05) => Spectre.ec8(T, { type: 1, sol, ag, xi }) * G;
  const eq = Isolation.deplacementCalcul(iso, { se });
  etat = { iso, se, eq, M, sol, ag };
  const d = eq.d, Fd = eq.F, boucle = [[-d, -Fd], [-d + 2 * iso.dy, -Fd + 2 * iso.Fy], [d, Fd], [d - 2 * iso.dy, Fd - 2 * iso.Fy], [-d, -Fd]].map(([x, y]) => [x * 1000, y]);
  const Tg = Array.from({ length: 200 }, (_, i) => 0.02 + i * 0.02), aFixe = se(TS) / G, aIso = Fd / M / G;
  el("isFig").innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${graphe({
    largeur: 300, hauteur: 280, xmin: -Math.ceil(d * 1200 / 10) * 10, xmax: Math.ceil(d * 1200 / 10) * 10, ymin: -Math.ceil(Fd * 1.2 / 100) * 100, ymax: Math.ceil(Fd * 1.2 / 100) * 100,
    xlabel: "déplacement (mm)", ylabel: "force (kN)",
    series: [
      { points: boucle, couleur: COULEURS.bleu, epaisseur: 2.2, libelle: "boucle à d" },
      { points: [[-d * 1000, -Fd], [d * 1000, Fd]], couleur: COULEURS.effort, epaisseur: 1.4, tirets: "5 4", libelle: "raideur effective" },
    ],
  })}${graphe({
    largeur: 300, hauteur: 280, xmin: 0, xmax: 4, ymin: 0, ymax: Math.ceil(Math.max(...Tg.map((t) => se(t))) / G * 11) / 10,
    xlabel: "période (s)", ylabel: "Se (g)",
    series: [
      { points: Tg.map((t) => [t, se(t) / G]), couleur: COULEURS.discret, epaisseur: 1.6, libelle: "ξ = 5 %" },
      { points: Tg.map((t) => [t, se(t, eq.xi) / G]), couleur: COULEURS.bleu, epaisseur: 2.2, libelle: `ξ = ${fd(100 * eq.xi, 0)} %` },
    ],
    marques: [{ x: TS, y: aFixe, couleur: COULEURS.effort, libelle: `base fixe ${f(aFixe, 2)} g` }, { x: eq.Teff, y: se(eq.Teff, eq.xi) / G, couleur: COULEURS.bleu, libelle: `isolé ${f(aIso, 2)} g` }],
  })}</div>`;
  el("isOut").innerHTML = `K<sub>2</sub> = ${f(iso.K2, 4)} kN/m, Q = ${f(iso.Q, 4)} kN, K<sub>1</sub> = ${f(iso.K1, 4)} kN/m · après ${eq.etapes.length} itérations : <strong>d = ${f(d * 1000, 3)} mm</strong>,
    T<sub>eff</sub> = ${f(eq.Teff, 3)} s, ξ<sub>eff</sub> = ${fd(100 * eq.xi, 1)} % (η = ${fd(Spectre.eta(eq.xi), 3)}) · <strong>accélération transmise ${f(aIso, 3)} g</strong>, base fixe (T = ${fd(TS, 1)} s) ${f(aFixe, 3)} g
    <small>Énergie par cycle E<sub>D</sub> = 4Q(d − d<sub>y</sub>) = ${f(eq.ED, 4)} kJ. ${eq.converge ? "" : "Le point fixe n'a pas convergé."}</small>`;
  majTemps();
});

// ── Bâtiment isolé et base fixe sous un même accélérogramme ──────────────
const cacheRec = new Map();
const majTemps = garde("itOut", () => {
  if (!etat) { el("itOut").textContent = "Dimensionner d'abord l'isolateur."; el("itFig").innerHTML = ""; return; }
  const n = Math.round(num("itGraine"));
  if (!(n >= 1 && n <= 20)) { el("itOut").textContent = "Accélérogramme de 1 à 20."; el("itFig").innerHTML = ""; return; }
  if (!cacheRec.has(n)) cacheRec.set(n, Accelero.simuler({ M: 7, R: 10, graine: 900 + 31 * n }));
  const x = cacheRec.get(n), { iso, se, eq, M } = etat;
  // calage en moindres carrés des ln Sa entre 0,75 et 1,25·Teff
  const T5 = Array.from({ length: 5 }, (_, k) => eq.Teff * (0.75 + 0.125 * k)), sa = Spectre.reponse(x.acc, x.dt, T5, 0.05).Sa;
  const s = Math.exp(T5.reduce((acc, T, k) => acc + Math.log(se(T) / sa[k]), 0) / T5.length), acc = Float64Array.from(x.acc, (v) => v * s);
  const ms = M / 1.3, mb = M - ms, mod = Isolation.modele({ ms, mb, Ts: TS, xiS: XI_S }, iso, 0), r = Isolation.temporel(mod, acc, x.dt);
  const w = (2 * Math.PI) / TS, sous = Spectre.sousPas(x.dt, TS), o = Oscillateur.integrer(Spectre.surEchantillonner(acc, sous), x.dt / sous, 1 / TS, XI_S);
  const fixe = Array.from(acc, (_, j) => -(2 * XI_S * w * o.v[j * sous] + w * w * o.x[j * sous]) / G), iso_ = Array.from(r.accTete, (v) => v / G);
  const aFixe = Math.max(...fixe.map(Math.abs)), aIso = Math.max(...iso_.map(Math.abs)), duree = acc.length * x.dt, pas = Math.max(1, Math.floor(acc.length / 900));
  el("itFig").innerHTML = graphe({
    largeur: 560, hauteur: 260, xmin: 0, xmax: Math.ceil(duree), ymin: -Math.ceil(aFixe * 11) / 10, ymax: Math.ceil(aFixe * 11) / 10,
    xlabel: "temps (s)", ylabel: "accélération de la superstructure (g)",
    series: [
      { points: fixe.map((v, i) => [i * x.dt, v]).filter((_, i) => i % pas === 0), couleur: COULEURS.effort, epaisseur: 1.2, libelle: `base fixe : ${f(aFixe, 3)} g` },
      { points: iso_.map((v, i) => [i * x.dt, v]).filter((_, i) => i % pas === 0), couleur: COULEURS.bleu, epaisseur: 1.8, libelle: `isolé : ${f(aIso, 3)} g` },
    ],
  }) + graphe({
    largeur: 560, hauteur: 260, xmin: -Math.ceil(Math.max(r.dIsoMax, eq.d) * 1100 / 10) * 10, xmax: Math.ceil(Math.max(r.dIsoMax, eq.d) * 1100 / 10) * 10, ymin: -Math.ceil(eq.F * 1.3 / 100) * 100, ymax: Math.ceil(eq.F * 1.3 / 100) * 100,
    xlabel: "déplacement de l'isolateur (mm)", ylabel: "force (kN)",
    series: [{ points: Array.from(r.dIso, (d, i) => [d * 1000, r.fIso[i]]).filter((_, i) => i % pas === 0), couleur: COULEURS.bleu, epaisseur: 1.2, libelle: "boucles de l'isolateur" }],
    marques: [{ x: eq.d * 1000, y: eq.F, couleur: COULEURS.effort, libelle: `calcul : ${f(eq.d * 1000, 3)} mm` }],
  });
  el("itOut").innerHTML = `Facteur de calage ${fd(s, 2)} · <strong>déplacement maximal de l'isolateur ${f(r.dIsoMax * 1000, 3)} mm</strong> (linéarisation équivalente : ${f(eq.d * 1000, 3)} mm) ·
    <strong>accélération de la superstructure ${f(aIso, 3)} g</strong>, contre ${f(aFixe, 3)} g sur base fixe
    <small>Un seul accélérogramme : comparez-en plusieurs (le banc « isolation » en calcule sept et en fait la moyenne).</small>`;
});
brancher(["isM", "isT", "isQ", "isDy", "isAg", "isSol"], majIsolateur);
brancher(["itGraine"], majTemps);
