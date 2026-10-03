// Fichier produit par tools/calage-accelerogrammes.mjs (npm run calage) : ne pas modifier à la main.
// Correction c(f) du spectre de Fourier des accélérogrammes synthétiques (f en Hz), qui ramène la moyenne
// des ln Sa sur la médiane d'Akkar et al. (2014), Bindi et al. (2014) et Boore et al. (2014) à Vs30 = 800 m/s,
// sur M 5, 5.5, 6, 6.5, 7, 7.5 × Rjb 5, 10, 20, 40, 80, 150 km × 12 graines.
const CalageAccelerogrammes = {"correction":[[0.33333,1.2009],[0.5,1.0429],[0.66667,1.0185],[1,0.96289],[1.4286,1.0053],[2,1.1143],[2.5,1.0215],[3.3333,1.099],[5,1.2385],[6.6667,1.256],[10,1.251],[25,1.8931]],"periodes":[0.04,0.1,0.15,0.2,0.3,0.4,0.5,0.7,1,1.5,2,3],"residus":[-0.0216,0.0013,0.0001,-0.0001,-0.0004,0.0013,-0.0014,0.0005,0.0002,-0.0007,0.0013,-0.0007]};
export default CalageAccelerogrammes;
