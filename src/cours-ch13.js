// Calculateurs du chapitre 13 : un essai SPT pas à pas (Boulanger et Idriss 2014, Liquefaction.pointSPT) ;
// profil de FS d'un sondage CPT d'école, LPI et tassement (Liquefaction.cpt).
import { el, num, f, fd, brancher, garde, verdict } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import L from "./sismo/liquefaction.js";

// ── Un essai SPT pas à pas ───────────────────────────────────────────────
const majSPT = garde("lqOut", () => {
  const z = num("lqZ"), gwl = num("lqNappe"), n60 = num("lqN"), fc = num("lqFC"), amax = num("lqA"), M = num("lqM");
  if (!(z > 0 && gwl >= 0 && n60 > 0 && fc >= 0 && amax > 0 && M >= 4 && M <= 9)) { el("lqOut").textContent = "Saisir des valeurs positives (magnitude de 4 à 9)."; el("lqTab").innerHTML = ""; return; }
  if (z <= gwl) { el("lqOut").innerHTML = `L'essai est au-dessus de la nappe (${f(gwl, 3)} m) : sable non saturé, pas de liquéfaction.`; el("lqTab").innerHTML = ""; return; }
  const sv = 18 * z, u = L.GW * (z - gwl), sve = sv - u, p = L.pointSPT(n60, fc, sv, sve, amax, M, z);
  const ligne = (a, b, c = "") => `<tr><td>${a}</td><td class="n">${b}</td><td class="motif">${c}</td></tr>`;
  el("lqTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>Étape</th><th class="num">valeur</th><th>formule</th></tr></thead><tbody>
    ${ligne("σ<sub>v</sub>, u, σ'<sub>v</sub>", `${f(sv, 3)} ; ${f(u, 3)} ; ${f(sve, 3)} kPa`, `18·z ; 9,8·(z − nappe) ; σ<sub>v</sub> − u`)}
    ${ligne("r<sub>d</sub>", fd(p.rd, 3), "Idriss (1999), fonction de z et M")}
    ${ligne("CSR", fd(p.csr, 3), `0,65 × ${fd(sv / sve, 3)} × ${f(amax, 3)} × ${fd(p.rd, 3)}`)}
    ${ligne("C<sub>N</sub>, (N<sub>1</sub>)<sub>60</sub>", `${fd(p.cn, 3)} ; ${fd(p.n1, 1)}`, "(P<sub>a</sub>/σ'<sub>v</sub>)<sup>m</sup> ≤ 1,7, itéré")}
    ${ligne("(N<sub>1</sub>)<sub>60cs</sub>", fd(p.n1cs, 1), `+ Δ(N<sub>1</sub>)<sub>60</sub> des fines (${f(fc, 3)} %)`)}
    ${ligne("CRR<sub>7,5</sub>", fd(p.crr75, 3), "Boulanger et Idriss (2014), M = 7,5, σ'<sub>v</sub> = 1 atm")}
    ${ligne("MSF ; K<sub>σ</sub>", `${fd(p.msf, 3)} ; ${fd(p.ks, 3)}`, "magnitude ; confinement")}
    ${ligne("CRR", fd(p.crr, 3), "CRR<sub>7,5</sub> · MSF · K<sub>σ</sub>")}
  </tbody></table></div>`;
  el("lqOut").innerHTML = `<strong>FS = CRR / CSR = ${p.fs >= 2 ? "≥ 2 (plafond)" : fd(p.fs, 2)}</strong> ${verdict(p.fs >= 1, "ne se liquéfie pas", "se liquéfie")} ${verdict(p.fs >= 1.25, "marge EN 1998-5 (FS ≥ 1,25)", "marge EN 1998-5 non tenue")}`;
});
brancher(["lqZ", "lqNappe", "lqN", "lqFC", "lqA", "lqM"], majSPT);

// ── Profil de liquéfaction d'un sondage CPT ──────────────────────────────
const PROFILS = {
  lache: [{ h: 1.5, qc: 3, rf: 1.5 }, { h: 4.5, qc: 5, rf: 0.6 }, { h: 2, qc: 1.5, rf: 3 }, { h: 5, qc: 9, rf: 0.7 }, { h: 3, qc: 0.9, rf: 4.5 }, { h: 4, qc: 18, rf: 0.6 }],
  alternance: [{ h: 2, qc: 4, rf: 1.2 }, { h: 2, qc: 6, rf: 0.6 }, { h: 1.5, qc: 2, rf: 2.2 }, { h: 3, qc: 7, rf: 0.8 }, { h: 1.5, qc: 2.5, rf: 2 }, { h: 4, qc: 10, rf: 0.7 }, { h: 6, qc: 14, rf: 0.6 }],
  dense: [{ h: 2, qc: 8, rf: 0.8 }, { h: 8, qc: 16, rf: 0.6 }, { h: 10, qc: 22, rf: 0.5 }],
  argile: [{ h: 6, qc: 0.8, rf: 4.5 }, { h: 4, qc: 6, rf: 0.6 }, { h: 10, qc: 12, rf: 0.6 }],
};
const majCPT = garde("cpOut", () => {
  const id = el("cpProfil").value, amax = num("cpA"), M = num("cpM"), gwl = num("cpNappe");
  if (!PROFILS[id] || !(amax > 0 && M >= 4 && M <= 9 && gwl >= 0)) { el("cpOut").textContent = "Saisir une accélération positive, une magnitude de 4 à 9 et une nappe positive."; el("cpFig").innerHTML = ""; return; }
  const son = L.sondageSynthetique(PROFILS[id], { pas: 0.1, graine: 1, gwl }), r = L.cpt(son, { gwl, amax, M });
  const H = son.z[son.z.length - 1], pts = r.points;
  const liq = pts.filter((p) => p.z > gwl && p.ic <= 2.6 && p.fs < 1).length * 0.1;
  el("cpFig").innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${graphe({
    largeur: 280, hauteur: 420, xmin: 0, xmax: 30, ymin: 0, ymax: Math.ceil(H), inverserY: true, pasX: 10,
    xlabel: "qc (MPa)", ylabel: "profondeur (m)",
    series: [{ points: son.z.map((z, i) => [son.qc[i] / 1000, z]), couleur: COULEURS.encre, epaisseur: 1.4 }],
    zones: [{ x0: 0, x1: 30, y0: gwl, y1: gwl + 0.08, couleur: COULEURS.eau, opacite: 0.9 }],
  })}${graphe({
    largeur: 280, hauteur: 420, xmin: 0, xmax: 2, ymin: 0, ymax: Math.ceil(H), inverserY: true, pasX: 0.5,
    xlabel: "FS", ylabel: "profondeur (m)",
    zones: [{ x0: 0, x1: 1, y0: 0, y1: Math.ceil(H), couleur: COULEURS.effort, opacite: 0.08 }],
    series: [
      { points: pts.filter((p) => p.z > gwl && p.ic <= 2.6).map((p) => [Math.min(2, p.fs), p.z]), couleur: COULEURS.bleu, nuage: true, rayon: 2.2 },
      { points: [[1.25, 0], [1.25, Math.ceil(H)]], couleur: COULEURS.reaction, epaisseur: 1.2, tirets: "4 3" },
    ],
  })}</div>`;
  el("cpOut").innerHTML = `<strong>LPI = ${fd(r.lpi, 1)}</strong> (${L.classeLPI(r.lpi)}) · couches liquéfiées (FS &lt; 1) sur ${fd(liq, 1)} m · <strong>tassement ≈ ${fd(100 * r.tassement, 1)} cm</strong>
    <small>Points au-dessus de la nappe ou d'indice Ic &gt; 2,6 (sols fins) non tracés : non liquéfiables par la méthode. Tirets verts : FS = 1,25.</small>`;
});
brancher(["cpProfil", "cpA", "cpM", "cpNappe"], majCPT);
