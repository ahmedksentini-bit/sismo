"""tools/oq/coefficients.py — exporte les coefficients des lois d'atténuation depuis openquake.hazardlib.

Les coefficients sont ceux publiés par les auteurs (Akkar, Sandıkkaya et Bommer, 2014, tableau 4a ;
Bindi et al., 2014, supplément électronique, non affecté par l'erratum) ;
on les lit dans hazardlib pour éviter toute erreur de recopie. Le fichier produit est un module ES
(le site est statique : pas d'import JSON). À relancer par `npm run references`.
"""
import json
import pathlib
from openquake.hazardlib.gsim.akkar_2014 import AkkarEtAlRjb2014
from openquake.hazardlib.gsim.bindi_2014 import BindiEtAl2014Rjb
from openquake.hazardlib.imt import PGA, PGV

RACINE = pathlib.Path(__file__).resolve().parents[2]
CLES = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'b1', 'b2', 'c', 'n', 'sigma', 'tau']
CLES_BINDI = ['e1', 'c1', 'c2', 'h', 'c3', 'b1', 'b2', 'b3', 'gamma', 'sofN', 'sofR', 'sofS', 'tau', 'phi', 'sigma']


def ligne(c, cles=CLES):
    return {k: float(c[k]) for k in cles}


def ecrire(nom_js, nom_const, donnees):
    sortie = RACINE / 'src' / 'sismo' / 'coefficients' / nom_js
    sortie.write_text(
        '// Fichier produit par tools/oq/coefficients.py (npm run references) : ne pas modifier à la main.\n'
        f'// {donnees["reference"]}.\n'
        f'const {nom_const} = {json.dumps(donnees, ensure_ascii=False, indent=1)};\n'
        f'export default {nom_const};\n', encoding='utf-8')
    print('écrit', sortie.relative_to(RACINE))


def bindi():
    t = BindiEtAl2014Rjb.COEFFS
    sa = sorted(t.sa_coeffs.items(), key=lambda kv: kv[0].period)
    ecrire('bindi2014.js', 'Bindi2014', {
        'reference': 'Bindi et al. (2014), Bull. Earthquake Eng. 12:391–430, distance de Joyner-Boore (supplément électronique)',
        'Mref': 5.5, 'Mh': 6.75, 'Rref': 1.0, 'Vref': 800.0,
        'PGA': ligne(t.non_sa_coeffs[PGA()], CLES_BINDI), 'PGV': ligne(t.non_sa_coeffs[PGV()], CLES_BINDI),
        'SA': [dict(T=float(imt.period), **ligne(c, CLES_BINDI)) for imt, c in sa],
    })


def main():
    bindi()
    t = AkkarEtAlRjb2014.COEFFS
    sa = sorted(t.sa_coeffs.items(), key=lambda kv: kv[0].period)
    donnees = {
        'reference': 'Akkar, Sandıkkaya et Bommer (2014), Bull. Earthquake Eng. 12:359–387, tableau 4a (distance de Joyner-Boore)',
        'c1': AkkarEtAlRjb2014.c1, 'Vref': 750.0, 'Vcon': 1000.0,
        'PGA': ligne(t.non_sa_coeffs[PGA()]), 'PGV': ligne(t.non_sa_coeffs[PGV()]),
        'SA': [dict(T=float(imt.period), **ligne(c)) for imt, c in sa],
    }
    sortie = RACINE / 'src' / 'sismo' / 'coefficients' / 'akkar2014.js'
    sortie.write_text(
        '// Fichier produit par tools/oq/coefficients.py (npm run references) : ne pas modifier à la main.\n'
        f'// {donnees["reference"]}.\n'
        f'const Akkar2014 = {json.dumps(donnees, ensure_ascii=False, indent=1)};\n'
        'export default Akkar2014;\n', encoding='utf-8')
    print('écrit', sortie.relative_to(RACINE))


if __name__ == '__main__':
    main()
