// Calculateurs du chapitre 3 : sphère focale d'un mécanisme (plan auxiliaire, axes P et T, type de faille) ;
// polarités d'un réseau et famille de solutions de l'inversion par recherche exhaustive.
import { el, num, fd, brancher, garde, noter } from "./ui.js";
import { ballon } from "./ballon.js";
import Me from "./sismo/mecanisme.js";
import Sismo from "./sismo/signal.js";
import { failleLocale, departs } from "./schemas-notes.js";

const centre = (html) => `<div style="max-width:300px;margin:0 auto">${html}</div>`;
const angle = (x) => `${fd(x, 0)}°`;
const vec = (v) => `(${v.map((x) => fd(x, 3)).join(" ; ")})`;
// axe (NED) → azimut et plongement, vecteur ramené vers le bas
const versAxe = (v) => { const w = v[2] < 0 ? v.map((x) => -x) : v; return { v: w, az: (((Math.atan2(w[1], w[0]) * 180) / Math.PI) + 360) % 360, pl: (Math.asin(Math.min(1, w[2])) * 180) / Math.PI }; };

// ── Sphère focale d'un mécanisme ──────────────────────────────────────────
const majBallon = garde("meOut", () => {
  const mec = { azimut: num("meAz"), pendage: num("meDip"), glissement: num("meRake") };
  if (!(mec.azimut >= 0 && mec.azimut <= 360 && mec.pendage > 0 && mec.pendage <= 90 && mec.glissement >= -180 && mec.glissement <= 180)) {
    el("meOut").textContent = "Azimut de 0 à 360°, pendage de 0 à 90°, glissement de −180 à 180°."; el("meFig").innerHTML = ""; return;
  }
  const aux = Me.planAuxiliaire(mec.azimut, mec.pendage, mec.glissement), ax = Me.axes(Me.tenseur(mec.azimut, mec.pendage, mec.glissement));
  const type = Me.typeFaille(mec.glissement);
  el("meFig").innerHTML = centre(ballon({ mec, titre: "Sphère focale du mécanisme" }));
  const { n, u: g } = Me.vecteurs(mec.azimut, mec.pendage, mec.glissement), r2 = Math.SQRT1_2;
  const T = versAxe(n.map((x, i) => r2 * (x + g[i]))), P = versAxe(n.map((x, i) => r2 * (x - g[i])));
  const nh = g[2] > 0 ? g.map((x) => -x) : g;
  noter("calcBallonNote", {
    donnees: [["azimut φ", angle(mec.azimut)], ["pendage δ", angle(mec.pendage)], ["glissement λ", angle(mec.glissement)], ["repère", "x nord, y est, z bas"]],
    etapes: [
      { titre: "Normale au plan de faille (Aki et Richards)", formule: "n = (−sin δ·sin φ ; sin δ·cos φ ; −cos δ)", calcul: `n = <b>${vec(n)}</b>` },
      { titre: "Vecteur glissement du toit", formule: "u = (cos λ·cos φ + cos δ·sin λ·sin φ ; cos λ·sin φ − cos δ·sin λ·cos φ ; −sin λ·sin δ)", calcul: `u = <b>${vec(g)}</b>`,
        schema: failleLocale({ phi: mec.azimut, delta: mec.pendage, lambda: mec.glissement }),
        legende: "À gauche, la trace de la faille vue de dessus, à l'azimut φ ; le plan plonge à droite de la trace. À droite, le plan vu depuis le compartiment enlevé (le toit) : il plonge de δ, le toit glisse selon u, à l'angle λ compté depuis la trace ; n est la normale au plan, dirigée vers le toit." },
      { titre: "Plan auxiliaire : n et u échangent leurs rôles", formule: "normale n′ = u (ramenée vers le haut) ; pendage = arccos(−n′<sub>z</sub>) ; azimut = atan2(−n′<sub>x</sub>, n′<sub>y</sub>)",
        calcul: `n′ = ${vec(nh)} → pendage = arccos(${fd(-nh[2], 3)}) = ${angle(aux.pendage)} ; azimut = <b>${angle(aux.azimut)}</b> ; glissement (direction de n dans ce plan) = <b>${angle(aux.glissement)}</b>` },
      { titre: "Axes de tension T et de pression P", formule: "T = (n + u)/√2 ; P = (n − u)/√2 ; azimut = atan2(y, x), plongement = arcsin z (vecteur dirigé vers le bas)",
        calcul: `T = ${vec(T.v)} → azimut <b>${angle(T.az)}</b>, plongement <b>${angle(T.pl)}</b> ; P = ${vec(P.v)} → azimut <b>${angle(P.az)}</b>, plongement <b>${angle(P.pl)}</b>`,
        note: "Ce sont aussi les vecteurs propres du tenseur des moments M = u·nᵀ + n·uᵀ, de valeurs propres +1 (T) et −1 (P)." },
      { titre: "Type de faille", formule: "normale si −150° &lt; λ &lt; −30° ; inverse si 30° &lt; λ &lt; 150° ; décrochement sinon", calcul: `λ = ${angle(mec.glissement)} → <b>${type}</b>` },
    ],
  });
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
  const best = inv.solutions[0], Mb = Me.tenseur(best.azimut, best.pendage, best.glissement), ex = lect.slice(0, 3);
  noter("calcInversionNote", {
    donnees: [["mécanisme vrai", `${angle(a)} / ${angle(d)} / ${angle(r)}`], ["stations", `${n}`], ["polarités fausses", `${faux}`], ["foyer", "10 km"]],
    etapes: [
      { titre: "Angle d'émergence de chaque rai (modèle de croûte)", formule: "Pg montante : i = 180° − arctan(Δ/h) ; Pn descendante : i = arcsin(Vp/Vp₂)",
        calcul: ex.map((st, k) => `station ${k + 1} : Δ = ${fd(st.delta, 0)} km, azimut ${angle(st.az)} → i = <b>${angle(st.i)}</b>`).join(" ; ") + "…",
        schema: departs({ h: 10, H: Sismo.MODELE.H, rais: ex.map((st, k) => ({ nom: `station ${k + 1}`, delta: st.delta, i: st.i })) }),
        legende: "Coupe verticale passant par le foyer : chaque rai quitte le foyer dans une direction repérée par l'angle i depuis la verticale descendante. C'est ce point de départ, et l'azimut de la station, que l'on place sur la sphère focale." },
      { titre: "Polarité prédite par un mécanisme", formule: "γ = (sin i·cos φ ; sin i·sin φ ; cos i) ; A = γᵀ·M·γ ; compression si A ≥ 0",
        calcul: ex.map((st, k) => { const A = Me.rayonnementP(Mb, st.i, st.az); return `station ${k + 1} : A = ${fd(A, 3)} → ${A >= 0 ? "compression" : "dilatation"} (lue : ${st.polarite > 0 ? "compression" : "dilatation"})`; }).join(" ; ") + ` — pour la solution ${angle(best.azimut)} / ${angle(best.pendage)} / ${angle(best.glissement)}` },
      { titre: "Recherche exhaustive", formule: "azimut 0 à 350°, pendage 10 à 90°, glissement −170 à 180°, pas de 10° ; on compte les désaccords",
        calcul: `${36 * 9 * 36} mécanismes essayés → minimum <b>${inv.desaccords} désaccord${inv.desaccords > 1 ? "s" : ""}</b>, atteint par <b>${inv.solutions.length}</b> mécanisme${inv.solutions.length > 1 ? "s" : ""}` },
      { titre: "Dispersion de la famille", formule: "écart = max(angle entre axes P, angle entre axes T) avec le mécanisme vrai", calcul: `écart maximal : <b>${angle(pire)}</b>` },
    ],
  });
  el("inOut").innerHTML = `${n} polarités · <strong>${inv.solutions.length} mécanisme${inv.solutions.length > 1 ? "s" : ""} de la grille à ${inv.desaccords} désaccord${inv.desaccords > 1 ? "s" : ""}</strong> ·
    axes P et T jusqu'à ${angle(pire)} du vrai · type${types.size > 1 ? "s" : ""} : ${[...types].join(", ")}
    <small>${pire > 30 ? "Solution mal contrainte : ajoutez des stations." : "Solution bien contrainte."}${faux ? " Les polarités fausses laissent des désaccords ou déplacent la solution." : ""}</small>`;
});
brancher(["inType", "inN", "inFaux"], majInv);
