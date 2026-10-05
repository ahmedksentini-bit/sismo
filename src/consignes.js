// Consignes des travaux pratiques : pour chaque banc, l'objectif, les étapes à suivre en mode Explorer puis en mode
// Exercice, et ce qu'il faut rendre. Données pures (aucun accès au DOM) ; src/onglets.js les place en tête de chaque
// banc, avec la durée indicative et le chapitre du cours (Parcours.LECONS). Les noms de boutons, de cases et de
// profils cités sont ceux de labo.html et des bancs (testé).
const CONSIGNES = {
  station: {
    objectif: "Lire un sismogramme à trois composantes, d'un séisme local puis lointain : pointer les ondes P et S (et pP), en déduire la distance, l'heure d'origine et la profondeur, mesurer la magnitude (ML ou Ms) et la direction de la source, et suivre la propagation des ondes du foyer à la station.",
    etapes: [
      "Gardez le séisme local proposé (Mw 3,8 à 85 km, foyer à 10 km) et décochez « Phases théoriques » pour pointer sans aide. Choisissez le filtre 1 – 10 Hz ; avec « Pointer P », cliquez le début du premier mouvement net sur la verticale (double-clic pour zoomer), puis, avec « Pointer S », la reprise d'amplitude sur une horizontale.",
      "Relevez tS − tP, la distance R ≈ 8,4 × (tS − tP) et l'heure d'origine t0 = tP − R/Vp. Avec « Mesurer A » (le lecteur passe en Wood-Anderson), cliquez le plus grand pic d'une horizontale : notez A et ML, et comparez ML à Mw.",
      "Lisez l'hodogramme : direction de la source à 180° près, puis le signe de la verticale pour lever l'ambiguïté. Suivez la carte « Propagation du séisme » à 30 km puis à 300 km : où l'onde conique Pn dépasse-t-elle Pg ?",
      "Choisissez « Lointain (téléséisme) » (Mw 6,8 à 62°, foyer à 35 km). Filtrez 0,5 – 2 Hz, pointez P, S puis pP ; relevez la distance Δ lue dans les tables ak135, l'heure d'origine et la profondeur. Avec « Mesurer A » sur l'onde de Rayleigh (Z, 18 – 22 s), notez A, T et Ms.",
      "Dans la coupe du globe, suivez les fronts P et S, puis passez le foyer à 300 km (que deviennent pP et les ondes de surface ?) et la distance à 120° (zone d'ombre : seules les phases du noyau arrivent).",
      "Passez en mode Exercice, pour un séisme local puis lointain : lisez le séisme inconnu, puis cliquez « Vérifier ».",
    ],
    rendre: "pour un séisme local et un lointain : tP, tS, la distance, t0, l'amplitude et la magnitude (ML ou Ms), la profondeur par pP − P pour le lointain, la direction de la source et sa polarité, avec les scores des exercices.",
  },
  reseau: {
    objectif: "Localiser un séisme avec quatre stations : cercles de distance, diagramme de Wadati, recherche sur grille, et juger la qualité de la localisation.",
    etapes: [
      "Laissez « Pointés automatiques » décoché (cochez-le seulement à la fin, pour comparer vos pointés à ceux du moteur) et décochez « Phases théoriques ».",
      "Pointez P puis S sur chacune des quatre stations ; l'outil passe seul de P à S, puis à la station suivante. Double-cliquez pour zoomer : toutes les traces suivent.",
      "Après chaque paire, regardez la carte (un cercle de rayon R par station) et la droite de Wadati : relevez Vp/Vs (pente + 1) et t0 (intersection avec l'axe).",
      "Lisez la localisation (épicentre, profondeur, heure d'origine, résidus) et comparez-la au séisme simulé. Expliquez pourquoi les cercles ne se coupent pas en un point.",
      "Faites glisser l'épicentre (l'étoile de la carte) hors du réseau : notez la lacune azimutale et l'allongement de la zone compatible. Comparez ensuite un foyer à 5 km et à 25 km.",
      "En mode Exercice, localisez un séisme inconnu, puis cliquez « Vérifier ». En mode « Séisme réel », chargez un vrai séisme enregistré depuis la page En direct (« Charger un fichier de séisme »), pointez P et S sur chaque station puis cliquez « Comparer à GEOFON » : écart d'épicentre et d'heure d'origine, arrivées prévues pour sa solution.",
    ],
    rendre: "le tableau des pointés et des résidus, l'épicentre, h, t0 et Vp/Vs, avec un commentaire sur la lacune azimutale (et, pour un séisme réel, l'écart à GEOFON).",
  },
  mecanisme: {
    objectif: "Retrouver le mécanisme au foyer à partir des polarités des premières arrivées P : plans nodaux, axes P et T, type de faille.",
    etapes: [
      "Choisissez le séisme « Inverse » avec 18 stations, en laissant « Montrer la solution vraie » décoché.",
      "Sur les premières arrivées, repérez les compressions (C) et les dilatations (D) ; un clic sur une trace situe la station sur la sphère.",
      "Réglez l'azimut, le pendage et le glissement du plan nodal jusqu'à n'avoir plus aucun désaccord.",
      "Relevez le plan auxiliaire et les axes P et T, et déduisez-en le type de faille.",
      "Lancez « Inverser » : combien de solutions au pas de 10° ? Recommencez avec 8 stations et voyez la famille de solutions s'élargir ; cochez enfin « Montrer la solution vraie ».",
      "En mode Exercice, ajustez le plan d'un séisme inconnu et donnez le type de faille, puis « Vérifier ». En mode « Séisme réel », chargez un vrai séisme enregistré depuis la page En direct (« Charger un fichier de séisme », le fichier du TP de localisation) : contrôlez chaque polarité en zoomant sur la trace, corrigez-la au besoin, réglez le plan puis comparez à « Inverser ».",
    ],
    rendre: "l'azimut, le pendage et le glissement du plan, le plan auxiliaire, les axes P et T, le type de faille et le nombre de désaccords (et, pour un séisme réel, les polarités retenues).",
  },
  source: {
    objectif: "Mesurer la taille d'un séisme sur le spectre des ondes S : moment sismique et Mw par le plateau, fréquence coin et chute de contrainte par le coude.",
    etapes: [
      "Gardez le générateur (Mw 4,8, Δσ 6 MPa) et choisissez la première station dans le tableau du modèle de Brune.",
      "Sur le spectre, comparez le spectre brut et le spectre corrigé du trajet : repérez le plateau et le coude.",
      "Réglez Ω0 sur le plateau, puis fc sur le coude ; notez M0, Mw et Δσ. Cliquez ensuite « Ajuster » et comparez à votre réglage.",
      "Recommencez pour les autres stations : la Mw spectrale reste-t-elle stable avec la distance ? Comparez-la à ML.",
      "Montez Mw à 6 : fc baisse et ML s'écarte de Mw. Puis, à Mw fixée, faites varier Δσ et observez fc.",
      "En mode Exercice, ajustez le modèle de la station affichée, donnez Mw et fc, puis « Vérifier ». En mode « Séisme réel », chargez un vrai séisme enregistré depuis la page En direct (« Charger un fichier de séisme ») : ajustez Brune station par station sur les bandes au-dessus du bruit, puis comparez Mw, ML et la magnitude de GEOFON.",
    ],
    rendre: "Ω0, fc, M0, Mw et Δσ par station, leur moyenne, et un commentaire sur l'écart entre ML et Mw (et, pour un séisme réel, avec la magnitude de GEOFON).",
  },
  sismometre: {
    objectif: "Comprendre ce que mesure un sismomètre : selon sa fréquence propre et son amortissement, il recopie le déplacement du sol ou son accélération.",
    etapes: [
      "Préréglage « Courte période », sol sinusoïdal à 5 Hz : la masse reste presque immobile dans le repère fixe et le stylet recopie −ug. Notez |X/Ug| mesuré et théorique.",
      "Même instrument, sol à 0,2 Hz : le stylet suit les tirets ambre, −üg/ω0² ; l'instrument est devenu un accéléromètre.",
      "Préréglage « Peu amorti », puis f = f0 : l'amplitude est multipliée par environ 1/(2ξ). Remontez ξ à 0,7 : le pic disparaît.",
      "« Lâcher de la masse » : comptez les oscillations ; leur décroissance d'un cycle à l'autre mesure ξ.",
      "Préréglage « Wood-Anderson » (T0 = 0,8 s, ξ = 0,8) : au-dessus de 1,25 Hz, il donne le déplacement du sol ; c'est l'instrument de référence de ML.",
      "Balayez f0 sous un même mouvement du sol : c'est ainsi qu'on construit le spectre de réponse d'un bâtiment (banc Spectre).",
    ],
    rendre: "un tableau f/f0, |X/Ug| mesuré et théorique, régime ; ξ estimé au lâcher ; l'instrument à choisir pour mesurer un déplacement ou une accélération.",
  },
  profil: {
    objectif: "Déduire la structure de la croûte d'un profil de stations : vitesses de la croûte et du manteau, temps d'intercept, épaisseur, distance de croisement.",
    etapes: [
      "Décochez « Hodochrones théoriques » ; gardez la réduction à 8 km/s et l'amplitude « P renforcée ».",
      "Outil « Droite Pg » : cliquez deux points sur les premières arrivées des stations proches.",
      "Outil « Droite Pn » : cliquez deux points sur les premières arrivées des stations lointaines, au-delà du croisement ; réduites à 8 km/s, elles sont presque horizontales.",
      "Relevez V1, V2, le temps d'intercept ti, l'angle critique, l'épaisseur H et la distance de croisement ; la « Coupe de la Terre » dessine votre croûte et ses rais, la « Carte des stations » les stations où Pn arrive la première, à comparer au modèle simulé (tirets).",
      "Prenez H = 20 km puis H = 50 km : sur la coupe, suivez le Moho, la distance critique et le croisement ; comment varie ti ?",
      "En mode Exercice, tracez les deux droites pour une croûte inconnue, puis « Vérifier ».",
    ],
    rendre: "V1, V2, ti, H et la distance de croisement, avec le calcul de H détaillé.",
  },
  spectre: {
    objectif: "Construire le spectre de réponse d'un accélérogramme avec une famille d'oscillateurs et le comparer au spectre élastique de l'Eurocode 8.",
    etapes: [
      "Avec Mw 5,5 à 20 km et ξ = 5 %, cliquez « Jouer » (au ralenti) : quels bâtiments réagissent le plus ?",
      "Relevez la pseudo-accélération Sa des six oscillateurs et retrouvez-la sur le spectre de réponse.",
      "Comparez le spectre au spectre de l'Eurocode 8 calé sur le PGA : type 2 puis type 1, sol A.",
      "Passez à Mw 7 à 100 km : où se déplace le pic ? Quel type de spectre convient alors ?",
      "« Votre ouvrage » : H = 15 m, portiques en béton, prenez T1 = Ct·H<sup>3/4</sup>. Comparez Sa(T1) du signal et Se(T1) de l'Eurocode 8, puis faites varier ξ de 2 à 20 %.",
    ],
    rendre: "Sa aux six périodes pour deux scénarios, le type de spectre retenu et justifié, le rapport Sa(T1)/Se(T1).",
  },
  sismicite: {
    objectif: "Analyser un catalogue de sismicité, simulé sur un siècle puis réel : périodes de complétude, valeur b, taux annuels et probabilités sur la durée de vie d'un ouvrage, avec et sans répliques.",
    etapes: [
      "Gardez le catalogue proposé (b = 1,00 ; 2 chocs principaux par an de M ≥ 4 ; répliques comprises) sans regarder la vérité terrain.",
      "Sur le graphique de Stepp, repérez pour chaque classe l'année où la courbe quitte la pente −1/2 : c'est votre table de complétude.",
      "Méthode « Aki » : fixez le début de la période et Mc (curseurs ou clic sur le catalogue), puis comparez à Mc par courbure maximale.",
      "Notez b ± σ, λ(M ≥ 5) et le nombre de séismes retenus, sans puis avec déclusterage.",
      "Méthode « Weichert » avec votre table : comparez b et λ. Dans « Probabilité sur une durée », calculez P(M ≥ 6 en 50 ans).",
      "En mode Exercice, analysez un nouveau catalogue, puis « Vérifier ». En mode « Catalogue réel », chargez un vrai catalogue (« Charger un catalogue » : texte FDSN, CSV de l'USGS ou tableau) ou téléchargez-en un (« Télécharger »), lisez son résumé et sa carte, gardez un seul « Type de magnitude analysé » s'il en mélange plusieurs, puis refaites l'analyse : ici, pas de corrigé. Tracez enfin des zones sismogènes sur la carte (« Tracer une zone »), relevez b, λ et Mmax de chacune, puis « Calculer l'aléa avec ces zones » ouvre le banc « aléa » sur votre modèle.",
    ],
    rendre: "la table de complétude, b ± σ, λ(M ≥ 5), la probabilité en 50 ans, et un commentaire sur l'effet des répliques ; pour un catalogue réel, sa source, son type de magnitude, Mc et b ± σ, et le tableau de vos zones sismogènes.",
  },
  geodesie: {
    objectif: "Tirer des taux de séismes de la déformation lente mesurée par GNSS : taux de déformation, moment de Kostrov, couplage, et confrontation au catalogue.",
    etapes: [
      "Gardez le réseau proposé et cochez « Afficher le champ vrai ».",
      "Sur le profil est–ouest, lisez la perte de vitesse à travers la zone B et sa largeur ; calculez le taux de raccourcissement (1 mm/an/km = 1 000 ns/an).",
      "Choisissez la zone B : comparez votre valeur au taux principal estimé, puis calculez le taux de moment de Kostrov (μ = 30 GPa, H = 15 km).",
      "Budget de moment : relevez le couplage apparent des zones A et B, et expliquez le moment « manquant » de la zone A (la faille F).",
      "Récurrence : comparez λ(M ≥ 5) du catalogue et de la géodésie pour χ = 0,3, 0,6 et 0,9 ; puis cliquez « Utiliser ces moments dans le banc Aléa ».",
      "En mode Exercice, traitez un nouveau réseau, puis « Vérifier ».",
    ],
    rendre: "le taux de déformation de la zone B, Ṁ0 géodésique (N·m/an), le couplage apparent, λ(M ≥ 5) des deux approches.",
  },
  alea: {
    objectif: "Calculer l'aléa d'un site par la méthode probabiliste : courbe d'aléa, spectre à probabilité uniforme, désagrégation, et poids de chaque branche de l'arbre logique.",
    etapes: [
      "Avec le modèle d'école à 10 % en 50 ans, relevez le PGA moyen et ses fractiles 16 et 84 %, Sa(0,2 s), Sa(1 s) et le scénario dominant.",
      "Sur la courbe d'aléa, lisez la probabilité de dépasser 0,2 g en 50 ans et vérifiez que 10 % en 50 ans correspond à 475 ans.",
      "Comparez l'UHS aux spectres de l'Eurocode 8 de type 1 et 2 calés sur le PGA : où l'UHS les dépasse-t-il ?",
      "Dans « Grandeur », sous la probabilité visée, choisissez Sa(1 s) : quelle zone domine la désagrégation ? Comparez au PGA, puis lisez le spectre moyen conditionnel.",
      "Graphique « Ce qui pèse dans l'arbre logique » : quelle branche pèse le plus ? Activez puis désactivez la faille F, déplacez le site près d'elle (clic sur la carte) et passez à 2 % en 50 ans.",
      "En mode Exercice, lisez PGA et Sa(1 s) à 475 ans et désignez la zone dominante, puis « Vérifier ».",
    ],
    rendre: "PGA, Sa(0,2 s) et Sa(1 s) avec leurs fractiles, le scénario dominant pour deux périodes, la branche la plus influente.",
    prerequis: "le banc Géodésie peut fournir les taux de moment des zones (bouton « Utiliser ces moments dans le banc Aléa »).",
  },
  selection: {
    objectif: "Choisir et caler un jeu d'accélérogrammes sur une cible (spectre conditionnel, UHS ou Eurocode 8) et contrôler les règles de l'EN 1998-1:2004.",
    etapes: [
      "Choisissez T1 = 1,0 s, la cible « CMS à T1 » et 10 % en 50 ans ; notez le scénario M̄, R̄.",
      "Avec 7 enregistrements et un facteur maximal de 4, observez l'écart du jeu à la cible. Cochez « Proches du scénario », puis « Échanges gloutons » : comment évoluent la moyenne et la dispersion ?",
      "Cliquez chaque ligne du tableau « Enregistrements choisis » : relevez le facteur, D5–95 et l'intensité d'Arias ; repérez les facteurs supérieurs à 2 et les durées courtes.",
      "Contrôle EN 1998-1:2004 : quelles règles sont tenues ? Notez le facteur commun minimal, puis appliquez-le.",
      "Refaites le calage avec les cibles UHS puis Eurocode 8, et comparez les facteurs communs.",
      "En mode Exercice, jugez un jeu, puis « Vérifier ».",
    ],
    rendre: "la liste du jeu (n°, M, Rjb, facteur, D5–95), le verdict de conformité, le facteur commun et la règle de réponse retenue.",
    prerequis: "faites d'abord le banc Aléa : ce banc relit son modèle à l'ouverture.",
  },
  site: {
    objectif: "Mesurer l'effet d'une colonne de sol sur le mouvement du rocher : fréquence propre, amplification, non-linéarité, classe de sol de l'Eurocode 8.",
    etapes: [
      "Profil d'école, séisme au rocher de 0,25 g, calcul « linéaire » : relevez Vs30, la classe de sol, f0 = Vs/4H et la fréquence du premier pic de la fonction de transfert.",
      "Passez en calcul « linéaire équivalent » : notez la distorsion maximale γmax, le glissement du pic et le PGA en surface.",
      "Faites passer le PGA au rocher de 0,05 à 0,5 g : comment évoluent l'amplification du PGA et celle des longues périodes ?",
      "Modifiez la première couche (Vs de 160 à 300 m/s) ou ajoutez une couche : suivez Vs30, la classe et f0.",
      "Comparez le spectre en surface au spectre de l'Eurocode 8 de la classe du site.",
      "En mode Exercice, calculez Vs30, la classe et f0 d'un profil donné, puis « Vérifier ».",
    ],
    rendre: "un tableau linéaire / linéaire équivalent (f0, pic, PGA en surface, γmax) pour deux niveaux de séisme, avec un commentaire sur l'Eurocode 8.",
  },
  liquefaction: {
    objectif: "Évaluer le risque de liquéfaction d'un sondage au pénétromètre : sollicitation CSR, résistance CRR, coefficient de sécurité, indice LPI et tassement.",
    etapes: [
      "Profil « Sables lâches », nappe à 1,5 m, amax = 0,25 g, M = 6,5 : repérez sur le sondage les couches où Ic < 2,6.",
      "Lisez CSR et CRR en profondeur ; notez FS minimal, sa profondeur et l'épaisseur où FS < 1.",
      "À 6 m, recalculez CSR à la main (formule du sous-titre) et comparez au graphique.",
      "Abaissez la nappe à 4 m, puis prenez M = 5,5 et M = 7,5 : quel est l'effet sur FS ?",
      "Relevez LPI et le tassement, et appliquez le critère de l'EN 1998-5 (FS ≥ 1,25).",
      "En mode Exercice, calculez CSR et FS à la profondeur donnée et concluez, puis « Vérifier ».",
    ],
    rendre: "les profondeurs liquéfiables, FS minimal, LPI et tassement pour trois scénarios, avec le calcul de CSR à 6 m.",
  },
  ductilite: {
    objectif: "Mesurer le déplacement d'un ouvrage qui plastifie : ductilité demandée, règles R–μ–T, méthode N2 face aux calculs temporels.",
    etapes: [
      "Prenez T = 0,5 s, R = 3 et un écrouissage nul, ag = 0,25 g, sol A : observez la boucle et le déplacement résiduel.",
      "Relevez le déplacement cible de la méthode N2 et la moyenne des sept calculs temporels ; calculez leur rapport.",
      "Prenez T = 0,2 s puis T = 1,5 s : quelle règle s'applique (courtes périodes ou égaux déplacements) ? Comparez μ à R.",
      "Sur les spectres de ductilité, vérifiez que la moyenne suit μ = R au-delà de TC et la règle N2 en deçà.",
      "Cliquez les lignes du tableau des calculs temporels : comparez umax d'un accélérogramme à l'autre et notez le rapport du plus grand au plus petit.",
      "En mode Exercice, calculez qu et le déplacement cible et désignez la règle, puis « Vérifier ».",
    ],
    rendre: "un tableau T, R, μ moyen, déplacement N2 et déplacement temporel pour trois périodes, avec un commentaire sur la dispersion.",
  },
  batiment: {
    objectif: "Analyser un bâtiment à étages selon l'Eurocode 8 : modes propres, forces latérales et analyse modale spectrale, déplacements entre étages et effets du second ordre.",
    etapes: [
      "Profil « Régulier » ; relevez T1 et les deux périodes approchées (Ct·H<sup>3/4</sup> et 2·√d).",
      "Modes propres : relevez périodes et masses effectives, et déterminez les modes à retenir (somme ≥ 90 %, chaque mode ≥ 5 %).",
      "La méthode des forces latérales est-elle applicable ? Comparez l'effort à la base Fb au Vb modal (SRSS ou CQC selon la règle affichée).",
      "Relevez l'effort tranchant par étage, dr·ν/h face à la limite choisie, et θ.",
      "Passez aux profils « Étage souple » puis « Toiture lourde » : régularité, masses effectives, étage critique. Comparez enfin les combinaisons modales aux calculs temporels.",
      "En mode Exercice, traitez le bâtiment donné, puis « Vérifier ».",
    ],
    rendre: "le tableau des modes, Fb, Vb, dr·ν/h maximal et θ pour deux profils, avec la règle de combinaison justifiée.",
  },
  poussee: {
    objectif: "Appliquer la méthode N2 (annexe B de l'EN 1998-1:2004) : courbe de capacité, système équivalent, déplacement cible, et le confronter à des calculs temporels non linéaires.",
    etapes: [
      "Profil « Dimensionné EC8 » : comparez les courbes de capacité des répartitions modale et uniforme.",
      "Suivez la « Méthode N2 pas à pas » pour la répartition modale (m*, Γ, F*y, d*y, T*, qu, d*t, dt), puis pour la répartition uniforme.",
      "Comparez dt à la moyenne des calculs temporels non linéaires.",
      "Glissements d'étage : quel étage plastifie ? Le calcul temporel le confirme-t-il ?",
      "Profil « Rez souple et faible » : observez le mécanisme d'étage et le glissement maximal, même quand le déplacement en tête reste modéré.",
      "En mode Exercice, appliquez l'annexe B (Γ, T*, dt et règle), puis « Vérifier ».",
    ],
    rendre: "le tableau N2 des deux répartitions, dt et la moyenne temporelle, l'étage critique de chaque profil.",
  },
  isolation: {
    objectif: "Dimensionner une isolation à la base par linéarisation équivalente et la vérifier par calcul temporel : période et amortissement effectifs, déplacement, accélération transmise.",
    etapes: [
      "Gardez les réglages proposés : relevez Teff, ξeff et le déplacement de calcul.",
      "Suivez les itérations de la linéarisation équivalente jusqu'au point fixe (tableau des itérations et graphique en escalier).",
      "Comparez l'accélération de la superstructure isolée à celle sur base fixe, et le déplacement temporel moyen au déplacement de calcul.",
      "Faites varier Q/W de 2 à 10 % : notez le compromis entre déplacement et accélération transmise.",
      "Faites varier Tiso de 1,5 à 4 s : comment évoluent Teff, le déplacement et l'accélération ?",
      "En mode Exercice, faites une itération à la main (Keff, ξeff, Teff, demande), puis « Vérifier ».",
    ],
    rendre: "un tableau Q/W, Teff, ξeff, déplacement de calcul, déplacement temporel et accélération isolée pour trois valeurs de Q/W, avec votre choix justifié.",
  },
};

/** Carte « Ce que vous allez faire » d'un banc (HTML). l : Parcours.LECONS[banc]. */
function carteConsigne(banc, l) {
  const c = CONSIGNES[banc];
  const cours = l.fichier ? ` · cours : <a href="${l.fichier}">${l.titre}</a>` : "";
  return `<details open><summary><h2>Ce que vous allez faire<small>Durée indicative : ${l.duree} min${cours}</small></h2></summary>
    <p><b>Objectif.</b> ${c.objectif}</p>
    ${c.prerequis ? `<p class="aide"><b>Avant de commencer.</b> ${c.prerequis.charAt(0).toUpperCase()}${c.prerequis.slice(1)}</p>` : ""}
    <ol class="experiences">${c.etapes.map((e) => `<li>${e}</li>`).join("")}</ol>
    <p class="a-rendre"><b>À rendre.</b> ${c.rendre.charAt(0).toUpperCase()}${c.rendre.slice(1)}</p></details>`;
}

export { CONSIGNES, carteConsigne };
