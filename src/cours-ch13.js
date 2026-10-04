// Calculateurs du chapitre 13 : un essai SPT pas à pas (Boulanger et Idriss 2014, Liquefaction.pointSPT) ;
// profil de FS d'un sondage CPT d'école, LPI et tassement (Liquefaction.cpt).
import { el, num, f, fd, brancher, garde, verdict, noter } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import L from "./sismo/liquefaction.js";
import { contraintesSPT } from "./schemas-notes.js";

// ── Un essai SPT pas à pas ───────────────────────────────────────────────
const majSPT = garde("lqOut", () => {
  const z = num("lqZ"), gwl = num("lqNappe"), n60 = num("lqN"), fc = num("lqFC"), amax = num("lqA"), M = num("lqM");
  if (!(z > 0 && gwl >= 0 && n60 > 0 && fc >= 0 && amax > 0 && M >= 4 && M <= 9)) { el("lqOut").textContent = "Saisir des valeurs positives (magnitude de 4 à 9)."; noter("calcSPTNote", null); return; }
  if (z <= gwl) { el("lqOut").innerHTML = `L'essai est au-dessus de la nappe (${f(gwl, 3)} m) : sable non saturé, pas de liquéfaction.`; noter("calcSPTNote", null); return; }
  const sv = 18 * z, u = L.GW * (z - gwl), sve = sv - u, p = L.pointSPT(n60, fc, sv, sve, amax, M, z);
  const al = -1.012 - 1.126 * Math.sin(z / 11.73 + 5.133), be = 0.106 + 0.118 * Math.sin(z / 11.28 + 5.142), mExp = 0.784 - 0.0768 * Math.sqrt(Math.min(p.n1cs, 46));
  const dN = L.deltaN1(fc), msfMax = Math.min(2.2, 1.09 + (p.n1cs / 31.5) ** 2), cs = Math.min(0.3, 1 / (18.9 - 2.55 * Math.sqrt(p.n1cs)));
  noter("calcSPTNote", {
    donnees: [["z", `${f(z, 3)} m`], ["nappe", `${f(gwl, 3)} m`], ["N<sub>60</sub>", f(n60, 3)], ["fines FC", `${f(fc, 3)} %`], ["a<sub>max</sub>", `${f(amax, 3)} g`], ["M", fd(M, 1)], ["γ", "18 kN/m³"]],
    etapes: [
      { titre: "Contraintes", formule: "σ<sub>v</sub> = γ·z ; u = 9,8·(z − z<sub>nappe</sub>) ; σ′<sub>v</sub> = σ<sub>v</sub> − u", calcul: `σ<sub>v</sub> = 18 × ${f(z, 3)} = ${f(sv, 4)} kPa ; u = 9,8 × ${f(z - gwl, 3)} = ${f(u, 4)} kPa ; σ′<sub>v</sub> = <b>${f(sve, 4)} kPa</b>`,
        schema: contraintesSPT({ z, gwl, gamma: 18, gw: L.GW }),
        legende: "Sous la nappe, l'eau porte une part du poids des terres : la contrainte effective σ′<sub>v</sub>, celle des grains, croît moins vite que la contrainte totale σ<sub>v</sub>." },
      { titre: "Coefficient de réduction des contraintes (Idriss 1999)", formule: "r<sub>d</sub> = exp(α + β·M), α = −1,012 − 1,126·sin(z/11,73 + 5,133), β = 0,106 + 0,118·sin(z/11,28 + 5,142)", calcul: `α = ${fd(al, 4)}, β = ${fd(be, 4)} → r<sub>d</sub> = exp(${fd(al, 4)} + ${fd(be, 4)} × ${fd(M, 1)}) = <b>${fd(p.rd, 4)}</b>` },
      { titre: "Sollicitation cyclique", formule: "CSR = 0,65·(σ<sub>v</sub>/σ′<sub>v</sub>)·a<sub>max</sub>·r<sub>d</sub>", calcul: `CSR = 0,65 × ${fd(sv / sve, 3)} × ${f(amax, 3)} × ${fd(p.rd, 4)} = <b>${fd(p.csr, 4)}</b>` },
      { titre: "Normalisation de N (itérée)", formule: "C<sub>N</sub> = (P<sub>a</sub>/σ′<sub>v</sub>)<sup>m</sup> ≤ 1,7, m = 0,784 − 0,0768·√(N<sub>1</sub>)<sub>60cs</sub>, P<sub>a</sub> = 101 kPa ; (N<sub>1</sub>)<sub>60</sub> = C<sub>N</sub>·N<sub>60</sub>",
        calcul: `m = ${fd(mExp, 4)} ; C<sub>N</sub> = (101/${f(sve, 4)})<sup>${fd(mExp, 3)}</sup> = ${fd(p.cn, 4)} ; (N<sub>1</sub>)<sub>60</sub> = ${fd(p.cn, 4)} × ${f(n60, 3)} = <b>${fd(p.n1, 2)}</b>` },
      { titre: "Correction des fines", formule: "Δ(N<sub>1</sub>)<sub>60</sub> = exp(1,63 + 9,7/(FC + 0,01) − (15,7/(FC + 0,01))²)", calcul: `Δ = ${fd(dN, 3)} → (N<sub>1</sub>)<sub>60cs</sub> = ${fd(p.n1, 2)} + ${fd(dN, 3)} = <b>${fd(p.n1cs, 2)}</b>` },
      { titre: "Résistance pour M 7,5 et 1 atm (Boulanger et Idriss 2014)", formule: "CRR<sub>7,5</sub> = exp(N/14,1 + (N/126)² − (N/23,6)³ + (N/25,4)⁴ − 2,8), N = (N<sub>1</sub>)<sub>60cs</sub>", calcul: `CRR<sub>7,5</sub> = <b>${fd(p.crr75, 4)}</b>` },
      { titre: "Facteur de magnitude", formule: "MSF = 1 + (MSF<sub>max</sub> − 1)·(8,64·e<sup>−M/4</sup> − 1,325), MSF<sub>max</sub> = 1,09 + (N/31,5)² ≤ 2,2", calcul: `MSF<sub>max</sub> = ${fd(msfMax, 3)} ; MSF = <b>${fd(p.msf, 4)}</b>` },
      { titre: "Facteur de confinement", formule: "K<sub>σ</sub> = 1 − C<sub>σ</sub>·ln(σ′<sub>v</sub>/100) ≤ 1,1, C<sub>σ</sub> = 1/(18,9 − 2,55·√N) ≤ 0,3", calcul: `C<sub>σ</sub> = ${fd(cs, 4)} ; K<sub>σ</sub> = <b>${fd(p.ks, 4)}</b>` },
      { titre: "Résistance et coefficient de sécurité", formule: "CRR = CRR<sub>7,5</sub>·MSF·K<sub>σ</sub> ; FS = CRR/CSR (plafonné à 2)", calcul: `CRR = ${fd(p.crr75, 4)} × ${fd(p.msf, 4)} × ${fd(p.ks, 4)} = ${fd(p.crr, 4)} ; FS = ${fd(p.crr, 4)} / ${fd(p.csr, 4)} = <b>${p.fs >= 2 ? "≥ 2" : fd(p.fs, 3)}</b>`,
        note: "EN 1998-5 : on vise FS ≥ 1,25 (λ = 0,8, valeur recommandée)." },
    ],
  });
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
  // un point de calcul représentatif : le FS le plus faible sous la nappe
  const pire = pts.filter((q) => q.z > gwl && q.ic <= 2.6).reduce((a1, q) => (!a1 || q.fs < a1.fs ? q : a1), null);
  const contrib = []; for (let i = 1; i < pts.length; i++) { const zm = (pts[i].z + pts[i - 1].z) / 2, fm = (pts[i].fs + pts[i - 1].fs) / 2; if (zm < 20 && fm < 1) contrib.push((10 - 0.5 * zm) * (1 - fm) * (pts[i].z - pts[i - 1].z)); }
  noter("calcCPTNote", {
    donnees: [["profil", el("cpProfil").selectedOptions[0]?.textContent || id], ["a<sub>max</sub>", `${f(amax, 3)} g`], ["M", fd(M, 1)], ["nappe", `${f(gwl, 3)} m`], ["pas", "0,1 m"]],
    etapes: [
      pire && { titre: `Point le plus défavorable (z = ${fd(pire.z, 1)} m)`, formule: "σ<sub>v</sub> cumulée (γ de Robertson) ; σ′<sub>v</sub> = σ<sub>v</sub> − u ; CSR = 0,65·(σ<sub>v</sub>/σ′<sub>v</sub>)·a<sub>max</sub>·r<sub>d</sub>",
        calcul: `σ<sub>v</sub> = ${f(pire.sv, 4)} kPa, σ′<sub>v</sub> = ${f(pire.sve, 4)} kPa, r<sub>d</sub> = ${fd(pire.rd, 3)} → CSR = <b>${fd(pire.csr, 4)}</b>` },
      pire && { titre: "Résistance au pénétromètre", formule: "q<sub>c1N</sub> = C<sub>N</sub>·q<sub>c</sub>/P<sub>a</sub> ; I<sub>c</sub> (Robertson) → FC ; q<sub>c1Ncs</sub> = q<sub>c1N</sub> + Δq<sub>c1N</sub> ; CRR<sub>7,5</sub> = exp(q/113 + (q/1000)² − (q/140)³ + (q/137)⁴ − 2,8)",
        calcul: `q<sub>c1N</sub> = ${fd(pire.qc1n, 1)}, I<sub>c</sub> = ${fd(pire.ic, 2)}, FC = ${fd(pire.fc, 0)} %, q<sub>c1Ncs</sub> = ${fd(pire.qc1ncs, 1)} → CRR<sub>7,5</sub> = ${fd(pire.crr75, 4)} ; × MSF ${fd(pire.msf, 3)} × K<sub>σ</sub> ${fd(pire.ks, 3)} = CRR <b>${fd(pire.crr, 4)}</b>` },
      pire && { titre: "Coefficient de sécurité du point", formule: "FS = CRR / CSR", calcul: `FS = ${fd(pire.crr, 4)} / ${fd(pire.csr, 4)} = <b>${fd(pire.fs, 3)}</b>` },
      { titre: "Indice de potentiel de liquéfaction (Iwasaki)", formule: "LPI = Σ (10 − 0,5·z)·(1 − FS)·Δz, sur les tranches de moins de 20 m où FS &lt; 1",
        calcul: `${contrib.length} tranches de 0,1 m contribuent → LPI = <b>${fd(r.lpi, 2)}</b> (${L.classeLPI(r.lpi)})` },
      { titre: "Tassement de reconsolidation (Zhang et al. 2002)", formule: "s = Σ ε<sub>v</sub>(FS, q<sub>c1Ncs</sub>)·Δz", calcul: `s = <b>${fd(100 * r.tassement, 1)} cm</b>` },
    ],
  });
  el("cpOut").innerHTML = `<strong>LPI = ${fd(r.lpi, 1)}</strong> (${L.classeLPI(r.lpi)}) · couches liquéfiées (FS &lt; 1) sur ${fd(liq, 1)} m · <strong>tassement ≈ ${fd(100 * r.tassement, 1)} cm</strong>
    <small>Points au-dessus de la nappe ou d'indice Ic &gt; 2,6 (sols fins) non tracés : non liquéfiables par la méthode. Tirets verts : FS = 1,25.</small>`;
});
brancher(["cpProfil", "cpA", "cpM", "cpNappe"], majCPT);
