"""tools/opensees/sdof.py — référence de l'oscillateur inélastique par OpenSeesPy.

Lit tests/references/modele_inelastique.json (exporter-inelastique.mjs) et écrit tests/references/inelastique.json :
pour chaque oscillateur, le déplacement relatif et la force du ressort aux instants du signal, et le déplacement
maximal. Modèle : masse unitaire, élément zeroLength en Steel01 (fy, k = ω², b = α ; sans écrouissage isotrope),
amortissement de Rayleigh proportionnel à la masse (c = 2ξω), UniformExcitation sur une série Path (interpolation
linéaire), Newmark (γ = 1/2, β = 1/4) et Newton, sous-pas h = dt/m avec m = ⌈dt/(T/20)⌉ comme le site.
OpenSees n'est jamais embarqué dans le site.
"""
import json
import math
import pathlib

import openseespy.opensees as ops

REF = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references'


def f7(v):
    return float(f'{v:.9g}')


def calculer(acc, dt, T, xi, fy, alpha):
    w = 2 * math.pi / T
    k = w * w
    ops.wipe()
    ops.model('basic', '-ndm', 1, '-ndf', 1)
    ops.node(1, 0.0)
    ops.node(2, 0.0)
    ops.fix(1, 1)
    ops.mass(2, 1.0)
    ops.uniaxialMaterial('Steel01', 1, fy, k, alpha)
    ops.element('zeroLength', 1, 1, 2, '-mat', 1, '-dir', 1)
    ops.timeSeries('Path', 1, '-dt', dt, '-values', *acc)
    ops.pattern('UniformExcitation', 1, 1, '-accel', 1)
    ops.rayleigh(2 * xi * w, 0.0, 0.0, 0.0)
    ops.constraints('Plain')
    ops.numberer('Plain')
    ops.system('BandGeneral')
    ops.test('NormDispIncr', 1e-13, 50)
    ops.algorithm('Newton')
    ops.integrator('Newmark', 0.5, 0.25)
    ops.analysis('Transient')
    m = max(1, math.ceil(dt / (T / 20) - 1e-9))
    u, f = [0.0], [0.0]
    for _ in range(len(acc) - 1):
        for _ in range(m):
            assert ops.analyze(1, dt / m) == 0
        u.append(ops.nodeDisp(2, 1))
        f.append(ops.basicForce(1)[0])
    return u, f


def main():
    modele = json.loads((REF / 'modele_inelastique.json').read_text(encoding='utf-8'))
    sortie = {'outil': 'OpenSeesPy ' + ops.version(), 'cas': []}
    for c in modele['cas']:
        u, f = calculer(modele['acc'], modele['dt'], c['T'], c['xi'], c['fy'], c['alpha'])
        sortie['cas'].append({**c, 'umax': max(abs(x) for x in u), 'u': [f7(x) for x in u], 'f': [f7(x) for x in f]})
    ops.wipe()
    (REF / 'inelastique.json').write_text(json.dumps(sortie), encoding='utf-8')
    print(f"écrit tests/references/inelastique.json ({len(sortie['cas'])} oscillateurs)")


if __name__ == '__main__':
    main()
