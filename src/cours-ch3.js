// Calculateurs du chapitre 3 : sphère focale d'un mécanisme (plan auxiliaire, axes P et T, type de faille) ;
// polarités d'un réseau et famille de solutions de l'inversion par recherche exhaustive.
import { el, num, fd, brancher, garde } from "./ui.js";
import { ballon } from "./ballon.js";
import Me from "./sismo/mecanisme.js";
import Sismo from "./sismo/signal.js";

const centre = (html) => `<div style="max-width:300px;margin:0 auto">${html}</div>`;
const angle = (x) => `${fd(x, 0)}°`;

// ── Sphère focale d'un mécanisme ──────────────────────────────────────────
const majBallon = garde("meOut", () => {
  const mec = { azimut: num("meAz"), pendage: num("meDip"), glissement: num("meRake") };
  if (!(mec.azimut >= 0 && mec.azimut <= 360 && mec.pendage > 0 && mec.pendage <= 90 && mec.glissement >= -180 && mec.glissement <= 180)) {
    el("meOut").textContent = "Azimut de 0 à 360°, pendage de 0 à 90°, glissement de −180 à 180°."; el("meFig").innerHTML = ""; return;
  }
  const aux = Me.planAuxiliaire(mec.azimut, mec.pendage, mec.glissement), ax = Me.axes(Me.tenseur(mec.azimut, mec.pendage, mec.glissement));
  const type = Me.typeFaille(mec.glissement);
  el("meFig").innerHTML = centre(ballon({ mec, titre: "Sphère focale du mécanisme" }));
  el("meOut").innerHTML = `<strong>${type === "décrochement" ? (Math.abs(mec.glissement) < 90 ? "décrochement sénestre" : "décrochement dextre") : `faille ${type}`}</strong> ·
    plan auxiliaire ${angle(aux.azimut)} / ${angle(aux.pendage)} / ${angle(aux.glissement)} ·
    axe P : azimut ${angle(ax.P.azimut)}, plongement ${angle(ax.P.plongement)} · axe T : azimut ${angle(ax.T.azimut)}, plongement ${angle(ax.T.plongement)}
    <small>Les quadrants teintés partent en compression (premier mouvement vers le haut aux stations).</small>`;
});
brancher(["meAz", "meDip", "meRake"], majBallon);

// ── Polarités d'un réseau et famille de solutions ────────────────────────
const u = Sismo.aleatoire(77);
const RESEAU = Array.from({ length: 30 }, () => ({ az: 360 * u(), delta: 10 + 140 * u() }))
  .map((s) => ({ ...s, i: Me.emergence(s.delta, 10).i }));
let cleInv = "", inv = null;
const majInv = garde("inOut", () => {
  const [a, d, r] = el("inType").value.split(" ").map(Number), vrai = { azimut: a, pendage: d, glissement: r };
  const n = Math.round(num("inN")), faux = Math.max(0, Math.round(num("inFaux", 0)));
  if (!(n >= 4 && n <= 30 && faux <= n)) { el("inOut").textContent = "De 4 à 30 stations ; pas plus de polarités fausses que de stations."; el("inFig").innerHTML = ""; return; }
  const lect = Me.polarites(vrai, RESEAU.slice(0, n)).map((s, k) => (k < faux ? { ...s, polarite: -s.polarite, faux: true } : s));
  const cle = `${a}|${d}|${r}|${n}|${faux}`;
  if (cle !== cleInv) { inv = Me.inverser(lect, 10); cleInv = cle; }
  const ecarts = inv.solutions.map((s) => Me.ecartAxes(s, vrai)), pire = Math.max(...ecarts);
  el("inFig").innerHTML = centre(ballon({ mec: null, stations: lect, solutions: inv.solutions, vrai, titre: "Polarités et famille de solutions" }));
  const types = new Set(inv.solutions.map((s) => Me.typeFaille(s.glissement)));
  el("inOut").innerHTML = `${n} polarités · <strong>${inv.solutions.length} mécanisme${inv.solutions.length > 1 ? "s" : ""} de la grille à ${inv.desaccords} désaccord${inv.desaccords > 1 ? "s" : ""}</strong> ·
    axes P et T jusqu'à ${angle(pire)} du vrai · type${types.size > 1 ? "s" : ""} : ${[...types].join(", ")}
    <small>${pire > 30 ? "Solution mal contrainte : ajoutez des stations." : "Solution bien contrainte."}${faux ? " Les polarités fausses laissent des désaccords ou déplacent la solution." : ""}</small>`;
});
brancher(["inType", "inN", "inFaux"], majInv);
