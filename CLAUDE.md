# CLAUDE.md — contexte du site de sismologie

Cours de sismologie et d'aléa sismique pour ingénieurs en poste ; l'Eurocode 8 fait
foi (1ʳᵉ et 2ᵉ génération côte à côte). Site statique sans framework, même charte que
les autres sites ksr-infra. Commentaires et textes en français ; nombres affichés avec
la virgule décimale.

## Invariants (à préserver)

1. **Solveurs purs** dans `src/sismo/` : aucun accès au DOM ; tout calcul nouveau y va
   et reçoit un test dans `tests/`.
2. **Causalité** : aucune énergie avant l'arrivée P. Les parties stochastiques sont
   coupées avant leur arrivée puis compensées (`compenserDC`) pour que la vitesse
   revienne à zéro ; les impulsions directes et les filtres d'affichage sont causaux.
3. **Intégrer avant de tronquer** : la vitesse se calcule sur les séries complètes
   (longueur FFT), jamais sur une accélération déjà coupée — sinon un palier apparaît
   avant l'événement.
4. **Wood-Anderson depuis l'accélération** : X = A / (4π²(f₀² − f² + 2i·h·f₀·f)),
   grandissement statique 1 (IASPEI) ; T₀ = 0,8 s, h = 0,8, gain d'affichage 2080.
5. **Calage** (Δσ, κ, Q, amplification) : ne pas y toucher sans relancer `npm test` ;
   le test de ML stable avec la distance est le garde-fou.
6. **Corrigés** : la vérité terrain vient du générateur (temps de trajet, ML mesurée
   sur le signal sans bruit), jamais d'une formule inverse.
7. **Localisation** : P prédite = première arrivée (Pg ou Pn), S prédite = Sg.
   Les exercices placent le séisme à moins de 135 km de toutes les stations.
8. **Sismomètre** : x est le déplacement de la masse par rapport au bâti ;
   X/Ug = r²/(1 − r² + 2iξr). Toute intégration passe par Newmark à accélération
   moyenne (`Oscillateur.integrer` ou `Oscillateur.pas`, identiques pas à pas, testé).
9. **Profil** : les temps sont comptés depuis l'origine ; la réduction (t − Δ/V) n'est
   qu'un affichage, les droites sont toujours calculées en temps vrais. La carte des stations et la coupe de la Terre
   se redessinent à chaque changement ; leur géométrie (distance critique, rais Pg et Pn, croisement) sort de
   `Refraction.coupe`, testée contre `Sismo.temps`. La croûte dessinée est celle des droites de l'étudiant (V₁, V₂, H des
   lectures ; phase première = droite la plus précoce) ; le modèle simulé (tirets) n'apparaît qu'en mode Explorer ou après
   « Vérifier », jamais avant.
10. **Spectre de réponse** : Sa = ω²·Sd (pseudo-accélération). Pas d'intégration
    ≤ T/20 (sous-pas par interpolation linéaire) ; le calcul progressif de l'animation
    et le calcul d'un bloc donnent le même spectre (testé). Le spectre EC8 affiché est
    celui de l'EN 1998-1:2004 (valeurs recommandées) ; la 2ᵉ génération viendra du
    texte de l'EN 1998-1-1:2024, pas de mémoire.
11. **Sismicité** : magnitudes rangées par classes de 0,1 ; b d'Aki avec la correction
    d'Utsu (Mc − ΔM/2). Les taux et les probabilités de Poisson se calculent sur le
    catalogue déclusteré ; la vérité des exercices est la loi des chocs principaux.
    Mode « Catalogue réel » : `src/sismo/catalogue.js` lit le texte FDSN, le CSV et le GeoJSON de l'USGS et tout tableau
    dont l'en-tête nomme les colonnes (heures en ms UTC, lignes rejetées comptées, non-séismes écartés) ; période, région
    et bornes des graphiques viennent des données ; déclusterage sur la sphère (haversine et année décimale d'HMTK, au
    jour près ; identique à HMTK sur le catalogue de référence, testé) ; types de magnitude mélangés signalés ; ni vérité
    ni corrigé. Téléchargement par le relais FDSN (service event, pages de 500, 20 au plus, liste blanche inchangée).
    Carte : `Catalogue.cadre` (antiméridien compris), fond Natural Earth du monde (`tools/carte/monde.py`), méditerranéen
    (plus fin) quand la vue y tient ; zoom et déplacement (pincer, molette, double clic, glisser, boutons) dans le cadre.
    **Zones sismogènes** (`src/sismo/zones.js`, testé) : polygones tracés sur la carte (sommets au toucher, fermeture sur le
    premier sommet), statistiques par la méthode d'Aki sur les réglages de l'analyse (période, Mc, déclusterage) : b propre
    à partir de 30 séismes, sinon b régional ; λ(≥ Mc) ; Mmax proposée = Mmax observée + 0,5 ; fichier « sismo-zones » v1 ;
    « Calculer l'aléa avec ces zones » publie le modèle (`src/zones-reel.js`), émet `alea:zones` et ouvre le banc « aléa ».
    `Zones.modelePsha` : projection équirectangulaire locale (km), Mmin du calcul max(Mc, 4), branches b ± 1,645σ.
    **Mécanismes au foyer** (`src/sismo/mecanismes.js`, testé) pour guider le tracé : ndk du Global CMT (Mw du moment
    scalaire, premier plan nodal), QuakeML (nodalPlane1, profondeur en m), tableaux à colonnes strike, dip, rake (ISC ;
    `Catalogue.lire` les attache aux séismes en `mec`) ; régimes de Zoback (1992) par les plongements de P, B et T ; sphères
    focales sur la carte (hémisphère inférieur, cache de canevas) ; chaque zone se voit proposer le mécanisme dominant de
    ses mécanismes tant que l'étudiant n'a pas choisi le sien. Le site ne télécharge pas les mécanismes : fichier à charger ;
    la case « Afficher les mécanismes » reste grisée (« aucun chargé ») tant qu'aucun n'est lu, et le bilan signale ceux hors de la
    région du catalogue.
12. **Références OpenQuake** : toute loi d'atténuation, tout traitement de catalogue et le
    moteur PSHA sont comparés à OpenQuake via `tests/references/` ; les coefficients sont
    exportés de hazardlib par `tools/oq/coefficients.py`, jamais recopiés à la main. Le
    déclusterage suit les conventions de HMTK (année de 364,75 j, amas, pas de condition de
    magnitude). OpenQuake n'est jamais embarqué dans le site (AGPL). Les équations des lois montrées au cours
    (chapitre 10, notes de calcul) se déroulent par `Gmpe.LOIS[id].detailler` : la somme des termes affichés est la
    médiane du solveur (testé) ; les tableaux de coefficients (`src/gmpe-notes.js`) sont lus dans les fichiers exportés.
13. **PSHA** (`src/sismo/psha.js`) : classes de magnitude et taux de la Gutenberg-Richter
    tronquée identiques à `TruncatedGRMFD` (arrondi au pas, centres m₀ + pas/2) ; écarts types
    tronqués à ±3σ ; PoE = 1 − exp(−λT) ; la moyenne de l'arbre porte sur les probabilités,
    les fractiles interpolent les poids cumulés comme `hazardlib.stats.quantile_curve`.
    Variantes de taux : « catalogue » garde a quand Mmax change ; « géodésie » garde le moment
    χ·Ṁ0 (a recalculé comme `TruncatedGRMFD._set_a`). Une réalisation se désigne par sa clé
    « variante|ΔMmax|loi ». Un fractile peut sauter de
    quelques % quand deux réalisations quasi égales changent d'ordre : le test vérifie
    l'algorithme sur les courbes d'OpenQuake. La carte d'aléa (`niveauSite`) est la moyenne de l'arbre site par
    site, sans fractiles, comparée au job `carte` d'OpenQuake (six sites). Après tout changement du modèle d'école,
    relancer `npm run references` (OpenQuake, ~10 min). `Psha.modeleSimple` (une zone circulaire, sans faille ni
    branche) sert au cours ; il est testé contre la somme directe de Cornell sur une zone ponctuelle.
    Mode « Zones du catalogue » du banc « aléa » (`src/zones-reel.js`, `alea:zones`) : `Zones.modelePsha` dans un repère
    fixe, projection équirectangulaire autour de `Zones.centre(zones)` (le site cliqué s'y place en lat/lon, le repère ne
    bouge pas) ; `pasGrille` = le plus petit pas de `Zones.pasAdapte` donnant au plus 1 500 points (un calcul : 1 à 2 s),
    branches (a, b) jusqu'à quatre zones à σ(b) > 0 (729 réalisations), carte d'aléa de 250 sites au plus
    (`Zones.grilleAlea`) ; Explorer retrouve ses réglages en sortant. **Failles réelles** (`src/sismo/failles.js`, testé) :
    base GEM des failles actives (CC BY-SA 4.0, Styron et Pagani 2020), extrait méditerranéen `data/failles-mediterranee.json`
    refait par `tools/failles/gem.mjs` (jamais à la main ; frontières de plaques de Bird 2003, subductions, dorsales, plis
    écartés), ou GeoJSON de la base chargé ; défauts par type (rake à 45° pour les obliques, pendage 90/55/45/70°, 0–15 km) ;
    vitesse nette, sinon recomposée (rejet vertical / sin δ, raccourcissement / cos δ) ; faille retenue si le milieu de sa trace
    est dans une zone ; trace ramenée à ses extrémités, retournée pour que le pendage soit à droite ; Mmax = rupture entière
    (WC1994) au dixième ; hors du calcul si Mmax ≤ Mmax de la zone + ΔMmax le plus bas ; maillage `Failles.pasAdapte`
    (15 000 ruptures au plus). **GNSS réel** (`src/sismo/gnss.js`, testé) : psvelo ou tableau à en-tête (m/an converti) ;
    tenseur par zone dans son propre repère, vitesses tournées de la convergence des méridiens (une rotation rigide de plaque
    ne donne aucune déformation, testé) ; σ station ≥ 0,2 mm/an ; Kostrov μ = 30 GPa, H = 15 km. Une zone sans tenseur
    (moins de 3 stations : moment null) garde la loi centrale du catalogue et ses failles leur moment entier dans les
    variantes géodésiques (`Psha.variantes`).
14. **Géodésie** (`src/sismo/geodesie.js`) : le champ vrai ne dépend que de x (faille de
    Savage et Burford, bande de raccourcissement uniforme) ; ε̇ en ns/an (1 mm/an/km = 1000 ns/an) ;
    e1h est l'axe le plus compressif, comme HMTK ; Kostrov sous la forme de Savage et Simpson
    (1997) ; M0 = 10^(1,5M + 9,05) ; équilibre en moment par l'intégrale continue de
    `_set_a`, pas `from_moment` (qui intègre depuis M = 0 avec 9,1). La vérité des exercices est
    le tenseur moyen du générateur sur la zone, jamais un ajustement bruité.
15. **Failles** (`src/sismo/faille.js`) : maillage et ruptures flottantes comme `SimpleFaultSource`
    (nœuds tous les `pasFaille` = 1 km = `rupture_mesh_spacing`, arrondis à la Python, taux de la
    classe partagé également entre positions) ; aire de rupture de WC1994 ; aléa en Rjb. La loi d'une
    faille va du Mmax de sa zone (ΔMmax compris) à son Mmax et libère μ·L·W·s (catalogue) ou χ·μ·L·W·s
    (géodésie, le fond de la zone recevant χ·(Ṁ0 − Ṁfailles)). Rrup « à la OpenQuake »
    (`rrupSphere` : nœuds, Terre sphérique) ne sert qu'à comparer la désagrégation.
16. **Onglets** : `src/onglets.js` émet `banc:ouvert` ; un banc caché ne dessine pas
    (ses canvas ont une largeur nulle) et se construit à sa première ouverture. Le plan du cours (chapitres,
    ordre, ancres) vit dans `src/parcours.js` ; un nouveau banc s'y ajoute, dans l'ordre de la barre (testé). Chaque banc
    s'ouvre sur sa **consigne** (`src/consignes.js`, carte `#consigne-<banc>` en tête du poste : objectif, étapes en mode
    Explorer puis Exercice, à rendre ; tout libellé cité « entre guillemets » existe dans la page, testé). Les réglages
    viennent avant les résultats qui en découlent ; sous 1100 px, les deux colonnes se fondent (`display: contents`) et
    l'ordre de lecture vient de `--o` (mode 10, réglages 20, lectures 25, graphes 40 et plus, à retenir 90). En mode
    Exercice, rien n'affiche la réponse demandée avant « Vérifier » : ni le générateur (source), ni qu (ductilité), ni les
    modes retenus ou le domaine des forces latérales (bâtiment), ni le type de faille (mécanisme), ni la moyenne de
    l'arbre (aléa).
17. **Spectre conditionnel** (`Psha.spectreConditionnel`) : Lin et al. (2013) comme le post-traitement
    `conditional_spectrum` d'OpenQuake, corrélation de Baker et Jayaram (2008), poids
    ws = λu·P(Sa(T*) > x | u)/λ(P) avec λ(P) = −ln(1 − P)/T ; la moyenne de l'arbre pondère les taux, comme
    les réalisations (linéaire). Le site affiche le spectre normalisé par Σ ws, donc CMS(T*) = x et σ(T*) = 0
    (testé) ; `oq` rend les sommes non normalisées qu'écrit OpenQuake. OpenQuake 3.26 relie mal groupes de
    sources et réalisations au-delà de dix modèles de sources (ordre de `numpy.unique` sur des chaînes) :
    `tools/oq/psha.py` réagrège avec ses briques, jamais lire `cs-stats` tel quel.
18. **Accélérogrammes** (`src/sismo/accelerogramme.js`) : fenêtre S seule (Boore 2003), source à deux
    coins d'Atkinson et Silva (2000), trajet et site de `signal.js` (le calage des sismogrammes n'y est pour
    rien) ; variabilité tirée de la graine (fa, κ, terme d'événement). La correction c(f) est un fichier
    produit (`npm run calage`) qui cale la moyenne des ln Sa sur la médiane des trois lois : à relancer après
    tout changement du trajet, du site, de la source ou des lois ; le test hors calage tolère 0,12 en ln.
    Dans l'assemblage autonome, le nom importé doit être celui de la constante du module.
19. **Sélection** (`src/sismo/selection.js`) : cible CMS → chaque enregistrement calé à Sa(T*) ; UHS ou EC8 →
    moindres carrés en ln sur [0,2·T1 ; 2·T1] ; échanges gloutons (Jayaram et al. 2011) sur la moyenne et
    l'écart type des ln. Contrôle de l'EN 1998-1:2004 § 3.2.3.1.2 (4) (par § 3.2.3.1.3 (3)) sur moyennes
    arithmétiques, réponse retenue selon § 4.3.3.4.3 (3). Spectre EC8 calé comme au banc « aléa » : ag·S = PGA
    de l'UHS, sol par Vs30, type 2 si M̄ (Mw, en guise de Ms) ≤ 5,5. Le banc ne recalcule l'aléa reçu
    (`alea:modele`) qu'à son ouverture.
20. **Site** (`src/sismo/site.js`) : ondes SH verticales (Kramer 1996), G* = G·(√(1 − 4ξ²) + 2iξ) (Dormieux et
    Canou), entrée à l'affleurement du rocher (2·A), surface libre. Linéaire équivalent comme pystrata (référence
    `tests/references/site.json`, `tools/pystrata/`) : Darendeli échantillonné sur 20 déformations de 10⁻⁶ à
    10^−1,5 et interpolé en ln γ, ξ0 = valeur de la courbe à 10⁻⁶ (pas Dmin), départ γ = PGV/Vs, γeff = 0,65·γmax
    au milieu des sous-couches (≤ 2,5 m). Vs30 = 800 m/s compte comme A (comme le banc « aléa »). Les
    accélérogrammes de référence viennent de `accelerogramme.js` : régénérer les références après `npm run calage`.
21. **Liquéfaction** (`src/sismo/liquefaction.js`) : Boulanger et Idriss (2014), c0 = 2,8, aux conventions de
    liquepy (référence `tests/references/liquefaction.json`, `tools/liquepy/`) : Pa = 101 kPa mais 100 kPa dans Kσ,
    γw = 9,8, contraintes cumulées vers le bas avec pré-forage à 17 kN/m³, CRR7,5 = 4 au-dessus de la nappe et pour
    Ic > 2,6 (FS = 2,25), FS plafonné à 2. L'annexe B de l'EN 1998-5 n'est pas recopiée de mémoire : seule la
    valeur recommandée λ = 0,8 (FS ≥ 1,25) est citée.
22. **Inélastique** (`src/sismo/inelastique.js`) : ressort bilinéaire cinématique (bornes de pente α·k décalées de
    ±(1 − α)·fy, comme Steel01 sans écrouissage isotrope), c = 2ξω constant, Newmark à accélération moyenne avec
    Newton depuis l'état validé, sous-pas ≤ T/20 comme le spectre élastique (limite élastique testée). Référence
    OpenSeesPy (`tools/opensees/`). N2 : déplacement cible de l'annexe B de l'EN 1998-1:2004 sur le système
    équivalent ; Rμ = plus petit R qui atteint la ductilité visée (non-unicité de μ(R)).
23. **Mécanisme** (`src/sismo/mecanisme.js`) : Aki et Richards en NED (x nord, y est, z bas), émergence depuis la
    verticale descendante, polarité positive = compression ; Schmidt sur l'hémisphère inférieur (rai montant →
    direction opposée). Référence ObsPy (`tools/obspy/`, NED → USE). La vérité des exercices est le mécanisme du
    générateur ; les lectures sont le signe du premier extrême de la trace bruitée (comme un analyste), non le
    signe du rayonnement.
24. **Source** (`src/sismo/source.js`) : mêmes constantes que le générateur (Rθφ = 0,63, F = 2, Reff de
    saturation, Q(f), κ, amplification du site) ; Mw = (log10 M0 − 9,05)/1,5 et Δσ de la relation de Brune du
    générateur ; la correction de Reff dépend de Mw : itérée. La vérité est le Mw et le Δσ du générateur ; le
    banc se limite à Mw ≤ 6 (au-delà, fc passe sous 0,2 Hz et la fenêtre S ne suffit plus). La barre des bancs
    passe à la ligne (dix-sept onglets) : ne pas la remettre sur une seule ligne forcée.
25. **Intensité** (`src/sismo/intensite.js`) : conventions d'eqsig (référence `tests/references/intensite.json`,
    `tools/eqsig/`) : trapèzes, Arias avec g = 9,81 m/s², bornes de durée aux indices strictement compris entre les
    fractions de Ia (Trifunac et Brady 1975). Les indicateurs de la banque sont calculés à l'échelle 1 : Arias se
    multiplie par s², CAV et PGV par s, les durées sont invariantes (testé).
26. **Bâtiment** (`src/sismo/batiment.js`) : console de cisaillement, masses en t, rigidités en kN/m, forces en kN ;
    déformées normées au sommet. EN 1998-1:2004 : spectre de calcul (3.13)–(3.16) dans `Spectre.ec8Calcul` ; forces
    latérales si T1 ≤ min(4·TC ; 2 s) et régularité en élévation (jugée par le profil), λ = 0,85 si T1 ≤ 2·TC et plus de
    deux étages ; modes retenus par 90 % et 5 % ; SRSS si Tj ≤ 0,9·Ti, sinon CQC ; dr = q·de ; θ avec Ptot = g·Σm. Le
    calcul temporel superpose tous les modes sur une grille fine commune (sous-pas du mode le plus court) : c'est le
    Newmark du système couplé à amortissement modal d'OpenSeesPy (`tools/opensees/batiment.py`, testé à 10⁻¹⁰).
27. **Poussée** (`src/sismo/poussee.js`) : étages élastiques parfaitement plastiques ; la courbe de capacité est
    bilinéaire (mécanisme de l'étage où Vy_i / S_i est minimal), donc l'idéalisation à aire égale de l'annexe B est
    exacte. Profils « modal » Fi = mi·Φi (Φ du mode 1 normée au sommet) et « uniforme » Fi = mi (Γ = 1) ; dt = Γ·d*t
    avec `Inelastique.n2`. Résistances = ω × efforts de l'analyse modale de calcul. Calcul temporel : Rayleigh sur la
    rigidité initiale (ξ aux modes 1 et 2), Newmark et Newton couplés, sous-pas du mode le plus court ; OpenSees
    exige `-doRayleigh` sur les zeroLength, sans quoi l'amortissement de raideur disparaît. Option `amortissement`
    { a0, c } : C = a0·M + amortisseurs d'étage c_i (Rayleigh ⇔ c_i = a1·k_i) ; α peut être donné par étage.
28. **Isolation** (`src/sismo/isolation.js`) : isolateur bilinéaire défini par Tiso (K2 de la masse portée totale),
    Q = q·M·g (force à déplacement nul) et dy ; ED = 4·Q·(d − dy) (testé sur le ressort cinématique) ; ξeff = ξv +
    ED/(2π·Keff·d²), demande η·Se(Teff)·(Teff/2π)² par `Spectre.ec8(T, { xi })` (η ≥ 0,55) ; point fixe avec relaxation.
    Bâtiment isolé : dalle de base (30 % de la superstructure) + superstructure à un niveau, amortisseurs d'étage (pas
    de Rayleigh, qui amortirait le mode isolé). Accélérogrammes calés autour de Teff ; la base fixe reçoit le même
    mouvement. Le chapitre 10 de l'EN 1998-1 n'est cité qu'en général, pas recopié de mémoire.
29. **Cours** (organisation du site de fondations) : `index.html` accueil et pages de chapitre, `cours.html` un
    chapitre par section `#chN` avec calculateurs (`src/cours-chN.js`, champs `data-curseur`), `exerciseur.html`,
    `labo.html` les bancs, polycopié produit par `npm run polycopie` (à relancer après toute modification de
    `cours.html`). `data/chapitres.json` suit l'ordre des bancs : le chapitre n a pour TP le banc de rang n, ses
    parties A–D sont les groupes de `Parcours.CHAPITRES`, son titre celui de `Parcours.LECONS` (testé). Un chapitre
    rédigé : `"cours": true`, section dans `cours.html`, `LECONS[banc].fichier = 'cours.html#chN'`. Les exercices
    (`src/exos/chNN.js`) tirent leurs lectures du générateur et appliquent les règles du cours aux valeurs arrondies ;
    les banques `data/exercices-chN.json` se régénèrent par `npm run exercices` (test de reproductibilité). Les
    exemples chiffrés du texte sont testés. Les anciennes ancres de bancs sur `index.html` redirigent vers `labo.html`.
    Chaque calculateur écrit sa **note de calcul** (`ui.noter` dans `<div id="calc…Note">`) : données, puis pour chaque
    étape la formule littérale, l'application numérique et le résultat, avec les valeurs mêmes du calcul (testé).
30. **Globe** (`src/sismo/globe.js`) : Terre à symétrie sphérique ak135, dont le modèle (`coefficients/ak135.js`)
    est exporté d'ObsPy par `tools/obspy/globe.py`, jamais recopié à la main. Sous-couches ≤ 10 km, vitesses
    linéaires en profondeur entre nœuds, loi de Bullen v = A·r^B par sous-couche (Δ et T en forme close), nœud
    inséré à la profondeur du foyer. Une phase est une suite de segments (P, S, K, I) ; un segment non final ne
    tourne pas, un rai qui ne pénètre pas la région suivante n'appartient pas à la phase (réflexion totale). Les
    phases de profondeur (pP, sP) commencent par un segment montant jusqu'à la surface ; angle de départ compté
    depuis la verticale descendante, comme TauP. Échantillonnage de p resserré juste sous η = r/v de chaque nœud du
    modèle (sans quoi des triplications échappent). Toutes les arrivées de TauP (10 phases, 4 profondeurs,
    28 distances, `tests/references/phases.json`) sont retrouvées, aucune de plus : temps à 0,02 s, angles à 0,05°.
    Le mode `rapide` (80 rais) n'est exact que là où Δ(p) est monotone : P, pP, sP de 40° à 95° (testé) ; il sert
    à `retard` et `profondeur`. L'onde P diffractée n'est pas calculée. Les **tables de temps de trajet** du cours
    (`src/sismo/tables.js`) en sortent : chaque case de la table télésismique est la première arrivée de TauP (testé
    sur 4 profondeurs × 18 distances × 8 phases) ; la table régionale est `Sismo.temps` (S − P = Sg − première P) ;
    la lecture interpole linéairement entre deux lignes et se contrôle par dichotomie sur les rais. Les en-têtes de
    tableaux portant des noms de phases ou des unités gardent leur casse (classes `phases`, `coefficients`).
31. **Schémas de principe** (`src/schemas.js`, rempli par `src/cours-schemas.js`) : une figure par notion physique,
    SVG pur, conteneur `<div class="figure-cours" id="schema…">` unique dans `cours.html`, légende dans `SCHEMAS`
    (testé) ; chaque chapitre rédigé en a au moins un (testé). Ce qui se chiffre sort des solveurs (aires de Wells et
    Coppersmith, mécanismes, spectre EC8, modèle simple d'aléa, loi d'Akkar, modes du bâtiment) ; le reste est dessiné
    « de principe ». Un SVG imbriqué (sphère focale) porte sa taille en style en ligne, sinon la règle
    `.figure-cours svg` (largeur 100 %) l'agrandit. Les **schémas des notes de calcul** (`src/schemas-notes.js`, outils
    communs dans `src/traits.js`) se dessinent avec les valeurs du calcul et se placent sous leur étape (`{ schema,
    legende }` de `ui.noter`) ; ils restent lisibles dans les cas limites (station sur l'épicentre, tenseur isotrope, pas de
    Pn…), chaque figure sert à un calculateur et ce qu'elle chiffre est ce que calcule la note (testé). Une faille
    quelconque se dessine dans son repère (trace fixe, azimut sur une rose à part), jamais en projection géographique.
32. **Téléséismes** (`src/sismo/teleseisme.js`, banc « station », type « Lointain ») : phases ak135 de Globe (P, pP, sP,
    PcP, PKP, PKiKP, PKIKP, S, ScS, SKS) ; amplitudes de la théorie des rais : double couple tiré de la graine
    (`rayonnementP`, `rayonnementS` au signe d'Aki et Richards, éq. 4.29, opposé au `farfield 'S'` d'ObsPy), expansion
    géométrique tirée de dp/dΔ (bornée aux caustiques), t*, coefficients de réflexion et de transmission d'ordre de grandeur ;
    Brune à Δσ = 10 MPa, t* donné à 1 Hz (P) ou 0,3 Hz (S) et appliqué par (1 + i·f/f1)⁻⁴, égal à exp(−π·f·t*) à cette
    fréquence (avec Δσ = 3 MPa et une seule paire de pôles, la P à 1 Hz était dix fois trop faible) ; codas 2 s (P) et
    4 s (S) après l'onde directe, pour que le premier mouvement reste lisible. 20 Hz
    (voies BH) ; la vitesse est l'intégrale causale (niveau d'avant P retranché). Ondes de surface c(T) = c0 + a·ln T,
    Q = 290, calées (`CALAGE`) pour que la Ms mesurée sans bruit (déplacement vertical, Butterworth d'ordre 4 de 18 à 22 s,
    IASPEI 2013) soit stable de 20° à 160° et proche de Mw avant la saturation (testé) : à recaler après tout changement de
    la source, des ondes de surface ou du filtre. Lectures : Δ par S − P dans les rais ak135 (foyer supposé à 33 km tant que
    pP n'est pas pointée, faux de plusieurs degrés pour un foyer profond), h par pP − P (`Globe.profondeur`, 40° à 95°),
    t0 = tP − T_P. La vérité des exercices est le générateur (Δ, h, Ms mesurée sans bruit).
33. **Propagation** (`src/sismo/propagation.js`, animation `src/propagation-anim.js`) : un front d'onde est la position au
    temps t (`Globe.position` sur `Globe.trajet`, qui porte le temps, vérifiés contre `get_ray_paths` de TauP,
    `tests/references/trajets.json`) d'un faisceau de rais resserré aux changements de phase ; transmis (P, PKP, PKIKP ; S,
    SKS : jamais d'onde S dans le noyau), réfléchis sous la surface (pP, sS, trait fin) ou sur le noyau (PcP, ScS, tirets) ;
    le front rejoint la surface par interpolation des arrivées. Séisme local : coupe de la croûte du générateur (rais droits,
    Snell au Moho, onde conique). En mode Exercice, l'animation reste masquée jusqu'à « Vérifier ».
34. **En direct** (`direct.html`, `src/direct-page.js`) : stations autour de la Méditerranée des centres de données de
    `src/sismo/centres.js` (GEOFON, INGV, Epos-France, NOA, KOERI, SED, NIEP, ORFEUS, IGN, ICGC, EarthScope), choisies par
    réseau (carte « Réseaux », GE et tout réseau ayant une station en Tunisie cochés au départ, sinon le plus grand réseau
    permanent ; pays par les polygones de `tools/carte/pays.py`). La page démarre sur le réseau GE de GEOFON, demandé par
    son nom (requête courte) ; les inventaires complets des centres, lents sans nom de réseau, complètent la liste à
    leur arrivée (60 s au plus), et « Centres interrogés » donne la cause d'un échec. `api/geofon` reste un alias de
    `api/fdsn` pour les pages restées en cache. Carte : triangles = stations, disques = séismes des 7 derniers jours, légende
    faite des symboles mêmes de la carte ; toucher un objet (le plus proche, rayon élargi au doigt) ouvre sa fiche sous la
    carte (station : centre, pays, d'où viennent ses données, sa trace, « Suivre cette station » ; séisme : détails,
    arrivées placées sur les traces) ; un toucher ne change jamais à lui seul les stations suivies. Zoom (pincer, molette,
    double toucher, boutons) : la carte se zoome dans le domaine des côtes sans changer la zone de référence des stations ;
    les traces en direct remontent au plus 70 min (durée des tampons), « Revenir au direct » ; les sismogrammes d'un
    séisme se zooment dans leur fenêtre lue, filtrés sur toute la fenêtre. Sur les traces, Ctrl + molette seulement et
    touch-action: pan-y, pour que la page défile encore. Les séismes sont ceux du
    catalogue de GEOFON (7 derniers jours) ; « Sismogrammes de ce séisme » lit les archives (dataselect) de 10 stations au
    plus (`Direct.stationsSeisme` : les 3 plus proches puis des distances réparties), d'une minute avant l'origine à deux
    minutes après les ondes de surface (ou S) de la plus lointaine (`Direct.fenetreSeisme`, < 2 h). La liste des centres est la liste blanche des deux
    fonctions Cloudflare Pages (`functions/api/`), relais bornés : `seedlink.js` ouvre une connexion TCP vers le serveur SeedLink demandé, pour 12 flux validés au plus, reprise
    ≤ 30 min, ne transmet que les voies demandées, se ferme au bout de 10 min (la page se reconnecte depuis son dernier
    échantillon) ; `?sonde=1` dit quels serveurs répondent à HELLO, `?diagnostic=1` déroule l'échange avec l'un d'eux ;
    `fdsn.js` ne transmet que les services FDSN station, dataselect (≤ 2 h, ≤ 12 stations nommées) et event, au format
    texte. Chaque station suivie essaie le serveur SeedLink de son centre, puis GEOFON, puis le dataselect de son centre
    toutes les 20 s : elle passe au suivant si le serveur la refuse (STATION ou SELECT), échoue deux fois de suite ou ne
    livre rien d'elle en 60 s. Seuls GEOFON, Résif et EarthScope ont un serveur SeedLink connu ; les autres sont supposés
    sur l'hôte FDSN au port 18000 (`verifie: false`) jusqu'à confirmation par la sonde. Sans aucune liste de stations, mode
    « Démo (simulée) » : séisme fictif, signaux de `teleseisme.js`, toujours signalé comme tel. Décodage miniSEED
    (`src/sismo/miniseed.js`, Steim 1 et 2, entiers, réels) vérifié contre ObsPy ; protocole SeedLink
    (`src/sismo/seedlink.js`) ; filtres de Butterworth comme scipy (`butter` + `sosfilt`), STA/LTA et déclenchements comme
    ObsPy (`src/sismo/direct.js`). Détecteur : 0,7–2 Hz (ordre 4), STA 2 s / LTA 80 s, seuils 4 et 1,5 ; le bruit gaussien
    déclenche de temps en temps, c'est attendu. Côtes et pays Natural Earth produits par `tools/carte/cotes.py` et
    `tools/carte/pays.py`. Essai local sans réseau : `node tools/direct/serveurs-essai.mjs` puis `wrangler pages dev .
    --binding SEEDLINK_SERVEUR=127.0.0.1:18000 --binding "FDSN_ESSAI=http://127.0.0.1:8090/{centre}"`. **Propagation** :
    fronts P, S et de Rayleigh du séisme choisi (`Direct.tableFronts` : table de la localisation, h ≤ 40 km, jusqu'à 100°,
    sinon ak135 ; PKIKP et SKS au-delà de 100°, zone d'ombre franchie par interpolation, S = min(S, SKS), temps rendus
    croissants ; Rayleigh à la vitesse de groupe à 20 s ; testé), à l'heure de l'horloge tant que le séisme a moins de deux
    heures, ou au temps d'un rejeu (« Rejouer la propagation » : × 1 à × 60, pause, curseur, jusqu'aux ondes de Rayleigh à la
    station la plus lointaine) ; les stations de la carte s'allument au passage de la P et de la S prévues dans la même table ;
    un séisme réel de moins de 30 min, nouveau et plus récent que le choisi, est choisi tout seul (jamais pendant un rejeu) ;
    pendant un rejeu, un trait rouge suit le temps sur les sismogrammes du même séisme.
35. **Versions** (`tools/versions.mjs`, `npm run versions`) : chaque page qui charge des modules porte en tête une carte
    d'import (`<script type="importmap">`) qui donne à chaque module de `src/` l'empreinte de son contenu (`?v=`, 10
    caractères de SHA-256) ; scripts d'entrée et feuilles de style la portent dans leur attribut. Les pages HTML ne sont
    pas gardées en cache mais les scripts peuvent l'être plusieurs heures : sans versions, une page neuve exécutait
    d'anciens modules (la page « En direct » appelait un relais disparu). À relancer après toute modification d'un
    script ou d'une feuille de style, ne jamais modifier la carte à la main ; un script d'entrée n'est importé par aucun
    module (testé).
36. **Séisme réel** (banc « réseau », mode « Séisme réel ») : la page « En direct » enregistre un séisme (« Enregistrer
    pour le TP de localisation ») dans un fichier `sismo-seisme` v1 (`src/sismo/dossier.js`) : séisme du catalogue de
    GEOFON (la référence), stations (position, sensibilité de la verticale, bande), enregistrements miniSEED tels que
    livrés (base64), trois composantes, d'une minute avant l'origine à cinq minutes après la S de la plus lointaine. La
    relecture assemble chaque composante sur une grille commune (trous à zéro, moyenne retirée), passe en m/s par la
    sensibilité de chaque composante (celle de la verticale à défaut) et rééchantillonne à la plus petite cadence. La
    localisation (`src/sismo/localisation.js`) se fait sur la sphère avec la table `data/temps-localisation.json`
    (`npm run temps-localisation` : croûte du cours jusqu'à 1°, ak135 au-delà de 2°, raccord linéaire ; premières P et S,
    0 à 100°, h de 0 à 40 km) ; P pondérée 1, S 0,5, t0 analytique, grille ±25° puis ±1° puis ±0,06°. « Comparer à
    GEOFON » montre l'écart d'épicentre et d'heure d'origine (repères 30 km et 3 s) et trace les arrivées prévues pour
    la solution de GEOFON, jamais avant. Le fichier porte la sensibilité, l'azimut et le pendage de chaque composante
    (`composantes`, facultatif : sans eux, sensibilité de la verticale et amplitudes marquées « ≈ ») ; la relecture remet la
    verticale vers le haut et tourne 1/2 vers N/E. Magnitude (`src/sismo/reel.js`) : Wood-Anderson depuis la vitesse
    (`Sismo.woodAndersonVitesse`, identique à la vérité du générateur depuis l'accélération, testé), amplitude maximale de
    P − 1 s à S + max(30 s ; 1,5 (S − P)), `Sismo.ML` du cours, moyenne N/E puis des stations de 10 à 600 km. Mécanisme :
    polarités C/D de la première P (à la main, ou « Lire les polarités » : premier écart de plus de 3 σ du bruit dans la
    seconde qui suit le pointé), placées par l'azimut et l'angle de départ (table `iP` : croûte du cours sous 2°, départ
    ak135 au-delà, nœud le plus proche) pour la solution de l'étudiant ; `Mecanisme.inverser` au pas de 10°, 6 polarités
    au moins. Le séisme chargé est partagé (`src/seisme-reel.js` : fichier, pointés, polarités, solution, `version`) avec les
    bancs « mécanisme » et « source », qui ont aussi un mode « Séisme réel » et reprennent l'état partagé à leur ouverture
    si sa version a changé. Foyer : la solution du TP de localisation, sinon GEOFON (h ramenée à 0–40 km, la table s'arrête
    là). Mécanisme : verticales filtrées de 1 à 10 Hz (causal), pointé P du banc « réseau », sinon de l'étudiant (clic sur la
    trace, rendu au banc « réseau »), sinon automatique (`Reel.pointerP`, Akaike de Maeda autour de l'arrivée prévue) ; pas de
    solution vraie. Source : `Source.analyserSerie` sur les horizontales des stations de 10 à 600 km, vitesses dérivées en
    accélérations sur la série entière avant toute fenêtre (identique à l'accélération du générateur, testé), fenêtre S depuis
    le pointé S (sinon la S prévue), bruit de même durée finissant 1 s avant P, ajustement de Brune sur les bandes où le signal
    dépasse 3 fois le bruit (6 au moins) ; corrections du modèle du cours, ML comme au banc « réseau ».
