"""tools/carte/cotes.py — fond de carte de la page « En direct » : côtes et frontières de Natural Earth (1:50 m,
domaine public, https://www.naturalearthdata.com), découpées au bassin méditerranéen et simplifiées (Douglas-Peucker),
écrites dans data/cotes-mediterranee.json (fichier produit, à ne pas modifier à la main).

Usage : python tools/carte/cotes.py [dossier contenant ne_50m_coastline.geojson et ne_50m_admin_0_boundary_lines_land.geojson]
Sans dossier, les fichiers sont téléchargés depuis le dépôt nvkelso/natural-earth-vector.
"""
import json
import pathlib
import sys
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parents[2]
SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
FICHIERS = {'cotes': 'ne_50m_coastline.geojson', 'frontieres': 'ne_50m_admin_0_boundary_lines_land.geojson'}
# Domaine gardé (un peu plus large que la vue de la page, pour que rien ne s'arrête au bord)
LON = (-20.0, 50.0)
LAT = (22.0, 53.0)
TOLERANCE = 0.025  # degrés


def lire(nom, dossier):
    if dossier:
        return json.loads((pathlib.Path(dossier) / nom).read_text(encoding='utf-8'))
    with urllib.request.urlopen(SOURCE + nom) as r:
        return json.loads(r.read().decode('utf-8'))


def lignes(geo):
    for f in geo['features']:
        g = f['geometry']
        if g['type'] == 'LineString':
            yield g['coordinates']
        elif g['type'] == 'MultiLineString':
            yield from g['coordinates']


def dedans(p):
    return LON[0] <= p[0] <= LON[1] and LAT[0] <= p[1] <= LAT[1]


def decouper(ligne):
    """Morceaux de la ligne à l'intérieur du domaine (un point extérieur coupe la ligne)."""
    cour = []
    for p in ligne:
        if dedans(p):
            cour.append(p)
        else:
            if len(cour) > 1:
                yield cour
            cour = []
    if len(cour) > 1:
        yield cour


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n = (dx * dx + dy * dy) ** 0.5
    dmax, imax = -1, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * (x - x1) - dx * (y - y1)) / n if n > 0 else ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
        if d > dmax:
            dmax, imax = d, i
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return douglas_peucker(pts[:imax + 1], tol)[:-1] + douglas_peucker(pts[imax:], tol)


def main():
    dossier = sys.argv[1] if len(sys.argv) > 1 else None
    sortie = {'source': 'Natural Earth 1:50 m (domaine public), découpé et simplifié par tools/carte/cotes.py',
              'domaine': {'lon': LON, 'lat': LAT}}
    for cle, nom in FICHIERS.items():
        out = []
        for l in lignes(lire(nom, dossier)):
            for morceau in decouper(l):
                s = douglas_peucker(morceau, TOLERANCE)
                if len(s) > 1:
                    # coordonnées plates [lon, lat, lon, lat…], au centième de degré
                    out.append([round(v, 2) for p in s for v in p[:2]])
        sortie[cle] = out
    chemin = RACINE / 'data' / 'cotes-mediterranee.json'
    chemin.write_text(json.dumps(sortie, separators=(',', ':')), encoding='utf-8')
    print(f"écrit {chemin.relative_to(RACINE)} : {len(sortie['cotes'])} côtes, {len(sortie['frontieres'])} frontières, "
          f"{chemin.stat().st_size // 1024} Ko")


if __name__ == '__main__':
    main()
