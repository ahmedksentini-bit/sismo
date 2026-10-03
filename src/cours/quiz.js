// src/cours/quiz.js — test d'auto-évaluation d'une leçon : questions à choix ou à réponse chiffrée, correction
// immédiate avec explication, score ; corrigé imprimé en fin de polycopié. Interface seulement : les questions et
// leurs réponses viennent d'un module de données pur (src/cours/questions-NN.js).
const virg = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—');
const lettre = i => 'abcdefgh'[i];

export function monterQuiz(conteneur, questions) {
  const etat = questions.map(() => null);
  const score = document.createElement('p');
  score.className = 'score-quiz';
  const maj = () => {
    const faites = etat.filter(x => x !== null).length, justes = etat.filter(x => x === true).length;
    score.textContent = faites ? `${justes} juste${justes > 1 ? 's' : ''} sur ${faites} répondue${faites > 1 ? 's' : ''} (${questions.length} questions)` : '';
  };
  questions.forEach((q, i) => {
    const bloc = document.createElement('div'), retour = document.createElement('p');
    bloc.className = 'question';
    bloc.innerHTML = `<p class="enonce">${i + 1}. ${q.enonce}</p>`;
    retour.className = 'retour'; retour.hidden = true;
    const corriger = (ok, detail) => {
      etat[i] = ok;
      retour.hidden = false; retour.className = `retour ${ok ? 'juste' : 'faux'}`;
      retour.innerHTML = `${ok ? 'Juste.' : 'Pas tout à fait.'} <span>${detail}</span>`;
      maj();
    };
    if (q.type === 'choix') {
      const liste = document.createElement('div');
      liste.className = 'choix';
      q.choix.forEach((c, j) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = `${lettre(j)}) ${c}`;
        b.addEventListener('click', () => {
          liste.querySelectorAll('button').forEach(x => x.classList.remove('juste', 'faux'));
          b.classList.add(j === q.bonne ? 'juste' : 'faux');
          corriger(j === q.bonne, q.explication);
        });
        liste.appendChild(b);
      });
      bloc.appendChild(liste);
    } else {
      const saisie = document.createElement('div'), champ = document.createElement('input'), b = document.createElement('button');
      saisie.className = 'saisie';
      champ.type = 'text'; champ.inputMode = 'decimal'; champ.autocomplete = 'off'; champ.setAttribute('aria-label', `Réponse à la question ${i + 1}`);
      b.type = 'button'; b.textContent = 'Vérifier';
      const verifier = () => {
        const v = parseFloat(String(champ.value).replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(v)) return;
        const tol = q.ecart.relatif ? q.ecart.relatif * Math.abs(q.reponse) : q.ecart.absolu;
        corriger(Math.abs(v - q.reponse) <= tol, `Réponse : ${virg(q.reponse, q.decimales)}${q.unite ? ' ' + q.unite : ''}. ${q.explication}`);
      };
      b.addEventListener('click', verifier);
      champ.addEventListener('keydown', e => { if (e.key === 'Enter') verifier(); });
      saisie.append(champ, b);
      if (q.unite) saisie.append(Object.assign(document.createElement('span'), { textContent: q.unite }));
      bloc.appendChild(saisie);
    }
    bloc.appendChild(retour);
    conteneur.appendChild(bloc);
  });
  conteneur.appendChild(score);
  // corrigé, visible seulement à l'impression
  const corrige = document.createElement('div');
  corrige.className = 'corrige-imprime';
  corrige.innerHTML = `<p><b>Corrigé.</b> ${questions.map((q, i) => `${i + 1}. ${q.type === 'choix' ? `${lettre(q.bonne)})` : `${virg(q.reponse, q.decimales)}${q.unite ? ' ' + q.unite : ''}`}`).join(' · ')}</p>`;
  conteneur.appendChild(corrige);
}
