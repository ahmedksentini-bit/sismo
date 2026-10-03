"""tools/oq/coefficients.py — exporte les coefficients des lois d'atténuation depuis openquake.hazardlib.

Les coefficients sont ceux publiés par les auteurs (Akkar, Sandıkkaya et Bommer, 2014, tableau 4a) ;
on les lit dans hazardlib pour éviter toute erreur de recopie. Le fichier produit est un module ES
(le site est statique : pas d'import JSON). À relancer par `npm run references`.
"""
import json
import pathlib
from openquake.hazardlib.gsim.akkar_2014 import AkkarEtAlRjb2014
from openquake.hazardlib.imt import PGA, PGV

RACINE = pathlib.Path(__file__).resolve().parents[2]
CLES = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'b1', 'b2', 'c', 'n', 'sigma', 'tau']


def ligne(c):
    return {k: float(c[k]) for k in CLES}


def main():
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
