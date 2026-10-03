// src/sismo/selection.js — sélection et calage d'accélérogrammes sur un spectre cible, et vérification
// des règles de l'EN 1998-1:2004 pour un jeu d'enregistrements (§ 3.2.3.1.3 (3), qui renvoie au
// § 3.2.3.1.2 (4)). Les spectres sont donnés en g aux mêmes périodes que la cible. Solveurs purs.
const Selection = (() => {
  'use strict';

  // Interpolation log-log d'un spectre connu aux périodes Tc (croissantes) ; constant hors bornes.
  function interpoler(Tc, Vc, T) {
    return T.map(t => {
      if (t <= Tc[0]) return Vc[0];
      if (t >= Tc[Tc.length - 1]) return Vc[Vc.length - 1];
      let k = 1;
      while (Tc[k] < t) k++;
      const r = Math.log(t / Tc[k - 1]) / Math.log(Tc[k] / Tc[k - 1]);
      return Math.exp(Math.log(Vc[k - 1]) + r * Math.log(Vc[k] / Vc[k - 1]));
    });
  }
  // Indices des périodes dans [Tmin, Tmax].
  const plage = (T, Tmin, Tmax) => T.map((t, k) => k).filter(k => T[k] >= Tmin - 1e-9 && T[k] <= Tmax + 1e-9);

  // Facteur d'échelle qui minimise Σ (ln s·Sa − ln cible)² sur la plage : ln s = moyenne des écarts.
  function facteur(Sa, lnCible, idx) {
    return Math.exp(idx.reduce((s, k) => s + lnCible[k] - Math.log(Sa[k]), 0) / idx.length);
  }
  // Écart quadratique moyen en ln entre le spectre mis à l'échelle et la cible, sur la plage.
  function ecart(Sa, s, lnCible, idx) {
    return Math.sqrt(idx.reduce((e, k) => e + (Math.log(s * Sa[k]) - lnCible[k]) ** 2, 0) / idx.length);
  }

  // Moyenne et écart type des ln Sa d'un jeu mis à l'échelle, à chaque période.
  function statistiques(jeu, nT) {
    const n = jeu.length, moy = new Array(nT).fill(0), et = new Array(nT).fill(0);
    for (const { Sa, s } of jeu) for (let k = 0; k < nT; k++) moy[k] += Math.log(s * Sa[k]) / n;
    if (n > 1) for (const { Sa, s } of jeu) for (let k = 0; k < nT; k++) et[k] += (Math.log(s * Sa[k]) - moy[k]) ** 2 / (n - 1);
    return { moy, et: et.map(Math.sqrt) };
  }
  // Critère d'un jeu : écart de la moyenne des ln à la cible et, si la cible a une dispersion, écart de
  // l'écart type à cette dispersion (poids w), sommés sur la plage.
  function critere(jeu, cible, idx, w) {
    const { moy, et } = statistiques(jeu, cible.ln.length);
    return idx.reduce((J, k) => J + (moy[k] - cible.ln[k]) ** 2 + (cible.sigma ? w * (et[k] - cible.sigma[k]) ** 2 : 0), 0) / idx.length;
  }

  // Sélection de n enregistrements parmi `candidats` ({ Sa }, en g) pour la cible { ln, sigma? } :
  // 1. chaque candidat est mis à l'échelle, soit sur toute la plage (moindres carrés en ln), soit à la
  //    période de conditionnement kStar (Sa(T*) = cible, comme pour un spectre conditionnel) ; ceux dont
  //    le facteur sort de [1/sMax, sMax] ou que `admissible` refuse sont écartés ; on garde les n plus
  //    proches (écart en ln sur la plage) ;
  // 2. si la cible a une dispersion (spectre conditionnel), échanges gloutons comme Jayaram, Lin et
  //    Baker (2011) : on remplace un enregistrement par le candidat qui réduit le plus le critère
  //    (moyenne et écart type), jusqu'à ce qu'aucun échange ne l'améliore.
  function selectionner(candidats, cible, T, { n = 7, Tmin = 0.1, Tmax = 3, sMax = 4, kStar = null, admissible = null, poidsSigma = 1, optimiser = true } = {}) {
    const idx = plage(T, Tmin, Tmax);
    const notes = [];
    candidats.forEach((c, i) => {
      if (admissible && !admissible(c)) return;
      const s = kStar === null ? facteur(c.Sa, cible.ln, idx) : Math.exp(cible.ln[kStar] - Math.log(c.Sa[kStar]));
      if (s >= 1 / sMax && s <= sMax) notes.push({ i, s, e: ecart(c.Sa, s, cible.ln, idx), Sa: c.Sa });
    });
    notes.sort((a, b) => a.e - b.e);
    if (notes.length < n) return null;
    let jeu = notes.slice(0, n), J = critere(jeu, cible, idx, poidsSigma), echanges = 0;
    if (optimiser && cible.sigma) {
      for (let tour = 0; tour < 50; tour++) {
        let meilleur = null;
        const pris = new Set(jeu.map(c => c.i));
        for (let a = 0; a < n; a++) for (const c of notes) {
          if (pris.has(c.i)) continue;
          const essai = jeu.slice(); essai[a] = c;
          const Je = critere(essai, cible, idx, poidsSigma);
          if (Je < (meilleur ? meilleur.J : J) - 1e-12) meilleur = { a, c, J: Je };
        }
        if (!meilleur) break;
        jeu[meilleur.a] = meilleur.c; J = meilleur.J; echanges++;
      }
    }
    const { moy, et } = statistiques(jeu, T.length);
    return { choisis: jeu.map(({ i, s, e }) => ({ i, s, e })), moyLn: moy, etLn: et, critere: J, echanges, admissibles: notes.length, idx };
  }

  // EN 1998-1:2004, § 3.2.3.1.2 (4) (applicable aux enregistrements par § 3.2.3.1.3 (3)) :
  //   a) au moins 3 accélérogrammes ;
  //   b) moyenne des accélérations à période nulle (PGA) ≥ ag·S ;
  //   c) entre 0,2·T1 et 2·T1, moyenne des spectres élastiques à 5 % ≥ 90 % du spectre élastique.
  // Moyennes arithmétiques. `jeu` : [{ Sa, pga }] déjà mis à l'échelle (g) ; Se : spectre (g) aux
  // périodes T. Renvoie les trois règles, le facteur commun minimal qui les satisfait et, selon le
  // § 4.3.3.4.3 (3), la valeur de réponse à retenir : moyenne dès 7 analyses, sinon la plus défavorable.
  function verifierEC8(jeu, T, Se, agS, T1) {
    const n = jeu.length, moy = T.map((_, k) => jeu.reduce((s, r) => s + r.Sa[k], 0) / n);
    const pga = jeu.reduce((s, r) => s + r.pga, 0) / n;
    const idx = plage(T, 0.2 * T1, 2 * T1);
    let rapportMin = Infinity, Tpire = null;
    for (const k of idx) { const r = moy[k] / (0.9 * Se[k]); if (r < rapportMin) { rapportMin = r; Tpire = T[k]; } }
    const TOL = 1e-9; // une règle tenue à l'arrondi près (jeu calé par facteurConformite) est tenue
    const regles = {
      nombre: { ok: n >= 3, valeur: n },
      pga: { ok: pga >= agS * (1 - TOL), valeur: pga, seuil: agS },
      spectre: { ok: rapportMin >= 1 - TOL, rapportMin, Tpire, plage: [0.2 * T1, 2 * T1] },
    };
    return {
      regles, moyenne: moy, pgaMoyen: pga, conforme: regles.nombre.ok && regles.pga.ok && regles.spectre.ok,
      facteurConformite: Math.max(agS / pga, 1 / rapportMin),
      reponse: n >= 7 ? 'moyenne' : 'plus défavorable',
    };
  }

  return { interpoler, plage, facteur, ecart, statistiques, critere, selectionner, verifierEC8 };
})();
export default Selection;
