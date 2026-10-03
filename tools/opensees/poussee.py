"""tools/opensees/poussee.py — référence de la poussée progressive et du calcul temporel non linéaire par OpenSeesPy.

Lit tests/references/modele_poussee.json (exporter-poussee.mjs) et écrit tests/references/poussee.json. Modèle à
une dimension : un nœud par plancher, des éléments zeroLength en Steel01 (Fy = Vy, E0 = k, b = α, sans écrouissage
isotrope) pour les étages.
- Poussée : profils « modal » (Fi = mi·Φi) et « uniforme » (Fi = mi), déplacement imposé au sommet par petits pas
  (DisplacementControl) jusqu'à deux fois le déplacement de plastification ; b = 10⁻³ pour que la rigidité ne
  s'annule pas. On relève l'étage critique (plus grand glissement final) et le point de plastification : le dernier état
  élastique mis à l'échelle jusqu'à ce qu'un premier étage atteigne sa résistance.
- Temporel : amortissement de Rayleigh sur la rigidité initiale (ξ aux modes 1 et 2), UniformExcitation sur une
  série Path, Newmark (γ = 1/2, β = 1/4) et Newton au pas dt / sous-pas ; déplacement en tête aux instants du signal
  et glissements d'étage maximaux sur la grille fine.
OpenSees n'est jamais embarqué dans le site.
"""
import json
import pathlib

import numpy as np
import openseespy.opensees as ops

REF = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references'


def modele(b, durci=None):
    n = len(b['m'])
    ops.wipe()
    ops.model('basic', '-ndm', 1, '-ndf', 1)
    ops.node(0, 0.0)
    ops.fix(0, 1)
    for i in range(n):
        ops.node(i + 1, 0.0)
        ops.mass(i + 1, b['m'][i])
        ops.uniaxialMaterial('Steel01', i + 1, b['Vy'][i], b['k'][i], b['alpha'] if durci is None else durci)
        ops.element('zeroLength', i + 1, i, i + 1, '-mat', i + 1, '-dir', 1, '-doRayleigh', 1)  # sinon pas d'amortissement de raideur
    return n


def poussee(b, p):
    n = modele(b, durci=1e-3)
    S = np.cumsum(np.array(p)[::-1])[::-1]
    lam = min(b['Vy'][i] / S[i] for i in range(n))
    dy_estime = lam * sum(S[i] / b['k'][i] for i in range(n))
    ops.timeSeries('Linear', 1)
    ops.pattern('Plain', 1, 1)
    for i in range(n):
        ops.load(i + 1, p[i])
    ops.constraints('Plain')
    ops.numberer('Plain')
    ops.system('FullGeneral')
    ops.test('NormDispIncr', 1e-12, 50)
    ops.algorithm('Newton')
    pas = 401
    ops.integrator('DisplacementControl', n, 1, 2 * dy_estime / pas)
    ops.analysis('Static')
    elastique = None
    for _ in range(pas):
        assert ops.analyze(1) == 0
        f = [ops.basicForce(i + 1)[0] for i in range(n)]
        if all(abs(f[i]) < b['Vy'][i] for i in range(n)):
            elastique = (ops.nodeDisp(n, 1), ops.basicForce(1)[0], f)
    # point de plastification : le dernier état élastique, mis à l'échelle jusqu'à ce qu'un étage atteigne Vy
    d, vb, f = elastique
    r = min(b['Vy'][i] / f[i] for i in range(n))
    glissements = [ops.nodeDisp(i + 1, 1) - (ops.nodeDisp(i, 1) if i else 0.0) for i in range(n)]
    return {'critique': int(np.argmax(glissements)), 'dy': r * d, 'Fy': r * vb}


def temporel(b, acc, dt, xi):
    n = modele(b)
    lam = ops.eigen('-fullGenLapack', n) if n > 1 else ops.eigen('-fullGenLapack', 1)
    w = np.sqrt(np.array(lam))
    if n > 1:
        a0, a1 = 2 * xi * w[0] * w[1] / (w[0] + w[1]), 2 * xi / (w[0] + w[1])
    else:
        a0, a1 = 2 * xi * w[0], 0.0
    ops.rayleigh(a0, 0.0, a1, 0.0)
    ops.timeSeries('Path', 1, '-dt', dt, '-values', *acc)
    ops.pattern('UniformExcitation', 1, 1, '-accel', 1)
    ops.constraints('Plain')
    ops.numberer('Plain')
    ops.system('FullGeneral')
    ops.test('NormDispIncr', 1e-13, 50)
    ops.algorithm('Newton')
    ops.integrator('Newmark', 0.5, 0.25)
    ops.analysis('Transient')
    s = b['sousPas']
    toit, dmax = [0.0], np.zeros(n)
    for _ in range(len(acc) - 1):
        for _ in range(s):
            assert ops.analyze(1, dt / s) == 0
            u = [0.0] + [ops.nodeDisp(i + 1, 1) for i in range(n)]
            dmax = np.maximum(dmax, np.abs(np.diff(u)))
        toit.append(float(f'{ops.nodeDisp(n, 1):.10g}'))
    return toit, dmax.tolist()


def main():
    mod = json.loads((REF / 'modele_poussee.json').read_text(encoding='utf-8'))
    sortie = {'outil': 'OpenSeesPy ' + ops.version(), 'batiments': []}
    for b in mod['batiments']:
        modal = [b['m'][i] * b['phi'][i] for i in range(len(b['m']))]
        res = {'nom': b['nom'], 'poussee': {'modal': poussee(b, modal), 'uniforme': poussee(b, b['m'])}}
        res['toit'], res['dMax'] = temporel(b, mod['acc'], mod['dt'], mod['xi'])
        sortie['batiments'].append(res)
    ops.wipe()
    (REF / 'poussee.json').write_text(json.dumps(sortie), encoding='utf-8')
    print(f"écrit tests/references/poussee.json ({len(sortie['batiments'])} bâtiments)")


if __name__ == '__main__':
    main()
