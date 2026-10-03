"""tools/eqsig/intensite.py — référence des indicateurs d'accélérogramme par eqsig (eng-tools, licence MIT).

Lit les accélérogrammes de tests/references/modele_inelastique.json (m/s²) et modele_site.json (g, convertis) et
écrit tests/references/intensite.json : PGA, PGV (vitesse par trapèzes), intensité d'Arias, durées significatives
5–95 % et 5–75 %, CAV. eqsig n'est jamais embarqué dans le site.
"""
import json
import pathlib

import eqsig
import numpy as np

REF = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references'


def main():
    sources = []
    m = json.loads((REF / 'modele_inelastique.json').read_text(encoding='utf-8'))
    sources.append(('inelastique', np.array(m['acc']), m['dt']))
    s = json.loads((REF / 'modele_site.json').read_text(encoding='utf-8'))
    for mv in s['mouvements']:
        sources.append((f"site-{mv['nom']}", np.array(mv['acc']) * 9.81, mv['dt']))
    sortie = []
    for nom, acc, dt in sources:
        a = eqsig.AccSignal(acc, dt)
        sortie.append({'nom': nom, 'pga': float(a.pga), 'pgv': float(a.pgv), 'arias': float(eqsig.im.calc_arias_intensity(a)[-1]),
                       'd595': float(eqsig.im.calc_sig_dur(a, 0.05, 0.95)), 'd575': float(eqsig.im.calc_sig_dur(a, 0.05, 0.75)),
                       'cav': float(eqsig.im.calc_cav(a)[-1])})
    (REF / 'intensite.json').write_text(json.dumps({'outil': 'eqsig ' + eqsig.__about__.__version__, 'accelerogrammes': sortie}), encoding='utf-8')
    print(f'écrit tests/references/intensite.json ({len(sortie)} accélérogrammes)')


if __name__ == '__main__':
    main()
