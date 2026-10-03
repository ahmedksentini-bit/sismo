# Produit le polycopié PDF à partir du cours interactif.
#
#   npm run polycopie        (ou : python tools/polycopie.py ; PyMuPDF requis)
#
# 1. sert le site en local (http.server) ;
# 2. imprime la couverture et cours.html avec Chrome ou Edge sans interface —
#    les calculateurs s'exécutent : chaque calculateur devient un exemple
#    chiffré, avec ses valeurs par défaut ;
# 3. repère la page de début de chaque chapitre, compose le sommaire paginé,
#    numérote les pages et pose les signets (PyMuPDF) ;
# 4. écrit polycopie/sismologie-polycopie.pdf.
import datetime, json, os, shutil, socket, subprocess, sys, tempfile, threading, time
import http.server, functools
import fitz  # PyMuPDF

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "polycopie", "sismologie-polycopie.pdf")
NAVIGATEURS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/opt/pw-browsers/chromium", "google-chrome", "chromium", "chromium-browser", "microsoft-edge",
]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def navigateur():
    for n in NAVIGATEURS:
        if os.path.exists(n) or shutil.which(n):
            return n if os.path.exists(n) else shutil.which(n)
    sys.exit("Aucun navigateur Chrome ou Edge trouvé pour l'impression en PDF.")


def port_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def servir(port):
    class Silencieux(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    gestion = functools.partial(Silencieux, directory=RACINE)
    serveur = http.server.ThreadingHTTPServer(("127.0.0.1", port), gestion)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    return serveur


def imprimer(nav, url, pdf, profil):
    cmd = [nav, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
           f"--user-data-dir={profil}", "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
           "--virtual-time-budget=20000", f"--print-to-pdf={pdf}", url]
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        cmd.insert(1, "--no-sandbox")  # conteneurs Linux exécutés en root
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
    if not os.path.exists(pdf):
        sys.exit(f"Impression impossible : {url}")


def sommaire_html(chapitres, parties, pages, date):
    lignes = []
    for p in parties:
        liste = [c for c in chapitres if c["partie"] == p["id"] and c["id"] in pages]
        if not liste:
            continue
        lignes.append(f'<h2>Partie {p["id"]} — {p["titre"]}</h2>')
        for c in liste:
            lignes.append(f'<div class="l"><span class="n">{c["number"]}</span><span class="t">{c["title"]}</span>'
                          f'<span class="p">{pages[c["id"]]}</span></div>')
    return f"""<!doctype html><html lang="fr"><head><meta charset="UTF-8"><style>
      @page {{ size: A4; margin: 22mm 20mm; }}
      body {{ font-family: Inter, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }}
      h1 {{ font-size: 22pt; margin: 0 0 5mm; color: #075985; }}
      h2 {{ font-size: 11pt; margin: 5mm 0 1.5mm; color: #075985; text-transform: uppercase; letter-spacing: .06em; }}
      .l {{ display: flex; align-items: baseline; gap: 4mm; padding: 1.5mm 0; border-bottom: .3mm dotted #94a3b8; font-size: 11pt; }}
      .n {{ width: 8mm; font-weight: 800; color: #0891b2; }}
      .t {{ flex: 1; }}
      .p {{ font-weight: 800; font-variant-numeric: tabular-nums; }}
      .note {{ margin-top: 7mm; color: #475569; font-size: 10pt; line-height: 1.5; }}
    </style></head><body>
    <h1>Sommaire</h1>
    {"".join(lignes)}
    <p class="note">Les encadrés bleus sont les calculateurs du cours interactif, imprimés avec leurs valeurs par
    défaut : ce sont autant d'exemples chiffrés, qu'on peut refaire et modifier en ligne dans le cours,
    l'exerciseur et les travaux pratiques. Les calculs suivent l'EN 1998-1:2004 ; la seconde génération de
    l'Eurocode 8 n'est citée que d'après son texte publié.<br><br>Édition du {date}.</p>
    </body></html>"""


def main():
    nav = navigateur()
    plan = json.load(open(os.path.join(RACINE, "data", "chapitres.json"), encoding="utf-8"))
    chapitres = [c for c in plan["chapitres"] if c.get("cours")]
    aujourdhui = datetime.date.today()
    date = f"{aujourdhui.day} {MOIS[aujourdhui.month - 1]} {aujourdhui.year}"
    port = port_libre()
    serveur = servir(port)
    tmp = tempfile.mkdtemp(prefix="polycopie-")
    try:
        profil = os.path.join(tmp, "profil")
        # Couverture
        couv_html = os.path.join(tmp, "couverture.html")
        modele = open(os.path.join(RACINE, "tools", "polycopie-couverture.html"), encoding="utf-8").read()
        open(couv_html, "w", encoding="utf-8").write(modele.replace("__DATE__", date))
        couv_pdf = os.path.join(tmp, "couverture.pdf")
        imprimer(nav, "file:///" + couv_html.replace("\\", "/"), couv_pdf, profil)
        # Cours
        cours_pdf = os.path.join(tmp, "cours.pdf")
        imprimer(nav, f"http://127.0.0.1:{port}/cours.html?impression=1", cours_pdf, profil)
        cours = fitz.open(cours_pdf)
        # Page de début de chaque chapitre (dans le PDF du cours)
        debut = {}
        for c in chapitres:
            titre = f'{c["number"]} · {c["title"]}'
            for i, page in enumerate(cours):
                texte = " ".join(page.get_text().split())
                if titre in texte or f'{c["number"]} · {c["title"][:25]}' in texte:
                    debut[c["id"]] = i
                    break
        manquants = [c["id"] for c in chapitres if c["id"] not in debut]
        if manquants:
            print("Chapitres introuvables dans le PDF :", manquants)
        # Sommaire : la couverture et le sommaire précèdent le cours. Si le sommaire
        # change de nombre de pages, on renumérote et on le réimprime.
        decalage = 2
        som_html = os.path.join(tmp, "sommaire.html")
        som_pdf = os.path.join(tmp, "sommaire.pdf")
        for _ in range(3):
            pages = {k: v + 1 + decalage for k, v in debut.items()}
            open(som_html, "w", encoding="utf-8").write(sommaire_html(chapitres, plan["parties"], pages, date))
            imprimer(nav, "file:///" + som_html.replace("\\", "/"), som_pdf, profil)
            som = fitz.open(som_pdf)
            if 1 + len(som) == decalage:
                break
            decalage = 1 + len(som)
            som.close()
        # Assemblage
        doc = fitz.open()
        doc.insert_pdf(fitz.open(couv_pdf), from_page=0, to_page=0)
        doc.insert_pdf(som)
        doc.insert_pdf(cours)
        total = len(doc)
        for i, page in enumerate(doc):
            if i == 0:
                continue
            r = page.rect
            page.insert_text((r.x0 + 40, r.y1 - 26), "Sismologie et aléa sismique · Génie civil, Eurocode 8",
                             fontsize=7.5, fontname="helv", color=(0.39, 0.45, 0.55))
            n = f"{i + 1} / {total}"
            page.insert_text((r.x1 - 40 - fitz.get_text_length(n, fontname="helv", fontsize=8), r.y1 - 26), n,
                             fontsize=8, fontname="helv", color=(0.2, 0.25, 0.33))
        toc = [[1, "Couverture", 1], [1, "Sommaire", 2]]
        for p in plan["parties"]:
            liste = [c for c in chapitres if c["partie"] == p["id"] and c["id"] in pages]
            if liste:
                toc.append([1, f'Partie {p["id"]} — {p["titre"]}', pages[liste[0]["id"]]])
                for c in liste:
                    toc.append([2, f'{c["number"]} · {c["title"]}', pages[c["id"]]])
        doc.set_toc(toc)
        doc.set_metadata({"title": "Sismologie et aléa sismique — Génie civil, Eurocode 8",
                          "author": "Ahmed Ksentini — École Nationale d'Ingénieurs de Sfax",
                          "subject": "Cours de sismologie de l'ingénieur : sismogrammes, aléa, mouvement de projet, réponse des ouvrages",
                          "keywords": "sismologie, aléa sismique, Eurocode 8, EN 1998-1, magnitude, spectre de réponse, PSHA"})
        os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
        doc.save(SORTIE, garbage=4, deflate=True)
        print(f"{SORTIE} : {total} pages, {os.path.getsize(SORTIE) / 1e6:.1f} Mo")
    finally:
        serveur.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
