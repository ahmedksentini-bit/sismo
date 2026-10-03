"""tools/opensees/batiment.py — référence du bâtiment en console de cisaillement par OpenSeesPy.

Lit tests/references/modele_batiment.json (exporter-batiment.mjs) et écrit tests/references/batiment.json :
pour chaque bâtiment, les périodes propres et les masses effectives (modalProperties), les réponses
de l'analyse modale spectrale (responseSpectrumAnalysis, mode par mode, avec le spectre de calcul de l'EN 1998-1:2004
recalculé ici) combinées par SRSS et par CQC (Der Kiureghian 1981, ξ = 5 %), et un calcul temporel du système
couplé : amortissement modal de 5 % (modalDamping), UniformExcitation sur une série Path (interpolation
linéaire), Newmark (γ = 1/2, β = 1/4) au pas dt / sous-pas ; toit et maxima sur cette grille fine. Modèle à une dimension : un nœud par plancher, des
éléments zeroLength élastiques pour les étages. OpenSees n'est jamais embarqué dans le site.
"""
import json
import pathlib

import numpy as np
import openseespy.opensees as ops

REF = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references'
G = 9.81
# EN 1998-1:2004, tableaux 3.2 et 3.3 (valeurs recommandées)
EC8 = {1: {'A': (1.0, 0.15, 0.4, 2.0), 'B': (1.2, 0.15, 0.5, 2.0), 'C': (1.15, 0.2, 0.6, 2.0), 'D': (1.35, 0.2, 0.8, 2.0), 'E': (1.4, 0.15, 0.5, 2.0)},
       2: {'A': (1.0, 0.05, 0.25, 1.2), 'B': (1.35, 0.05, 0.25, 1.2), 'C': (1.5, 0.1, 0.25, 1.2), 'D': (1.8, 0.1, 0.3, 1.2), 'E': (1.6, 0.05, 0.25, 1.2)}}


def sd_calcul(T, sp):
    """Spectre de calcul, expressions (3.13) à (3.16), dans l'unité de ag."""
    S, TB, TC, TD = EC8[sp['type']][sp['sol']]
    ag, q, beta = sp['ag'], sp['q'], sp['beta']
    if T <= TB:
        return ag * S * (2 / 3 + T / TB * (2.5 / q - 2 / 3))
    if T <= TC:
        return ag * S * 2.5 / q
    if T <= TD:
        return max(ag * S * 2.5 / q * TC / T, beta * ag)
    return max(ag * S * 2.5 / q * TC * TD / T ** 2, beta * ag)


def modele(b):
    n = len(b['m'])
    ops.wipe()
    ops.model('basic', '-ndm', 1, '-ndf', 1)
    ops.node(0, 0.0)
    ops.fix(0, 1)
    for i in range(n):
        ops.node(i + 1, 0.0)
        ops.mass(i + 1, b['m'][i])
        ops.uniaxialMaterial('Elastic', i + 1, b['k'][i])
        ops.element('zeroLength', i + 1, i, i + 1, '-mat', i + 1, '-dir', 1)
    lam = ops.eigen('-fullGenLapack', n)  # tous les modes : lent mais sans importance ici
    w = np.sqrt(np.array(lam))
    phi = np.array([[ops.nodeEigenvector(i + 1, j + 1, 1) for i in range(n)] for j in range(n)])
    mp = ops.modalProperties('-return')
    return n, w, phi, mp


def rho(wi, wj, xi=0.05):
    r = min(wi, wj) / max(wi, wj)
    return 8 * xi ** 2 * (1 + r) * r ** 1.5 / ((1 - r * r) ** 2 + 4 * xi ** 2 * r * (1 + r) ** 2)


def calculer(b, sp, acc, dt):
    m = np.array(b['m'])
    n, w, phi, mp = modele(b)
    T = np.array(mp['eigenPeriod'])
    meff = np.array(mp['partiMassMX'])
    # analyse modale spectrale, mode par mode
    ops.constraints('Plain')
    ops.numberer('Plain')
    ops.system('FullGeneral')
    ops.algorithm('Linear')
    ops.integrator('LoadControl', 0.0)
    ops.analysis('Static')
    U, V = [], []
    for j in range(n):
        # série constante égale à Sa(Tj) (l'option -scale n'agit pas sur une série constante)
        ops.timeSeries('Constant', 100 + j, '-factor', sd_calcul(T[j], sp) * G)
        ops.responseSpectrumAnalysis(100 + j, 1, '-mode', j + 1)
        U.append([ops.nodeDisp(i + 1, 1) for i in range(n)])
        V.append([ops.basicForce(i + 1)[0] for i in range(n)])
    U, V = np.array(U), np.array(V)
    P = np.array([[1.0 if i == j else rho(w[i], w[j]) for j in range(n)] for i in range(n)])
    comb = {'srss': lambda R: np.sqrt((R ** 2).sum(axis=0)), 'cqc': lambda R: np.sqrt(np.einsum('ic,ij,jc->c', R, P, R))}
    sortie = {'nom': b['nom'], 'T': T.tolist(), 'meff': meff.tolist()}
    for regle, f in comb.items():
        sortie[regle] = {'u': f(U).tolist(), 'V': f(V).tolist()}
    # calcul temporel du système couplé, amortissement modal
    modele(b)
    ops.modalDamping(0.05)
    ops.timeSeries('Path', 2, '-dt', dt, '-values', *acc)
    ops.pattern('UniformExcitation', 2, 1, '-accel', 2)
    ops.constraints('Plain')
    ops.numberer('Plain')
    ops.system('FullGeneral')
    ops.algorithm('Linear')
    ops.integrator('Newmark', 0.5, 0.25)
    ops.analysis('Transient')
    sp_ = b['sousPas']
    toit, vmax = [0.0], np.zeros(n)
    for _ in range((len(acc) - 1) * sp_):
        assert ops.analyze(1, dt / sp_) == 0
        toit.append(ops.nodeDisp(n, 1))
        vmax = np.maximum(vmax, np.abs([ops.basicForce(i + 1)[0] for i in range(n)]))
    sortie['toit'] = [float(f'{x:.10g}') for x in toit]
    sortie['VMax'] = vmax.tolist()
    return sortie


def main():
    mod = json.loads((REF / 'modele_batiment.json').read_text(encoding='utf-8'))
    sortie = {'outil': 'OpenSeesPy ' + ops.version(), 'batiments': [calculer(b, mod['spectre'], mod['acc'], mod['dt']) for b in mod['batiments']]}
    ops.wipe()
    (REF / 'batiment.json').write_text(json.dumps(sortie), encoding='utf-8')
    print(f"écrit tests/references/batiment.json ({len(sortie['batiments'])} bâtiments)")


if __name__ == '__main__':
    main()
