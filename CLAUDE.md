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
   qu'un affichage, les droites sont toujours calculées en temps vrais.
10. **Spectre de réponse** : Sa = ω²·Sd (pseudo-accélération). Pas d'intégration
    ≤ T/20 (sous-pas par interpolation linéaire) ; le calcul progressif de l'animation
    et le calcul d'un bloc donnent le même spectre (testé). Le spectre EC8 affiché est
    celui de l'EN 1998-1:2004 (valeurs recommandées) ; la 2ᵉ génération viendra du
    texte de l'EN 1998-1-1:2024, pas de mémoire.
11. **Sismicité** : magnitudes rangées par classes de 0,1 ; b d'Aki avec la correction
    d'Utsu (Mc − ΔM/2). Les taux et les probabilités de Poisson se calculent sur le
    catalogue déclusteré ; la vérité des exercices est la loi des chocs principaux.
12. **Références OpenQuake** : toute loi d'atténuation, tout traitement de catalogue et le
    moteur PSHA sont comparés à OpenQuake via `tests/references/` ; les coefficients sont
    exportés de hazardlib par `tools/oq/coefficients.py`, jamais recopiés à la main. Le
    déclusterage suit les conventions de HMTK (année de 364,75 j, amas, pas de condition de
    magnitude). OpenQuake n'est jamais embarqué dans le site (AGPL).
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
    ordre, ancres) vit dans `src/parcours.js` ; un nouveau banc s'y ajoute, dans l'ordre de la barre (testé).
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
