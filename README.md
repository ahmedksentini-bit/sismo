# Sismologie et aléa sismique — cours pour l'ingénieur

Site de cours pour ingénieurs en poste : de la lecture d'un sismogramme à l'action
sismique réglementaire de l'**Eurocode 8**, première et deuxième générations côte à côte.
Même architecture et même habillage que les sites de fondations et de géotechnique
routière de ksr-infra : application web **statique**, aucun framework, aucune compilation.

## Organisation : comme le site de fondations

| Page | Rôle |
|---|---|
| `index.html` | accueil : ressources du cours, puis les dix-sept chapitres rangés en quatre parties (A Lire les sismogrammes, B Mouvement du sol et aléa, C Du site au mouvement de projet, D Réponse des ouvrages) ; page de chapitre (`index.html#ch1`) avec notions, exercices corrigés et liens |
| `cours.html` | le cours au fil du texte, un chapitre par section (`#chN`), avec ses calculateurs (champs à curseur) et leur note de calcul (formule, application numérique, résultat, schéma explicatif quand il le faut), encadrés « à retenir » et « piège fréquent », sommaire latéral |
| `exerciseur.html` | exercices à données tirées au hasard (`#chN/modèle/graine`), modes apprentissage, entraînement et examen |
| `labo.html` | travaux pratiques : les dix-sept bancs ; le banc de rang n est le TP du chapitre n |
| `polycopie/sismologie-polycopie.pdf` | le polycopié : couverture, sommaire paginé, `cours.html` imprimé (les calculateurs deviennent des exemples chiffrés) |

Les dix-sept chapitres (`data/chapitres.json`) sont rédigés, chacun avec ses calculateurs, ses quatre modèles
d'exercices et ses exemples chiffrés testés (`tests/cours.test.mjs`). Les anciennes ancres (`index.html#localisation`, `#alea`…) sont redirigées vers
`labo.html`. Infrastructure commune reprise du site de fondations : `styles.css`, `enhancements.css`, `site.css`,
`src/ui.js`, `src/curseurs.js`, `src/figures.js`, `src/exercices.js`, `src/exerciseur.js`, `src/exos/alea.js`,
`src/impression.js`, `src/socle.js`, `src/tableaux.js`, `tools/generer-exercices.mjs`, `tools/polycopie.py`.

## Travaux pratiques : les bancs

| Banc | Rôle |
|---|---|
| **Une station** | séisme local ou lointain (téléséisme) ; sismogramme trois composantes (vélocimètre `HH` ou accéléromètre `HN` à 100 Hz, voies `BH` à 20 Hz pour un téléséisme) ; vitesse, accélération, déplacement ou Wood-Anderson simulé ; filtres de Butterworth causaux ; rotation Z/R/T ; pointés P, S (et pP), amplitude Wood-Anderson ou des ondes de surface ; local : distance par S − P, heure d'origine, ML (IASPEI 2013) ; lointain : phases ak135 (P, pP, sP, PcP, PKP, S, ScS, SKS, ondes de surface), distance par les tables, profondeur par pP − P, Ms (IASPEI 2013) ; azimut de la source par le mouvement de la P ; animation en boucle de la propagation (coupe du globe ou de la croûte) avec le sismogramme qui s'écrit ; mode exercice noté |
| **Réseau · localisation** | quatre stations sur un même axe des temps ; cercles de distance, diagramme de Wadati, localisation par recherche sur grille (x, y, h, t₀), zone compatible, gap azimutal ; épicentre déplaçable en exploration ; mode exercice noté |
| **Sismomètre** | masse, ressort et amortisseur dans un bâti animé ; sol sinusoïdal, lâcher de la masse ou séisme simulé ; préréglages (Wood-Anderson, courte et longue période, accéléromètre) ; réponse en fréquence en déplacement et en accélération ; mesure du régime permanent |
| **Spectre de réponse** | six bâtiments (T = 0,1 à 4 s) sur une table vibrante ; spectre Sa ou Sd qui se construit pendant la lecture de l'accélérogramme ; spectre élastique de l'EN 1998-1:2004 (types 1 et 2, sols A à E, η, ag calé sur le PGA ou imposé) ; période de l'ouvrage, T₁ = Ct·H^¾ |
| **Sismicité** | catalogue simulé de 1900 à 2025 (Gutenberg-Richter, répliques d'Omori-Utsu, complétude qui s'améliore avec le temps) ; graphique de Stepp ; valeur b d'Aki sur une période ou de Weichert sur une table de complétude ; Mc par courbure maximale ; déclusterage de Gardner et Knopoff ; taux annuels, périodes de retour, probabilités de Poisson ; mode exercice noté ; mode « Catalogue réel » : catalogue chargé (texte FDSN, CSV ou GeoJSON de l'USGS, tableau à en-tête) ou téléchargé par le relais FDSN, résumé (période, région, profondeurs, types de magnitude, mélange signalé), carte des épicentres sur fond Natural Earth (monde entier, antiméridien compris), même analyse sans corrigé |
| **Géodésie** | réseau GNSS simulé sur les zones du modèle d'aléa (faille bloquée de Savage et Burford, bande de raccourcissement) ; budget de moment avec la faille F ; profil des vitesses ; taux de déformation par zone par moindres carrés, axes principaux et incertitudes ; taux de moment de Kostrov (Savage et Simpson), tirages et biais en région lente ; couplage χ ; loi de Gutenberg-Richter équilibrée en moment face au catalogue ; envoi des moments au banc « aléa » ; mode exercice noté |
| **Aléa (PSHA)** | modèle d'école à deux zones sources discrétisées en points et une faille à ruptures flottantes (faille F, glissement réglable), site déplaçable et Vs30 ; arbre logique : modèle de taux (catalogue : (a, b) de chaque zone ; géodésie : couplage χ, moment conservé) × ΔMmax × loi d'atténuation (Akkar et al. 2014, Bindi et al. 2014, Boore et al. 2014, poids égaux), 108 réalisations en énumération complète ; courbes d'aléa de chaque réalisation, moyenne et fractiles 16/84 % ; UHS face aux spectres de l'EN 1998-1:2004 ; spectre moyen conditionnel à la grandeur choisie (Lin et al. 2013, corrélation de Baker et Jayaram 2008) avec sa dispersion ; carte d'aléa sur une grille de 20 km (niveau moyen de la grandeur choisie, isolignes) ; désagrégation magnitude-distance ; sensibilité aux branches ; mode exercice noté ; mode « Zones du catalogue » : les zones sismogènes tracées sur un catalogue réel au banc « sismicité » (ou un fichier « sismo-zones »), projetées en km, site en latitude et longitude sur fond de côtes réelles, mêmes graphiques ; failles actives de la base GEM (extrait méditerranéen livré, ou GeoJSON de la base chargé) retenues par zone, ruptures flottantes au-delà de Mmax de la zone ; champ de vitesses GNSS chargé (psvelo ou tableau) : tenseur de déformation et moment de Kostrov de chaque zone, couplage apparent, branche géodésique de l'arbre ; carte des failles, des vitesses et des axes de la déformation |
| **Accélérogrammes** | banque de 160 accélérogrammes synthétiques (méthode stochastique, source à deux coins, calés en moyenne sur les trois lois d'atténuation) ; sélection et mise à l'échelle sur le spectre moyen conditionnel à T1 (calage à Sa(T1), échanges gloutons de Jayaram et al. 2011 sur la moyenne et la dispersion), l'UHS ou le spectre de l'EN 1998-1:2004 ; filtre sur le scénario de la désagrégation, facteur maximal ; durée significative D5–95, intensité d'Arias et courbe de Husid de chaque enregistrement (vérifiées contre eqsig) ; contrôle du § 3.2.3.1.2 (4) (nombre, PGA moyen ≥ ag·S, moyenne ≥ 0,9·Se de 0,2·T1 à 2·T1), facteur commun minimal et réponse à retenir (§ 4.3.3.4.3 (3)) ; aléa repris du banc « aléa » ; mode exercice noté |
| **Site** | colonne de sol stratifiée sur rocher (profils types ou couches réglables : épaisseur, Vs, IP), ondes SH verticales (Kramer 1996) en linéaire ou en linéaire équivalent (courbes de Darendeli 2001, γeff = 0,65·γmax) ; fonction de transfert et f0 du quart d'onde, spectres au rocher et en surface face aux spectres de l'EN 1998-1:2004 (sol A et classe du site), profils de Vs compatible, de déformation, de G/G0 et ξ ; Vs30 et classe de sol (tableau 3.1) ; calcul vérifié contre pystrata ; mode exercice noté |
| **Liquéfaction** | sondage CPT d'école (profils types, nappe réglable), séisme (amax, M) ; méthode simplifiée de Boulanger et Idriss (2014) : CSR, CRR(qc1Ncs)·MSF·Kσ, Ic et teneur en fines, coefficient de sécurité ; indice LPI d'Iwasaki et tassement de Zhang et al. (2002) ; variante SPT dans le moteur ; vérifié contre liquepy ; mode exercice noté |
| **Ductilité** | oscillateur élastoplastique (écrouissage cinématique) de période T et de résistance Se(T)/R sous sept accélérogrammes calés sur le spectre de l'EN 1998-1:2004 à T ; boucle d'hystérésis, déplacement au cours du temps et résiduel ; spectres de ductilité à résistance constante face aux règles des égaux déplacements et de la méthode N2 ; déplacement cible N2 (annexe B) en format accélération–déplacement face à la moyenne des calculs temporels ; vérifié contre OpenSeesPy ; mode exercice noté |
| **Bâtiment** | bâtiment à étages en console de cisaillement (régulier, rigidité dégressive, étage souple, toiture lourde ; nombre d'étages, masses, rigidités) ; modes propres, facteurs de participation et masses effectives ; spectre de calcul de l'EN 1998-1:2004 (q, β·ag) ; périodes approchées Ct·H^¾ et 2·√d ; méthode des forces latérales (domaine d'emploi, λ, répartition en z ou selon le mode 1) et analyse modale spectrale (modes retenus, SRSS ou CQC) ; limitation des dommages (dr·ν/h) et coefficient θ ; combinaisons modales face à sept calculs temporels ; vérifié contre OpenSeesPy ; mode exercice noté |
| **Poussée** | même bâtiment, étages élastiques parfaitement plastiques dimensionnés sur l'analyse modale (q, surrésistance ω ; rez souple et faible, toiture lourde) ; courbes de capacité sous les profils modal et uniforme, mécanisme d'étage ; méthode N2 de l'annexe B pas à pas (m*, Γ, T*, qu, d*t, dt) en format accélération–déplacement ; glissements d'étage au déplacement cible face à sept calculs temporels non linéaires ; vérifié contre OpenSeesPy ; mode exercice noté |
| **Isolation** | bâtiment sur isolateurs bilinéaires (période post-élastique, résistance caractéristique Q, déplacement de plastification, viscosité) ; décalage de période et amortissement dans le spectre de l'EN 1998-1:2004 (η) ; linéarisation équivalente par point fixe (Keff, ξeff, Teff) ; boucle de l'isolateur, déplacement et accélération de la superstructure isolée face à la base fixe sous sept calculs temporels non linéaires ; vérifié contre OpenSeesPy ; mode exercice noté |
| **Mécanisme** | séisme d'école de type choisi et réseau de 6 à 30 stations ; premières arrivées P sur les verticales (Pg montante ou Pn descendante), polarités lues ; sphère focale en projection de Schmidt (hémisphère inférieur), plans nodaux et quadrants du modèle réglé, désaccords, axes P et T, type de faille ; inversion par recherche exhaustive et famille de solutions ; vérifié contre ObsPy ; mode exercice noté |
| **Source** | séisme de Mw et de chute de contrainte choisies, quatre stations de 30 à 140 km ; fenêtre S, spectre de déplacement brut et corrigé (expansion géométrique, Q(f), κ, site), modèle de Brune ajusté à la main ou par moindres carrés en ln ; M0, Mw, fc et Δσ par station, face à ML ; mode exercice noté |
| **Profil par distance** | douze stations de 15 à 345 km ; traces en surface variable, réduction à 6 ou 8 km/s ; droites Pg et Pn tracées à la souris ; V₁, V₂, temps d'intercept, épaisseur de la croûte, distance de croisement ; carte des stations et coupe de la Terre (croûte tirée des droites, rais Pg et Pn, distances critique et de croisement, modèle simulé en tirets) redessinées à chaque changement ; mode exercice noté |

Chaque banc s'ouvre sur sa consigne « Ce que vous allez faire » (objectif, étapes en mode Explorer puis
Exercice, ce qu'il faut rendre, durée et chapitre du cours). Les bancs de lecture ont un mode **Explorer** (vérité
terrain affichée) et un mode **Exercice** (séisme tiré au hasard, numéroté, corrigé avec tolérances ; rien n'y
affiche la réponse demandée avant la vérification). Les ancres
`labo.html#localisation`, `#sismometre`, `#profil`, `#spectre`, `#sismicite`, `#geodesie`, `#alea`… ouvrent directement le banc voulu.

## Lancer

```
npm run serve     # http://localhost:3000 — les modules ES ne se chargent pas en file://
npm test          # invariants numériques (node --test, aucune dépendance)
npm run exercices # banques data/exercices-chN.json, tirées des modèles src/exos/chNN.js à graine fixe
npm run polycopie # polycopie/sismologie-polycopie.pdf (Chrome ou Edge sans interface, PyMuPDF)
```

## Architecture

```
index.html              accueil et pages de chapitre (src/app.js)
cours.html              cours interactif ; calculateurs src/cours-chN.js
exerciseur.html         exerciseur (src/exerciseur.js, src/exercices.js)
labo.html, lecteur.css  bancs de travaux pratiques
data/chapitres.json     plan : parties, chapitres, banc associé, exercices
data/exercices-chN.json banques d'exercices (fichiers produits, npm run exercices)
src/exos/chNN.js        modèles d'exercices : données tirées, réponses par les solveurs
src/cours-chN.js        calculateurs du chapitre N du cours ; src/ballon.js sphère focale SVG (cours et exercices)
src/sismo/signal.js     solveurs purs et testés (aucun accès au DOM)
                          FFT, Butterworth causal, Wood-Anderson, modèle de croûte,
                          temps de trajet Pg/Pn/Sg/Sn, méthode stochastique de Boore,
                          bruit de site, capteurs, ML, azimut, localisation, Wadati
src/sismo/oscillateur.js  oscillateur à un degré de liberté : réponse en fréquence,
                          Newmark à accélération moyenne, instruments de référence
src/sismo/refraction.js   droites t = tᵢ + Δ/V, épaisseur de la croûte, croisement
src/sismo/spectre.js      spectres de réponse (Sd, Sv, Sa), calcul progressif,
                          spectre élastique EN 1998-1:2004, T₁ = Ct·H^¾
src/sismo/sismicite.js    catalogue simulé, Mc, Stepp, valeur b (Aki-Utsu, Shi-Bolt ;
                          Weichert), déclusterage de Gardner et Knopoff, Poisson
src/sismo/catalogue.js    catalogue réel : lecture (texte FDSN, CSV et GeoJSON de l'USGS, tableaux à en-tête),
                          années décimales, résumé et types de magnitude, déclusterage aux conventions d'HMTK,
                          cadre de la carte des épicentres, requêtes du service event par le relais FDSN
src/sismo/zones.js        zones sismogènes d'un catalogue réel : statistiques (b, taux, Mmax), fichier « sismo-zones »,
                          projection locale en km, modèle PSHA du banc « aléa »
src/zones-reel.js         modèle de zones partagé entre les bancs « sismicité » et « aléa »
src/sismo/mecanismes.js   mécanismes au foyer d'un catalogue : ndk du Global CMT, QuakeML, tableaux strike/dip/rake,
                          régimes de Zoback (1992), mécanisme dominant d'une zone
src/sismo/gmpe.js         lois d'atténuation : Akkar, Sandıkkaya et Bommer (2014), Bindi et al. (2014),
                          Boore, Stewart, Seyhan et Atkinson (2014, NGA-West2, sans terme de bassin)
src/sismo/geodesie.js     modèle géodésique : champ GNSS, taux de déformation par moindres carrés,
                          invariants, moment de Kostrov et de faille, loi équilibrée en moment
src/sismo/faille.js       sources de faille : maillage, ruptures flottantes, WC1994, Rjb et Rrup
src/sismo/psha.js         moteur PSHA : Gutenberg-Richter tronquée par classes, zones discrétisées,
                          ruptures ponctuelles, failles, loi normale tronquée, arbre logique (variantes de taux
                          catalogue et géodésie, énumération complète), moyenne et fractiles pondérés,
                          UHS, spectre conditionnel, désagrégation, sensibilité
src/sismo/zones.js        zones sismogènes d'un catalogue réel : statistiques d'une zone, fichier « sismo-zones »,
                          projection locale en km, modèle PSHA (failles et géodésie comprises) ; pas de
                          discrétisation, domaine, grille de la carte d'aléa et côtes en km du banc « aléa »
src/sismo/failles.js      failles actives réelles : GeoJSON de la base GEM et extrait « sismo-failles », défauts par
                          type, vitesse nette recomposée, failles retenues par zone, Mmax WC1994, pas du maillage
src/sismo/gnss.js         champ de vitesses GNSS réel : psvelo et tableaux, tenseur d'une zone dans son repère
                          local (convergence des méridiens), moment de Kostrov, moment du catalogue
src/sismo/accelerogramme.js accélérogrammes synthétiques : fenêtre S stochastique, source d'Atkinson et
                          Silva (2000), correction spectrale calée sur les lois d'atténuation
src/sismo/selection.js    sélection et mise à l'échelle sur une cible, échanges gloutons, contrôle
                          EN 1998-1:2004 § 3.2.3.1.2 (4)
src/sismo/isolignes.js    isolignes d'une grille (carrés marchants), niveaux ronds
src/sismo/source.js       spectre des ondes S corrigé du trajet, modèle de Brune, M0, Mw, Δσ
src/sismo/intensite.js    PGA, PGV, intensité d'Arias, durées significatives, CAV, courbe de Husid
src/sismo/batiment.js     console de cisaillement : modes, forces latérales, analyse modale (SRSS, CQC),
                          limitation des dommages, θ, calcul temporel par superposition modale
src/sismo/poussee.js      poussée progressive, méthode N2 (annexe B), calcul temporel non linéaire
                          d'une console de cisaillement (Rayleigh ou amortisseurs d'étage, Newmark et Newton)
src/sismo/isolation.js    isolateur bilinéaire, linéarisation équivalente, bâtiment isolé à deux niveaux
src/sismo/mecanisme.js    mécanisme au foyer : double couple, plans, axes, rayonnement P, Schmidt, inversion
src/sismo/inelastique.js  oscillateur bilinéaire (Newmark, Newton), ductilité, facteur Rμ, méthode N2
src/sismo/liquefaction.js déclenchement de la liquéfaction (CPT, SPT), LPI, tassement, sondage d'école
src/sismo/site.js         effets de site 1D : ondes SH, linéaire équivalent, Darendeli, Vs30 et classe EC8
src/sismo/globe.js        rais sismiques dans le globe ak135 : phases P, S, PcP, ScS, PKP, PKiKP, PKIKP, SKS, pP, sP,
                          zone d'ombre, profondeur d'un séisme lointain par le retard de pP ou sP
src/sismo/tables.js       tables de temps de trajet : régionale (Pg, Pn, Sg, Sn), télésismiques ak135, profondeur ;
                          lecture par interpolation, inversion exacte
src/sismo/teleseisme.js   sismogrammes d'un téléséisme : phases ak135, amplitudes de la théorie des rais (double couple,
                          expansion géométrique, t*), codas, ondes de surface calées sur Ms ; lectures Δ, h, t₀, Ms
src/sismo/propagation.js  fronts d'onde dans le globe (faisceaux de rais P et S, réflexions, zone d'ombre) pour l'animation
src/sismo/miniseed.js     décodage miniSEED 2 (Steim 1 et 2, entiers, réels), vérifié contre ObsPy
src/sismo/seedlink.js     protocole SeedLink 3 : poignée de main, paquets, validation des flux demandés au relais
src/sismo/fdsn.js         services FDSN : validation des requêtes du relais, lecture des voies et des séismes (format texte)
src/sismo/direct.js       Butterworth (comme scipy), STA/LTA (comme ObsPy), tampons des voies, arrivées prévues
src/sismo/coefficients/   coefficients exportés de hazardlib, modèle ak135 d'ObsPy et calage des accélérogrammes (fichiers produits)
src/schemas.js          schémas de principe, au moins un par chapitre (ondes, failles, ruptures, sismomètre, spectre,
                        Gutenberg-Richter, rebond élastique, étapes de Cornell, effets de site, liquéfaction, ductilité,
                        modes, poussée, isolation…), en SVG
src/cours-schemas.js    remplit les schémas de cours.html
src/schemas-notes.js    schémas des notes de calcul, dessinés avec les valeurs du calcul (rais Pg et Pn, profondeur,
                        lacune, faille et vecteurs, pP, branches du spectre, fenêtres de déclusterage, cercle de Mohr,
                        loi normale, zone source, Vs30, contraintes, R–μ, console, N2, boucle d'isolateur…)
src/gmpe-notes.js       équations des lois d'atténuation mises en texte : tableaux de coefficients, constantes,
                        termes de la note de calcul (Gmpe.LOIS[id].detailler)
src/traits.js           traits communs des schémas (étiquettes, flèches, projection oblique, petit cadre de graphique)
src/globe-figure.js     coupe du globe (croûte, manteau, noyau externe liquide, graine) et rais des phases, voisinage
                        du foyer (P, pP, sP), coupe d'une zone de subduction, en SVG
src/lecteur-station.js  banc « une station » (séisme local ou lointain)
src/propagation-anim.js animation en boucle de la propagation : coupe du globe (téléséisme) ou de la croûte (séisme local)
direct.html             stations sismologiques de la Méditerranée en direct, par réseau (carte, traces, séismes, arrivées)
src/direct-page.js      page « En direct » : par station, relais SeedLink de son centre ou de GEOFON, sinon FDSN toutes
                        les 20 s ; sans réseau, démonstration simulée
src/sismo/centres.js    centres de données (FDSN, SeedLink) : liste blanche des relais, serveurs à essayer par station
functions/api/          fonctions Cloudflare Pages : seedlink.js (relais SeedLink → WebSocket, sonde, diagnostic),
                        fdsn.js (relais FDSN)
tools/carte/cotes.py    côtes et frontières Natural Earth découpées à la Méditerranée (data/cotes-mediterranee.json)
tools/carte/pays.py     pays Natural Earth découpés à la Méditerranée (data/pays-mediterranee.json)
tools/carte/monde.py    côtes et frontières Natural Earth du monde entier (data/cotes-monde.json), carte des épicentres
tools/failles/gem.mjs   extrait méditerranéen de la base GEM des failles actives (data/failles-mediterranee.json)
tools/versions.mjs      versions des scripts et feuilles de style (cartes d'import des pages) : npm run versions
src/sismo/dossier.js    fichier d'un séisme réel (format sismo-seisme) : écriture par « En direct », relecture par le TP
src/sismo/localisation.js localisation d'un séisme réel sur la sphère (table croûte du cours + ak135)
src/sismo/reel.js       séisme réel : magnitude locale ML (Wood-Anderson des horizontales), polarité de la première P,
                        pointé automatique de la P (critère d'Akaike)
src/seisme-reel.js      séisme réel partagé par les bancs « réseau », « mécanisme » et « source » (fichier, pointés, foyer)
tools/temps-localisation.mjs table des premières arrivées P et S de la localisation (data/temps-localisation.json)
tools/direct/           serveurs SeedLink et FDSN d'essai, pour essayer les fonctions sans réseau (wrangler pages dev)
src/lecteur-reseau.js   banc « réseau »
src/banc-sismometre.js  banc « sismomètre »
src/banc-profil.js      banc « profil par distance »
src/banc-spectre.js     banc « spectre de réponse »
src/banc-sismicite.js   banc « sismicité »
src/banc-geodesie.js    banc « géodésie »
src/banc-alea.js        banc « aléa » (mode « Zones du catalogue » : zones d'un catalogue réel)
src/zones-reel.js       modèle de zones partagé par les bancs « sismicité » et « aléa » (dernier publié, sa version)
src/banc-selection.js   banc « accélérogrammes »
src/banc-site.js        banc « site »
src/banc-liquefaction.js banc « liquéfaction »
src/banc-ductilite.js   banc « ductilité »
src/banc-batiment.js    banc « bâtiment »
src/banc-poussee.js     banc « poussée progressive »
src/banc-isolation.js   banc « isolation »
src/banc-mecanisme.js   banc « mécanisme » (mode « Séisme réel » : polarités d'un vrai séisme)
src/banc-source.js      banc « source » (mode « Séisme réel » : spectre S d'un vrai séisme, bruit, Mw)
src/parcours.js         plan des travaux pratiques : quatre parties, ordre des bancs, ancres, chapitre du cours de chaque banc
src/onglets.js          onglets et fil du parcours (partie, banc précédent et suivant, chapitre du cours) ; chaque banc se construit à sa première ouverture
src/consignes.js        consigne de chaque banc (objectif, étapes, à rendre), placée en tête du poste par src/onglets.js
tests/                  signal, localisation, bancs, spectre, sismicité, géodésie, failles, PSHA, sélection,
                        site, isolignes, liquéfaction, inélastique, mécanisme, source, intensité, bâtiment, poussée, isolation, globe,
                        parcours, cours (plan, banques d'exercices reproductibles, exemples du texte, liens des pages), références, schémas des notes, équations des lois, tables de temps de trajet, consignes des TP, téléséismes, fronts d'onde, miniSEED, SeedLink, traitements en direct, centres de données et pays, sismogrammes d'un séisme, versions des scripts, séisme réel dans le TP de localisation (localisation, ML, mécanisme), pointé automatique, spectre de la source en vitesse et bruit, catalogues réels, propagation en direct, zones sismogènes, mécanismes au foyer, failles actives et champ GNSS réels (251 tests)
tests/references/       valeurs calculées par OpenQuake, pystrata, liquepy, OpenSeesPy, ObsPy et eqsig (npm run references)
tools/oq/               scripts de référence (Python, OpenQuake), export du catalogue et du modèle d'aléa
tools/calage-accelerogrammes.mjs  correction spectrale des accélérogrammes (npm run calage)
tools/pystrata/         référence des effets de site (Python, pystrata)
tools/liquepy/          référence de la liquéfaction (Python, liquepy)
tools/opensees/         références de l'oscillateur inélastique, du bâtiment, de la poussée et de l'isolation (Python, OpenSeesPy)
tools/obspy/            références du mécanisme au foyer et des temps de trajet dans le globe, modèle ak135 (Python, ObsPy)
tools/eqsig/            référence des indicateurs d'accélérogramme (Python, eqsig)
tools/generer-exercices.mjs  banques d'exercices (npm run exercices)
tools/polycopie.py      polycopié PDF (npm run polycopie) ; couverture tools/polycopie-couverture.html
```

## Modèle des signaux

Croûte de 32 km (Vp 6,0 ; Vs 3,5 km/s) sur manteau (8,0 ; 4,6 km/s), couche
superficielle lente. Méthode stochastique de Boore (2003) : source de Brune
(Δσ = 6 MPa), Q(f) = 130·f^0,6, κ = 0,05 s, amplification générique du rocher
(Boore et Joyner 1997). Impulsions directes causales pour l'arrivée et la polarité,
coda d'Aki, ondes de surface dispersées. Signaux pédagogiques : ce n'est pas une
simulation complète de la propagation.

Calage vérifié par `npm test` : ML mesurée sur le signal sans bruit stable à ±0,2
entre 20 et 250 km et proche de Mw (de −0,2 à +0,7) ; PGA d'environ 0,06 g pour un
M5 à 10 km.

## Accélérogrammes synthétiques

Le banc « accélérogrammes » n'utilise pas ces sismogrammes complets : leurs ondes de surface, leur coda et leurs
impulsions directes enrichissent les longues périodes (Sa à 1–2 s deux à trois fois au-dessus des lois
d'atténuation). Il simule la seule fenêtre des ondes S (Boore 2003) avec une source à deux coins (Atkinson et
Silva 2000), le trajet et le site ci-dessus, κ médian 0,04 s ; chaque enregistrement tire son coin fa, son κ et
un terme d'événement (σ ln 0,3 chacun). Une correction spectrale fixe c(f), produite par `npm run calage`, ramène
la moyenne des ln Sa sur la médiane des trois lois du banc « aléa » (Vs30 = 800 m/s) de 0,04 à 3 s, sur
M 5 à 7,5 et Rjb 5 à 150 km (principe de la méthode hybride empirique, Campbell 2003). Écarts mesurés : résidu
moyen < 0,08 en ln sur des graines hors calage ; selon le scénario, jusqu'à ±0,4 (la décroissance du trajet
diffère de celle des lois) ; dispersion d'un enregistrement à l'autre 0,4 à 0,55, contre 0,6 à 0,77 pour les lois.

## Références OpenQuake

Les solveurs sont comparés à OpenQuake (hazardlib et Hazard Modeller's Toolkit de GEM) par `npm test`,
sur des valeurs enregistrées dans `tests/references/` : lois d'Akkar et al. (2014), de Bindi et al. (2014) et de
Boore et al. (2014),
déclusterage de Gardner et Knopoff, estimateur de Weichert, invariants des taux de déformation
(`GeodeticStrain`), moment et équilibre en moment des `TruncatedGRMFD`, ruptures flottantes des
`SimpleFaultSource` (nombre, taux, Rjb, Rrup), et le moteur PSHA complet. OpenQuake n'est **pas** embarqué dans le site (Python,
licence AGPL) ; il ne sert qu'à produire ces références et les coefficients de `src/sismo/coefficients/`.

Pour le moteur PSHA, `tools/oq/psha.py` traduit le modèle d'école (`tests/references/modele_psha.json`, écrit par
`exporter-modele.mjs`) en NRML — une `multiPointSource` par zone, rupture ponctuelle `PointMSR`, une
`simpleFaultSource` par faille (WC1994), chaque
variante de taux × ΔMmax écrite comme un modèle de sources de l'arbre, la valeur a des variantes
géodésiques étant calculée par OpenQuake lui-même (`_set_a`) — puis lance les calculateurs `classical` et
`disaggregation`. Écarts mesurés : courbes des 108 réalisations à 0,22 % près (au niveau extrême de 3 g,
où la queue tronquée amplifie les écarts de distance ; 0,06 % ailleurs), moyenne à 0,1 %, UHS moyen à 0,03 %,
fractiles et cartes d'aléa identiques sur les mêmes courbes, cases de la désagrégation à 0,25 % ; carte d'aléa :
PGA moyen à 10 % en 50 ans en six sites de la grille à 0,05 % près (job `carte`, sites multiples).
Pour la désagrégation, OpenQuake classe les distances en Rrup, distance en ligne droite au foyer (ou aux
nœuds de la rupture) sur la Terre sphérique ; le moteur sait la calculer (`distance: 'rrup'`), le banc
affiche Rjb. Sous 40 km, OpenQuake dilate de 5 m la projection d'une rupture de faille : le moteur aussi.
Le spectre conditionnel est comparé aux sommes de Lin et al. (2013) du post-traitement `conditional_spectrum`
(Σ ws à 0,013 % près, ln Sa à 0,001 près, pour chaque réalisation et pour la moyenne) et la corrélation de
Baker et Jayaram (2008) à hazardlib. OpenQuake 3.26 y relie les groupes de sources aux réalisations dans deux
ordres différents dès qu'il y a plus de dix modèles de sources (ici 36) : sa sortie `cs-stats` mélange les
branches (0,026 g au lieu de 0,049 g à T* = 1 s). `psha.py` refait donc l'agrégation avec ses propres briques
(`get_cs_out` par groupe, `get_trt_rlzs` sur les groupes uniques) et garde la sortie brute pour mémoire.

Les effets de site sont comparés à pystrata (Kottke, licence MIT), qui n'est pas non plus embarqué :
`tools/pystrata/exporter-site.mjs` écrit une colonne d'école (15 sous-couches, courbes de Darendeli) et deux
accélérogrammes d'entrée (0,05 et 0,35 g) ; `tools/pystrata/site.py` les calcule. Mêmes conventions que pystrata :
module complexe de Dormieux et Canou, courbes sur 20 déformations interpolées en ln γ, amortissement en petites
déformations lu sur la courbe à γ = 10⁻⁶, FFT complétée à la puissance de 2. Écarts : fonction de transfert
linéaire 10⁻¹³, G/G0 et ξ compatibles 3·10⁻⁵, γ 5·10⁻⁵, PGA en surface 3·10⁻⁶. Le spectre de réponse diffère de
quelques % aux courtes périodes par la méthode seule (pystrata : oscillateur en fréquence ; le site : Newmark).

La liquéfaction est comparée à liquepy (eng-tools, licence MIT), non embarqué : `tools/liquepy/` calcule un sondage CPT
d'école de 200 points sous trois scénarios. Mêmes conventions que liquepy (Pa = 101 kPa, 100 kPa pour Kσ, eau à
9,8 kN/m³, poids volumique de Robertson et Cabal, exposant n de Ic itéré, FS plafonné à 2 et fixé à 2,25 pour
Ic > 2,6) : toutes les grandeurs, le LPI et la déformation volumique de Zhang et al. coïncident à 10⁻¹⁴ près ;
CRR7,5 et Kσ du SPT aussi.

L'oscillateur inélastique est comparé à OpenSeesPy, non embarqué : `tools/opensees/sdof.py` calcule huit
oscillateurs (Steel01 sans écrouissage isotrope, amortissement proportionnel à la masse, série Path, Newmark et
Newton, mêmes sous-pas ≤ T/20) sous un accélérogramme d'école ; déplacement maximal à 10⁻¹³ près, déplacement et
force à 10⁻⁸ près sur tout l'historique. `tools/opensees/batiment.py` reprend quatre bâtiments en console de cisaillement
(éléments zeroLength) : périodes et masses effectives (`modalProperties`) et réponses de l'analyse modale spectrale
(`responseSpectrumAnalysis`, combinées par SRSS et CQC) à 10⁻¹² près ; calcul temporel du système couplé avec
amortissement modal (`modalDamping`) à 10⁻¹⁰ près, la superposition modale du site étant menée sur la même grille fine.
`tools/opensees/poussee.py` pousse trois bâtiments à étages Steel01 (profils modal et uniforme, `DisplacementControl`) :
étage critique et point de plastification à 10⁻¹² près ; leur calcul temporel non linéaire (Rayleigh sur la rigidité
initiale, `-doRayleigh` sur les zeroLength, Newmark et Newton) est retrouvé à 10⁻⁸ près sur tout l'historique, comme
celui d'un bâtiment isolé à la base (isolateur Steel01 et amortisseurs Viscous en parallèle, sans Rayleigh).

Le mécanisme au foyer est comparé à ObsPy (licence LGPL, non embarqué) : `tools/obspy/mecanisme.py` retrouve, à partir
des tenseurs des moments du site (convertis de NED en USE), les plans nodaux (`mt2plane`), les axes P, T, N
(`mt2axes`), le plan auxiliaire (`aux_plane`) et le rayonnement P en champ lointain (`farfield`) : 10⁻⁸° et 10⁻¹²
près. Pour un plan auxiliaire vertical, `aux_plane` d'ObsPy rend un glissement de signe opposé dont le tenseur n'est
plus le même : le test compare alors les tenseurs.

Les rais dans le globe sont comparés à TauP (ObsPy) : `tools/obspy/globe.py` exporte le modèle ak135 et calcule les
arrivées de P, S, PcP, ScS, PKP, PKiKP, PKIKP, SKS et des phases de profondeur pP et sP pour quatre profondeurs et
28 distances (556 arrivées). Le site les retrouve toutes, sans arrivée de plus : temps à 0,006 s, angles de départ et
d'incidence à 0,04° près ; la profondeur retrouvée d'après les retards pP − P et sP − P de TauP l'est à 0,5 km près.

Les indicateurs d'accélérogramme sont comparés à eqsig (eng-tools, licence MIT, non embarqué) : `tools/eqsig/intensite.py`
calcule PGA, PGV, intensité d'Arias (g = 9,81 m/s²), durées significatives 5–95 % et 5–75 % et CAV sur les
accélérogrammes de référence de l'inélastique et du site ; 10⁻¹² près en relatif, durées au pas de temps près exact.

Les failles actives du banc « aléa » (`data/failles-mediterranee.json`) sont un extrait de la base GEM des failles
actives (GEM Global Active Faults Database, version harmonisée ; Styron, R. et Pagani, M., 2020, *The GEM Global Active
Faults Database*, Earthquake Spectra 36(1_suppl), 160–180, doi:10.1177/8755293020944182), distribuée sous licence
CC BY-SA 4.0 ; l'extrait garde cette licence. `tools/failles/gem.mjs` le refait depuis le GeoJSON du dépôt
GEMScienceTools/gem-global-active-faults : failles qui touchent la Méditerranée (20° O – 50° E, 22° N – 53° N), frontières
de plaques, subductions, dorsales et plis écartés, traces simplifiées à 100 m.

Pour les régénérer (environ dix minutes, le PSHA compris) :

```
python3 -m venv ~/.venvs/oq
~/.venvs/oq/bin/pip install --no-deps openquake.engine
~/.venvs/oq/bin/pip install numpy scipy shapely pyproj h5py toml decorator pandas psutil pyzmq requests \
    docutils numba alpha_shapes h3 geopandas pillow fiona pystrata liquepy openseespy obspy eqsig
PYTHON=~/.venvs/oq/bin/python npm run references
```

(Les roues GDAL de GEM ne sont pas nécessaires : `fiona`, sur PyPI, suffit à hazardlib et à HMTK.)

## Déploiement — Cloudflare Pages

| Réglage | Valeur |
|---|---|
| Framework preset | **None** |
| Build command | *(vide)* |
| Build output directory | **`/`** |
| Branche de production | `main` |

## Auteur

Dr Ahmed Ksentini.
