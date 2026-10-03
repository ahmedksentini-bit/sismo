import Sismo from '../sismo/signal.js';

// src/cours/questions-01.js — test de la leçon 1 (Lire un sismogramme). Données pures : les réponses chiffrées
// viennent des solveurs du site (Sismo.kmS, Sismo.ML), pour que le cours et les bancs disent la même chose.
const virg = (x, d = 1) => x.toFixed(d).replace('.', ',');
const k = Sismo.kmS;

const Questions01 = [
  {
    type: 'choix', enonce: 'Sur un sismogramme, quelle onde arrive en premier ?',
    choix: ['L\'onde S', 'L\'onde P', 'L\'onde de surface'], bonne: 1,
    explication: 'L\'onde P est la plus rapide : environ 6 km/s dans la croûte, contre 3,5 km/s pour l\'onde S.',
  },
  {
    type: 'choix', enonce: 'L\'écart S − P vaut 5 s. Le séisme est à environ…',
    choix: ['20 km', `${virg(k * 5, 0)} km`, '85 km'], bonne: 1,
    explication: `d ≈ ${virg(k)} × 5 = ${virg(k * 5, 0)} km.`,
  },
  {
    type: 'choix', enonce: 'À la même distance, l\'amplitude lue sur le Wood-Anderson est 10 fois plus grande. La magnitude est…',
    choix: ['plus grande de 0,1', 'plus grande de 1', '10 fois plus grande'], bonne: 1,
    explication: 'ML contient log10 A : multiplier A par 10 ajoute 1 à la magnitude.',
  },
  {
    type: 'choix', enonce: 'Deux villes sont à 10 km et à 100 km du même séisme. Que peut-on dire ?',
    choix: ['Même magnitude, même accélération du sol', 'Même magnitude, accélérations différentes', 'Magnitudes différentes'], bonne: 1,
    explication: 'La magnitude caractérise le séisme, une seule valeur ; l\'accélération du sol dépend de la distance et du sol de chaque ville.',
  },
  {
    type: 'nombre', enonce: 'L\'onde P arrive à 8,2 s, l\'onde S à 14,2 s. Distance hypocentrale, en km ?',
    reponse: k * 6, ecart: { relatif: 0.05 }, unite: 'km', decimales: 0,
    explication: `S − P = 6,0 s, d ≈ ${virg(k)} × 6,0 ≈ ${virg(k * 6, 0)} km.`,
  },
  {
    type: 'nombre', enonce: 'Amplitude maximale A = 500 nm sur le Wood-Anderson, distance R = 40 km. Magnitude ML ?',
    reponse: Sismo.ML(500, 40), ecart: { absolu: 0.1 }, unite: '', decimales: 1,
    explication: `ML = log10 500 + 1,11·log10 40 + 0,00189 × 40 − 2,09 = ${virg(Math.log10(500), 2)} + ${virg(1.11 * Math.log10(40), 2)} + ${virg(0.00189 * 40, 2)} − 2,09 ≈ ${virg(Sismo.ML(500, 40))}.`,
  },
];
export default Questions01;
