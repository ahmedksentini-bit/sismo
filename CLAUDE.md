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
    l'algorithme sur les courbes d'OpenQuake. Après tout changement du modèle d'école,
    relancer `npm run references` (OpenQuake, ~10 min).
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
    (ses canvas ont une largeur nulle) et se construit à sa première ouverture.
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
