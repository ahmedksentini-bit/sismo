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
11. **Onglets** : `src/onglets.js` émet `banc:ouvert` ; un banc caché ne dessine pas
    (ses canvas ont une largeur nulle) et se construit à sa première ouverture.
