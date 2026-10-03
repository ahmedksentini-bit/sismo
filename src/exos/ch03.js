// Exercices du chapitre 3 : le mécanisme au foyer. Les mécanismes et les polarités sortent du solveur
// (tenseur du double couple, rayonnement P, angles d'émergence du modèle de croûte) ; la figure est la
// sphère focale du cours.
import { frd, nombre, choixMelange, donnee } from "./alea.js";
import { ballon } from "../ballon.js";
import Me from "../sismo/mecanisme.js";

const n360 = (a) => ((a % 360) + 360) % 360;
const angle = (x) => `${frd(x, 0)}°`;
const plan = (m) => `${angle(m.azimut)} / ${angle(m.pendage)} / ${angle(m.glissement)}`;

export default [
  {
    id: "ch3-auxiliaire", titre: "Type de faille et plan auxiliaire", difficulte: 1,
    generer(a) {
      const pur = a.choix([-90, 90, 0, 180]);
      const az = a.entier(0, 71) * 5, dip = pur === 0 || pur === 180 ? a.entier(14, 18) * 5 : a.entier(5, 16) * 5;
      const mec = { azimut: az, pendage: dip, glissement: pur };
      const aux = Me.planAuxiliaire(az, dip, pur);
      const type = pur === -90 ? "faille normale" : pur === 90 ? "faille inverse" : pur === 0 ? "décrochement sénestre" : "décrochement dextre";
      const regle = pur === 90 || pur === -90
        ? `Pour un glissement de ±90°, le plan auxiliaire a l'azimut opposé (${angle(az)} + 180° = ${angle(n360(az + 180))}) et le pendage complémentaire (90° − ${angle(dip)} = ${angle(90 - dip)}), avec le même glissement.`
        : `Pour un décrochement pur, le glissement est horizontal : le plan auxiliaire est perpendiculaire à la faille et à la direction du glissement, d'azimut ${angle(aux.azimut)} et de pendage ${angle(aux.pendage)}.`;
      return {
        enonce: `Un séisme a pour mécanisme : azimut ${angle(az)}, pendage ${angle(dip)}, glissement ${angle(pur)}.`,
        donnees: [donnee("Mécanisme", plan(mec))],
        figure: ballon({ mec, R: 90, titre: "Sphère focale" }),
        questions: [
          choixMelange(a, "Type de faille ?", [type, ...["faille normale", "faille inverse", "décrochement sénestre", "décrochement dextre"].filter((t) => t !== type)],
            "λ = −90° : le toit descend (normale) ; +90° : il monte (inverse) ; 0° : décrochement sénestre ; 180° : dextre."),
          nombre("Pendage du plan auxiliaire ?", aux.pendage, "°", regle, { abs: 1.5 }),
          pur === 90 || pur === -90
            ? nombre("Azimut du plan auxiliaire (0 à 360°, faille plongeant à droite) ?", aux.azimut, "°", regle, { abs: 1.5 })
            : nombre("Plan auxiliaire vertical : son azimut, compté entre 0 et 180° ?", n360(aux.azimut) % 180, "°", `${regle} Un plan vertical se désigne indifféremment par ${angle(n360(aux.azimut) % 180)} ou ${angle((n360(aux.azimut) % 180) + 180)}.`, { abs: 1.5 }),
          choixMelange(a, "Les polarités des premières arrivées permettent-elles de savoir lequel des deux plans a joué ?",
            ["non : un glissement sur l'un ou l'autre plan rayonne de la même façon", "oui : le plan de faille est toujours le plus pentu", "oui : le plan de faille est toujours le moins pentu", "oui : le plan de faille passe toujours par l'axe P"],
            "C'est l'ambiguïté du double couple ; on tranche par les répliques, la rupture en surface, la géologie ou la géodésie."),
        ],
      };
    },
  },
  {
    id: "ch3-lecture", titre: "Lire les polarités sur la sphère focale", difficulte: 2,
    generer(a) {
      const mec = { azimut: a.entier(0, 71) * 5, pendage: a.entier(6, 17) * 5, glissement: a.choix([-90, 90, 0, 180, -60, 60, 120, -120, 30, 150]) };
      const M = Me.tenseur(mec.azimut, mec.pendage, mec.glissement);
      // quatre stations nettement à l'intérieur des quadrants, deux compressions et deux dilatations
      const st = [];
      for (let essai = 0; st.length < 4 && essai < 5000; essai++) {
        const delta = a.entier(5, 140), az = a.entier(0, 359), e = Me.emergence(delta, 10), r = Me.rayonnementP(M, e.i, az);
        const veut = st.filter((s) => s.polarite > 0).length < 2 ? 1 : -1;
        if (Math.abs(r) > 0.35 && Math.sign(r) === veut && st.every((s) => Math.abs(s.az - az) > 25 || Math.abs(s.i - e.i) > 25)) st.push({ az, i: e.i, delta, polarite: veut, onde: e.onde });
      }
      const noms = ["A", "B", "C", "D"], ordre = a.tirage([0, 1, 2, 3]);
      const stations = ordre.map((k, j) => ({ ...st[k], nom: noms[j] }));
      const comp = stations.filter((s) => s.polarite > 0).map((s) => s.nom).join(" et ");
      const autres = [["A", "B"], ["A", "C"], ["A", "D"], ["B", "C"], ["B", "D"], ["C", "D"]].map((x) => x.join(" et ")).filter((x) => x !== comp);
      const type = Me.typeFaille(mec.glissement);
      const centreComp = Me.rayonnementP(M, 0, 0) > 0;
      return {
        enonce: `La sphère focale d'un séisme (hémisphère inférieur, quadrants en compression teintés) porte les points de percée des rais de quatre stations A, B, C et D.`,
        figure: ballon({ mec, R: 100, axes: false, stations: stations.map((s) => ({ ...s, polarite: 0 })), titre: "Sphère focale et stations" }).replace(/<circle([^>]*)fill="#fff" stroke="#0f172a" stroke-width="1.6"\/>/g, `<circle$1fill="#f59e0b" stroke="#0f172a" stroke-width="1.6"/>`),
        questions: [
          choixMelange(a, "Quelles stations voient le premier mouvement de l'onde P vers le haut (compression) ?", [comp, ...a.tirage(autres, 3)],
            `Les stations ${comp} sont dans les quadrants teintés, donc en compression : le sol y monte au premier mouvement. Les deux autres sont en dilatation.`),
          choixMelange(a, "Type de faille ?", [`faille ${type}`.replace("faille décrochement", "décrochement"), ...["faille normale", "faille inverse", "décrochement"].filter((t) => t !== `faille ${type}`.replace("faille décrochement", "décrochement"))],
            `Mécanisme ${plan(mec)} : ${centreComp ? "centre teinté" : "centre blanc"}${type === "décrochement" ? ", plans presque verticaux en croix" : ""}. ${type === "normale" ? "Centre blanc : le rai vertical part en dilatation, faille normale." : type === "inverse" ? "Centre teinté : faille inverse." : "Décrochement : quatre quartiers alternés."}`),
          choixMelange(a, "Où se trouve l'axe P ?", ["au milieu des quadrants en dilatation", "au milieu des quadrants en compression", "sur un plan nodal", "toujours au centre de la sphère"],
            "L'axe P (pression) est à 45° des deux plans, au milieu des dilatations ; l'axe T au milieu des compressions."),
        ],
      };
    },
  },
  {
    id: "ch3-regime", titre: "Mécanismes et déformation de la croûte", difficulte: 2,
    generer(a) {
      const regime = a.choix(["inverse", "normale"]), az = a.entier(0, 35) * 5;
      const mec = { azimut: az, pendage: regime === "inverse" ? a.entier(5, 9) * 5 : a.entier(9, 13) * 5, glissement: regime === "inverse" ? 90 : -90 };
      const ax = Me.axes(Me.tenseur(mec.azimut, mec.pendage, mec.glissement));
      const horiz = regime === "inverse" ? ax.P : ax.T;
      const dirH = n360(horiz.azimut) % 180;
      const nomDir = (d) => ["nord–sud", "nord-nord-est–sud-sud-ouest", "nord-est–sud-ouest", "est-nord-est–ouest-sud-ouest", "est–ouest", "est-sud-est–ouest-nord-ouest", "nord-ouest–sud-est", "nord-nord-ouest–sud-sud-est"][Math.round(d / 22.5) % 8];
      return {
        enonce: `Les séismes d'une région ont presque tous le mécanisme ${plan(mec)} (azimut, pendage, glissement).`,
        donnees: [donnee("Mécanisme type", plan(mec))],
        figure: ballon({ mec, R: 90, titre: "Mécanisme type de la région" }),
        questions: [
          nombre(`Plongement de l'axe ${regime === "inverse" ? "P" : "T"} ?`, horiz.plongement, "°",
            `Pour un glissement de ±90°, les axes P et T sont dans le plan vertical perpendiculaire à la faille, à 45° des deux plans nodaux : l'axe ${regime === "inverse" ? "P" : "T"} plonge de |45° − ${angle(mec.pendage)}| = ${angle(horiz.plongement)}.`, { abs: 2 }),
          choixMelange(a, "La croûte de cette région…",
            regime === "inverse" ? ["se raccourcit horizontalement", "s'étire horizontalement", "coulisse sans se raccourcir ni s'étirer", "s'affaisse sans se déformer"] : ["s'étire horizontalement", "se raccourcit horizontalement", "coulisse sans se raccourcir ni s'étirer", "se soulève sans se déformer"],
            regime === "inverse" ? "Failles inverses : le toit monte, la croûte se raccourcit ; l'axe P est presque horizontal." : "Failles normales : le toit descend, la croûte s'étire ; l'axe T est presque horizontal."),
          choixMelange(a, `Dans quelle direction ${regime === "inverse" ? "se raccourcit" : "s'étire"}-t-elle ?`, [nomDir(dirH), ...a.tirage([0, 1, 2, 3, 4, 5, 6, 7].map((k) => nomDir(k * 22.5)).filter((x) => x !== nomDir(dirH)), 3)],
            `L'axe ${regime === "inverse" ? "P" : "T"} a pour azimut ${angle(horiz.azimut)} : perpendiculaire à la faille (azimut ${angle(az)}), direction ${nomDir(dirH)}.`),
        ],
      };
    },
  },
  {
    id: "ch3-inversion", titre: "Combien de stations pour un mécanisme ?", difficulte: 1,
    generer(a) {
      const pool = [
        ["Pour placer une polarité sur la sphère focale, il faut connaître…", ["l'azimut de la station vu de l'épicentre et l'angle d'émergence du rai", "la seule distance de la station", "l'amplitude de l'onde S", "la magnitude du séisme"],
          "Le point de percée sur la sphère est défini par l'azimut et l'angle d'émergence, tiré de la localisation et du modèle de croûte."],
        ["Un rai qui part vers le haut (station proche, onde Pg) est reporté sur l'hémisphère inférieur…", ["au point diamétralement opposé", "à la même place", "au centre de la sphère", "sur le bord, à l'azimut de la station"],
          "La polarité est la même dans deux directions opposées (le rayonnement P est pair) : on reporte le point opposé, sur l'hémisphère inférieur."],
        ["Avec six stations toutes à plus de 100 km et dans la même direction, la solution est…", ["mal contrainte : toute une famille de mécanismes convient", "parfaitement déterminée", "impossible à calculer", "toujours un décrochement"],
          "Les polarités doivent couvrir la sphère de part et d'autre de chaque plan ; sinon de nombreux mécanismes séparent aussi bien les compressions des dilatations."],
        ["Une polarité isolée en désaccord avec la meilleure solution indique le plus souvent…", ["un premier mouvement mal lu, noyé dans le bruit", "un second séisme simultané", "une erreur de magnitude", "que le plan de faille est l'autre plan"],
          "Les désaccords isolés viennent de premiers mouvements faibles (près d'un plan nodal) ou bruités."],
        ["Près d'un plan nodal, le premier mouvement de l'onde P est…", ["faible, et sa polarité difficile à lire", "le plus fort de tous", "toujours une compression", "remplacé par l'onde S"],
          "Le rayonnement P s'annule sur les plans nodaux : les stations voisines lisent des premiers mouvements faibles."],
        ["Le type de faille intervient dans le calcul du mouvement sismique…", ["par le terme de style de faille des lois d'atténuation", "il n'intervient jamais", "seulement par la magnitude", "seulement pour la liquéfaction"],
          "Les lois d'atténuation ont un terme de style de faille : à magnitude et distance égales, un séisme inverse secoue un peu plus qu'un décrochement."],
      ];
      return { enonce: "Questions sur la détermination du mécanisme au foyer.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
