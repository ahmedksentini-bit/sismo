# Sismologie et aléa sismique — cours pour l'ingénieur

Site de cours pour ingénieurs en poste : de la lecture d'un sismogramme à l'action
sismique réglementaire de l'**Eurocode 8**, première et deuxième générations côte à côte.
Même architecture et même habillage que les sites de fondations et de géotechnique
routière de ksr-infra : application web **statique**, aucun framework, aucune compilation.

## État : prototype des bancs « Lire un sismogramme »

| Banc | Rôle |
|---|---|
| **Une station** | sismogramme trois composantes (vélocimètre `HH` ou accéléromètre `HN`) ; vitesse, accélération, déplacement ou Wood-Anderson simulé ; filtres de Butterworth causaux ; rotation Z/R/T ; pointés P et S, amplitude Wood-Anderson ; distance par S − P, heure d'origine, ML (IASPEI 2013), azimut de la source par le mouvement de la P ; mode exercice noté |
| **Réseau · localisation** | quatre stations sur un même axe des temps ; cercles de distance, diagramme de Wadati, localisation par recherche sur grille (x, y, h, t₀), zone compatible, gap azimutal ; épicentre déplaçable en exploration ; mode exercice noté |

Chaque banc a un mode **Explorer** (vérité terrain affichée) et un mode **Exercice**
(séisme tiré au hasard, numéroté, corrigé avec tolérances).

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
src/lecteur-station.js  banc « une station »
src/lecteur-reseau.js   banc « réseau » et onglets
tests/                  signal.test.mjs, localisation.test.mjs
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

## Déploiement — Cloudflare Pages

| Réglage | Valeur |
|---|---|
| Framework preset | **None** |
| Build command | *(vide)* |
| Build output directory | **`/`** |
| Branche de production | `main` |

## Auteur

Dr Ahmed Ksentini.
