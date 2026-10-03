// Calculateurs du chapitre 12 : fonction de transfert d'une couche élastique sur un rocher ; réponse d'un
// profil du banc « site » en linéaire et en linéaire équivalent (Site.calculer, vérifié contre pystrata).
import { el, num, f, fd, brancher, garde } from "./ui.js";
import { graphe, echantillon, COULEURS } from "./figures.js";
import Site from "./sismo/site.js";
import Spectre from "./sismo/spectre.js";
import Accelero from "./sismo/accelerogramme.js";

const poids = (vs) => (vs < 200 ? 17.5 : vs < 300 ? 18.5 : vs < 450 ? 19.5 : 20.5);

// ── Fonction de transfert d'une couche sur un rocher ─────────────────────
const majCouche = garde("coOut", () => {
  const H = num("coH"), vs = num("coVs"), xi = num("coXi"), vr = num("coVr");
  if (!(H > 0 && vs > 0 && xi > 0 && xi < 0.4 && vr > vs)) { el("coOut").textContent = "Il faut H, Vs et ξ positifs et un rocher plus rapide que le sol."; el("coFig").innerHTML = ""; return; }
  const col = Site.colonne([{ h: H, vs, ip: 0, poids: 17.5 }], { vs: vr, poids: 22, xi: 0.01 }), etat = { G: col.couches.map((c) => c.G0), xi: col.couches.map(() => xi) };
  const A = (fr) => Site.cabs(Site.transfert(col, etat, fr)), f0 = vs / (4 * H), I = (17.5 * vs) / (22 * vr);
  const pts = echantillon((lf) => [10 ** lf, A(10 ** lf)], -1, Math.log10(30), 400).map(([, p]) => p);
  let pic = [0, 0];
  for (const [x, y] of pts) if (x < 1.6 * f0 && y > pic[1]) pic = [x, y];
  el("coFig").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 0.1, xmax: 30, ymin: 0, ymax: Math.ceil(Math.max(...pts.map((p) => p[1])) * 1.1), logX: true,
    xlabel: "fréquence (Hz)", ylabel: "amplification surface / rocher affleurant",
    series: [{ points: pts, couleur: COULEURS.bleu, epaisseur: 2.4, libelle: "|H(f)|" }],
    marques: [0, 1, 2].map((n) => ({ x: (2 * n + 1) * f0, y: A((2 * n + 1) * f0), couleur: n ? COULEURS.violet : COULEURS.effort, libelle: n ? `${2 * n + 1}·f₀` : `f₀ = ${f(f0, 3)} Hz` })).filter((m) => m.x <= 30),
  });
  const cls = Site.classeEC8([{ h: H, vs }], { vs: vr });
  el("coOut").innerHTML = `<strong>f<sub>0</sub> = V<sub>s</sub>/4H = ${f(f0, 3)} Hz</strong> (T<sub>0</sub> = ${f(1 / f0, 3)} s) · I = ${fd(I, 3)} ·
    <strong>amplification au pic ${f(pic[1], 3)}</strong> (approchée : 1/(I + πξ/2) = ${f(1 / (I + (Math.PI * xi) / 2), 3)})
    <small>Vs30 = ${f(cls.vs30, 3)} m/s, classe ${cls.classe} de l'EN 1998-1:2004. Harmonique 3·f₀ : amplification ${f(A(3 * f0), 3)}, moindre à cause de l'amortissement.</small>`;
});
brancher(["coH", "coVs", "coXi", "coVr"], majCouche);

// ── Réponse d'un profil, linéaire et linéaire équivalente ────────────────
const PROFILS = {
  ecole: { couches: [[4, 160, 30], [8, 220, 15], [12, 320, 0], [10, 450, 0]], rocher: 1200 },
  argile: { couches: [[6, 110, 40], [14, 150, 30], [10, 250, 10]], rocher: 900 },
  alluvions: { couches: [[3, 150, 15], [9, 260, 0]], rocher: 1100 },
  sable: { couches: [[10, 300, 0], [20, 450, 0], [15, 600, 0]], rocher: 1500 },
};
const TS = Spectre.periodes(50, 0.02, 3);
let rec = null, cle = "", res = null;
const majProfil = garde("siResultat", () => {
  const id = el("siProfil").value, pga = num("siPga"), P = PROFILS[id];
  if (!P || !(pga > 0 && pga <= 1)) { el("siResultat").textContent = "PGA au rocher de 0 à 1 g."; el("siFigure").innerHTML = ""; return; }
  if (!rec) rec = Accelero.simuler({ M: 6.5, R: 20, graine: 271828 });
  const couches = P.couches.map(([h, vs, ip]) => ({ h, vs, ip, poids: poids(vs) })), rocher = { vs: P.rocher, poids: 22, xi: 0.01 };
  const c = `${id}|${pga}`;
  if (c !== cle) {
    let p = 0;
    for (const v of rec.acc) p = Math.max(p, Math.abs(v));
    const acc = new Float64Array(rec.acc.length + Math.round(10 / rec.dt));
    for (let i = 0; i < rec.acc.length; i++) acc[i] = (rec.acc[i] / p) * pga;
    const col = Site.colonne(couches, rocher);
    const lin = Site.calculer(col, acc, rec.dt, { lineaire: true }), eql = Site.calculer(col, acc, rec.dt, { tolerance: 1e-3, iterMax: 30 });
    const sp = (a) => Spectre.reponse(Float64Array.from(a, (v) => v * Spectre.G), rec.dt, TS, 0.05).Sa.map((v) => v / Spectre.G);
    const pic = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    res = { lin, eql, sRoc: sp(acc), sLin: sp(lin.surface), sEql: sp(eql.surface), pLin: pic(lin.surface), pEql: pic(eql.surface) };
    cle = c;
  }
  const cls = Site.classeEC8(couches, rocher), f0 = Site.frequenceQuartOnde(couches);
  const ec = cls.classe in Spectre.EC8_2004[1] ? TS.map((t) => [t, Spectre.ec8(t, { type: 1, sol: cls.classe, ag: pga })]) : [];
  const ymax = Math.ceil(Math.max(...res.sLin, ...res.sEql, ...ec.map((p) => p[1])) * 10) / 10;
  el("siFigure").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0, xmax: 3, ymin: 0, ymax,
    xlabel: "période T (s)", ylabel: "Sa (g), ξ = 5 %",
    series: [
      { points: TS.map((t, i) => [t, res.sRoc[i]]), couleur: COULEURS.discret, epaisseur: 1.6, libelle: "rocher affleurant" },
      { points: TS.map((t, i) => [t, res.sLin[i]]), couleur: COULEURS.violet, epaisseur: 1.6, tirets: "5 4", libelle: "surface, linéaire" },
      { points: TS.map((t, i) => [t, res.sEql[i]]), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: "surface, linéaire équivalent" },
      ec.length && { points: ec, couleur: COULEURS.reaction, epaisseur: 1.6, tirets: "8 4", libelle: `EC8 type 1, sol ${cls.classe}, ag = ${f(pga, 2)} g` },
    ].filter(Boolean),
  });
  const gmax = Math.max(...res.eql.couches.map((x) => x.gammaMax)), gg0 = Math.min(...res.eql.couches.map((x) => x.GG0));
  el("siResultat").innerHTML = `Vs30 = ${f(cls.vs30, 3)} m/s, <strong>classe ${cls.classe}</strong>, f<sub>0</sub> ≈ ${f(f0, 3)} Hz · PGA en surface : <strong>${f(res.pEql, 3)} g</strong> en linéaire équivalent (amplification ${f(res.pEql / pga, 3)}), ${f(res.pLin, 3)} g en linéaire
    <small>${res.eql.iterations} itérations ; distorsion maximale ${f(gmax * 100, 2)} %, G/G<sub>0</sub> descend jusqu'à ${fd(gg0, 2)}.</small>`;
});
brancher(["siProfil", "siPga"], majProfil);
