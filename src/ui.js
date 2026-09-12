// Panneau de commande : heure, météo, repères, étiquettes.
export function creerInterface({ landmarks, surRepere, surHeure, surPluie, surEtiquettes, surRonde, surCourbes, surVueLarge }) {
  const $ = (s) => document.querySelector(s);
  const heure = $('#heure');
  const pendule = $('#pendule');
  const moment = $('#moment');
  const jouer = $('#jouer');
  const fiche = $('#fiche');
  const barre = $('.reperes');
  const replier = $('#replier');

  const format = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.floor(min) % 60).padStart(2, '0')}`;
  const nommer = (min) => {
    const h = min / 60;
    if (h < 4.5) return 'nuit';
    if (h < 6.3) return 'aube';
    if (h < 8.5) return 'lever';
    if (h < 11.5) return 'matin';
    if (h < 14) return 'midi';
    if (h < 17.5) return 'après-midi';
    if (h < 19.4) return 'soir';
    if (h < 21) return 'crépuscule';
    return 'nuit';
  };

  let defilement = false;
  const rafraichir = () => {
    const v = +heure.value;
    pendule.textContent = format(v);
    moment.textContent = nommer(v);
    surHeure(v / 60);
  };
  heure.addEventListener('input', () => { defilement = false; jouer.classList.remove('actif'); jouer.textContent = '▶'; rafraichir(); });

  jouer.addEventListener('click', () => {
    defilement = !defilement;
    jouer.classList.toggle('actif', defilement);
    jouer.textContent = defilement ? '❚❚' : '▶';
  });

  /* --- repli du panneau : sur téléphone il occupe la moitié de l'écran --- */
  const majPoignee = () => {
    const replie = document.body.classList.contains('replie');
    replier.textContent = replie ? '▴' : '▾';
    replier.title = replie ? 'Afficher le panneau (h)' : 'Réduire le panneau (h)';
    replier.setAttribute('aria-label', replier.title);
    replier.setAttribute('aria-expanded', String(!replie));
  };
  const basculerPanneau = () => {
    document.body.classList.toggle('replie');
    majPoignee();
  };
  replier.addEventListener('click', basculerPanneau);
  majPoignee();

  addEventListener('keydown', (e) => {
    if (/input|textarea|button|select/i.test(e.target.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      jouer.click();
    } else if (e.key === 'h' || e.key === 'H') {
      basculerPanneau();
    }
  });

  let actif = null;
  for (const l of landmarks) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.name;
    b.addEventListener('click', () => {
      for (const o of barre.children) o.classList.remove('actif');
      b.classList.add('actif');
      actif = l.id;
      fiche.hidden = false;
      fiche.querySelector('h2').textContent = l.name;
      fiche.querySelector('p').textContent = l.sub;
      surRepere(l);
    });
    barre.append(b);
  }
  fiche.querySelector('.fermer').addEventListener('click', () => {
    fiche.hidden = true;
    for (const o of barre.children) o.classList.remove('actif');
    actif = null;
  });

  $('#pluie').addEventListener('change', (e) => surPluie(e.target.checked));
  $('#etiquettes').addEventListener('change', (e) => surEtiquettes(e.target.checked));
  $('#courbes').addEventListener('change', (e) => surCourbes(e.target.checked));
  $('#ronde').addEventListener('change', (e) => surRonde(e.target.checked));
  $('#vueLarge').addEventListener('click', () => {
    fiche.hidden = true;
    for (const o of barre.children) o.classList.remove('actif');
    surVueLarge();
  });

  rafraichir();

  return {
    /** Avance l'horloge quand le défilement est actif. */
    tic(dt) {
      if (!defilement) return;
      heure.value = (+heure.value + dt * 78) % 1440;
      rafraichir();
    },
    get repereActif() { return actif; },
    caler(minutes) { heure.value = minutes; rafraichir(); },
  };
}

/** Étiquettes HTML posées sur les points de la carte. */
export function creerEtiquettes(conteneur, entrees) {
  const noeuds = entrees.map((e) => {
    const d = document.createElement('div');
    d.className = 'etiq' + (e.vedette ? ' vedette' : '');
    d.textContent = e.texte;
    if (e.onClick) d.addEventListener('click', e.onClick);
    conteneur.append(d);
    return { d, e, visible: true };
  });
  return {
    noeuds,
    maj(camera, taille, actives, portee) {
      for (const n of noeuds) {
        if (!actives) { if (n.visible) { n.d.style.display = 'none'; n.visible = false; } continue; }
        const v = n.e.position.clone();
        const d = v.distanceTo(camera.position);
        v.project(camera);
        const dedans = v.z < 1 && d < (n.e.vedette ? portee * 2.6 : portee);
        if (!dedans) { if (n.visible) { n.d.style.display = 'none'; n.visible = false; } continue; }
        if (!n.visible) { n.d.style.display = ''; n.visible = true; }
        n.d.style.left = `${(v.x * 0.5 + 0.5) * taille.x}px`;
        n.d.style.top = `${(-v.y * 0.5 + 0.5) * taille.y}px`;
        n.d.style.opacity = String(Math.min(1, Math.max(0.15, 1 - d / (n.e.vedette ? portee * 2.6 : portee))));
      }
    },
  };
}
