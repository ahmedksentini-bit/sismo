// Chargement des fichiers de données du cours.
//
// Il y a une raison d'avoir une fonction plutôt qu'un `fetch().then(r=>r.json())`
// écrit dix fois : quand le fichier n'arrive pas, il faut que cela SE VOIE.
//
// Le mode de panne rencontré : hors ligne, le service worker répondait par la
// coquille HTML à toute requête absente du cache, y compris à un .json. Le
// module recevait « <!doctype … » au lieu de données, jetait au premier
// `.json()`, et le chapitre restait vide — sans message, sans trace, sans rien
// qui permette à un étudiant de comprendre qu'il manquait un fichier.
export async function chargerJson(chemin) {
  let reponse;
  try {
    reponse = await fetch(chemin);
  } catch (e) {
    throw new Error(`${chemin} — le réseau n'a pas répondu (${e.message})`);
  }
  if (!reponse.ok)
    throw new Error(`${chemin} — le serveur a répondu ${reponse.status} ${reponse.statusText}`);
  const texte = await reponse.text();
  // Une coquille HTML servie à la place des données : le cas ci-dessus.
  if (/^\s*</.test(texte))
    throw new Error(`${chemin} — une page HTML a été servie à la place des données. `
      + "Le fichier manque sur le serveur, ou le cache hors ligne est incomplet.");
  try {
    return JSON.parse(texte);
  } catch (e) {
    throw new Error(`${chemin} — contenu illisible : ${e.message}`);
  }
}

/** Charge plusieurs fichiers de `data/`, dans l'ordre demandé. */
export const chargerDonnees = (...noms) =>
  Promise.all(noms.map((n) => chargerJson(`data/${n}.json`)));

/**
 * Affiche la panne là où la figure aurait dû être. Un chapitre vide et muet
 * est le pire des deux mondes : on ne sait pas s'il manque un fichier, si le
 * navigateur est trop vieux, ou si l'on a mal lu.
 */
export function signalerPanne(conteneurs, erreur) {
  const message = `<p class="feedback bad"><strong>Cette partie du cours n'a pas pu se
    charger.</strong><br>${erreur.message}<br><small>Rechargez la page. Si la panne persiste
    hors connexion, c'est que le fichier n'a pas encore été mis en cache : revenez une fois
    en ligne.</small></p>`;
  for (const id of conteneurs) {
    const cible = document.getElementById(id);
    if (cible) cible.innerHTML = message;
  }
  console.error("Chargement des données :", erreur);
}
