# Sismologie et aléa sismique — cours pour l'ingénieur

Site de cours pour ingénieurs en poste : de la lecture d'un sismogramme à l'action
sismique réglementaire de l'**Eurocode 8**, première et deuxième générations côte à côte.
Même architecture et même habillage que les sites de fondations et de géotechnique
routière de ksr-infra : application web **statique**, aucun framework, aucune compilation.

## État : bancs de lecture, géodésie et aléa

| Banc | Rôle |
|---|---|
| **Une station** | sismogramme trois composantes (vélocimètre `HH` ou accéléromètre `HN`) ; vitesse, accélération, déplacement ou Wood-Anderson simulé ; filtres de Butterworth causaux ; rotation Z/R/T ; pointés P et S, amplitude Wood-Anderson ; distance par S − P, heure d'origine, ML (IASPEI 2013), azimut de la source par le mouvement de la P ; mode exercice noté |
| **Réseau · localisation** | quatre stations sur un même axe des temps ; cercles de distance, diagramme de Wadati, localisation par recherche sur grille (x, y, h, t₀), zone compatible, gap azimutal ; épicentre déplaçable en exploration ; mode exercice noté |
| **Sismomètre** | masse, ressort et amortisseur dans un bâti animé ; sol sinusoïdal, lâcher de la masse ou séisme simulé ; préréglages (Wood-Anderson, courte et longue période, accéléromètre) ; réponse en fréquence en déplacement et en accélération ; mesure du régime permanent |
| **Spectre de réponse** | six bâtiments (T = 0,1 à 4 s) sur une table vibrante ; spectre Sa ou Sd qui se construit pendant la lecture de l'accélérogramme ; spectre élastique de l'EN 1998-1:2004 (types 1 et 2, sols A à E, η, ag calé sur le PGA ou imposé) ; période de l'ouvrage, T₁ = Ct·H^¾ |
| **Sismicité** | catalogue simulé de 1900 à 2025 (Gutenberg-Richter, répliques d'Omori-Utsu, complétude qui s'améliore avec le temps) ; graphique de Stepp ; valeur b d'Aki sur une période ou de Weichert sur une table de complétude ; Mc par courbure maximale ; déclusterage de Gardner et Knopoff ; taux annuels, périodes de retour, probabilités de Poisson ; mode exercice noté |
| **Géodésie** | réseau GNSS simulé sur les zones du modèle d'aléa (faille bloquée de Savage et Burford, bande de raccourcissement) ; profil des vitesses ; taux de déformation par zone par moindres carrés, axes principaux et incertitudes ; taux de moment de Kostrov (Savage et Simpson), tirages et biais en région lente ; couplage χ ; loi de Gutenberg-Richter équilibrée en moment face au catalogue ; envoi des moments au banc « aléa » ; mode exercice noté |
| **Aléa (PSHA)** | modèle d'école à deux zones sources discrétisées en points, site déplaçable et Vs30 ; arbre logique : modèle de taux (catalogue : (a, b) de chaque zone ; géodésie : couplage χ, moment conservé) × ΔMmax × loi d'atténuation (Akkar et al. 2014, Bindi et al. 2014), 72 réalisations en énumération complète ; courbes d'aléa de chaque réalisation, moyenne et fractiles 16/84 % ; UHS face aux spectres de l'EN 1998-1:2004 ; désagrégation magnitude-distance ; sensibilité aux branches ; mode exercice noté |
| **Profil par distance** | douze stations de 15 à 345 km ; traces en surface variable, réduction à 6 ou 8 km/s ; droites Pg et Pn tracées à la souris ; V₁, V₂, temps d'intercept, épaisseur de la croûte, distance de croisement ; mode exercice noté |

Les bancs de lecture ont un mode **Explorer** (vérité terrain affichée) et un mode
**Exercice** (séisme tiré au hasard, numéroté, corrigé avec tolérances). Les ancres
`#localisation`, `#sismometre`, `#profil`, `#spectre`, `#sismicite`, `#geodesie` et `#alea` ouvrent directement le banc voulu.

## Lancer

```
npm run serve     # http://localhost:3000 — les modules ES ne se chargent pas en file://
npm test          # invariants numériques (node --test, aucune dépendance)
```

## Architecture

```
index.html, lecteur.css
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
src/sismo/gmpe.js         lois d'atténuation : Akkar, Sandıkkaya et Bommer (2014), Bindi et al. (2014)
src/sismo/geodesie.js     modèle géodésique : champ GNSS, taux de déformation par moindres carrés,
                          invariants, moment de Kostrov et de faille, loi équilibrée en moment
src/sismo/psha.js         moteur PSHA : Gutenberg-Richter tronquée par classes, zones discrétisées,
                          ruptures ponctuelles, loi normale tronquée, arbre logique (variantes de taux
                          catalogue et géodésie, énumération complète), moyenne et fractiles pondérés,
                          UHS, désagrégation, sensibilité
src/sismo/coefficients/   coefficients exportés de hazardlib (fichiers produits)
src/lecteur-station.js  banc « une station »
src/lecteur-reseau.js   banc « réseau »
src/banc-sismometre.js  banc « sismomètre »
src/banc-profil.js      banc « profil par distance »
src/banc-spectre.js     banc « spectre de réponse »
src/banc-sismicite.js   banc « sismicité »
src/banc-geodesie.js    banc « géodésie »
src/banc-alea.js        banc « aléa »
src/onglets.js          onglets ; chaque banc se construit à sa première ouverture
tests/                  signal, localisation, bancs, spectre, sismicité, géodésie, PSHA, références (54 tests)
tests/references/       valeurs calculées par OpenQuake (npm run references)
tools/oq/               scripts de référence (Python, OpenQuake), export du catalogue et du modèle d'aléa
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

## Références OpenQuake

Les solveurs sont comparés à OpenQuake (hazardlib et Hazard Modeller's Toolkit de GEM) par `npm test`,
sur des valeurs enregistrées dans `tests/references/` : lois d'Akkar et al. (2014) et de Bindi et al. (2014),
déclusterage de Gardner et Knopoff, estimateur de Weichert, invariants des taux de déformation
(`GeodeticStrain`), moment et équilibre en moment des `TruncatedGRMFD`, et le moteur PSHA complet. OpenQuake n'est **pas** embarqué dans le site (Python,
licence AGPL) ; il ne sert qu'à produire ces références et les coefficients de `src/sismo/coefficients/`.

Pour le moteur PSHA, `tools/oq/psha.py` traduit le modèle d'école (`tests/references/modele_psha.json`, écrit par
`exporter-modele.mjs`) en NRML — une `multiPointSource` par zone, rupture ponctuelle `PointMSR`, chaque
variante de taux × ΔMmax écrite comme un modèle de sources de l'arbre, la valeur a des variantes
géodésiques étant calculée par OpenQuake lui-même (`_set_a`) — puis lance les calculateurs `classical` et
`disaggregation`. Écarts mesurés : courbes des 72 réalisations à 0,06 % près, moyenne et UHS
à 0,03 %, fractiles et cartes d'aléa identiques sur les mêmes courbes, cases de la désagrégation à 0,2 %.
Pour la désagrégation, OpenQuake classe les distances en Rrup, distance en ligne droite au foyer sur la
Terre sphérique ; le moteur sait la calculer (`distance: 'rrup'`), le banc affiche la distance épicentrale.

Pour les régénérer (environ cinq minutes, le PSHA compris) :

```
python3 -m venv ~/.venvs/oq
~/.venvs/oq/bin/pip install --no-deps openquake.engine
~/.venvs/oq/bin/pip install numpy scipy shapely pyproj h5py toml decorator pandas psutil pyzmq requests \
    docutils numba alpha_shapes h3 geopandas pillow fiona
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
