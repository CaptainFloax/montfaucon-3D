# Ce que j'ai décidé seul

Carte 3D interactive de **Montfaucon-Montigné (49230)**, commune déléguée de Sèvremoine,
dans la vallée de la Moine. Tout ce qui suit relève de choix que j'ai faits sans te
demander, parce que la consigne laissait la place — avec, à chaque fois, la raison.

---

## 1. L'emprise et le centre de la carte

**Décision.** Une fenêtre de **3 638 × 3 538 m** centrée sur `47.0925 N, −1.1305 O`
(bbox `47.0765 / −1.1545 / 47.1085 / −1.1065`).

**Pourquoi.** Montfaucon-Montigné est née de la fusion de deux bourgs, **Montfaucon-sur-Moine**
au nord (l'église Saint-Jacques, la motte, la chapelle Saint-Jean) et **Montigné-sur-Moine**
au sud (l'église Saint-Martin), séparés par 1,8 km et par la Moine. Une emprise plus serrée
sur un seul bourg aurait amputé la commune ; plus large, on aurait noyé le bourg dans du
parcellaire agricole. 3,6 km tient les deux bourgs, la traversée de la rivière et le bocage
autour.

**Projection.** ENU local en mètres (équirectangulaire calée sur la latitude d'origine),
pas de Mercator : à cette échelle l'erreur est inférieure au décimètre et les distances
restent des mètres, ce qui simplifie tout le reste (hauteurs, vitesses, portées de lumière).

## 2. La rivière : c'est la Moine, pas la Sèvre

**Décision.** Les barques naviguent sur **la Moine**.

**Pourquoi.** Tu as écrit « la Sèvre ». La Sèvre Nantaise passe à Clisson, 12 km plus à
l'ouest : elle n'entre pas dans l'emprise communale. La rivière de Montfaucon-Montigné est
**la Moine**, affluent de la Sèvre Nantaise — c'est elle qui donne leur nom aux deux bourgs
(« -sur-Moine »), qui porte le pont de Moine et qui faisait tourner les moulins. J'ai donc
mis les barques sur la Moine ; si tu voulais vraiment la Sèvre, il faudrait déplacer
l'emprise, et on perdrait la commune.

## 3. Les données

| Donnée | Source | Cache |
|---|---|---|
| Bâti, voirie, hydrographie, occupation du sol, POI | **API Overpass / OpenStreetMap** (ODbL) | `data/raw/*.json` puis `data/montfaucon-montigne.osm.json` |
| Relief | **OpenTopoData / EU-DEM 25 m** (Copernicus) | `data/elevation.json` |
| Scène prête à charger | préprocesseur local | `data/scene.json` |

**Décision : découper la requête Overpass en six lots thématiques.** Une requête unique
sur toute la bbox tombait systématiquement en `504`/timeout sur les trois miroirs. Les lots
(bâtiments, voirie, eau, paysage, ouvrages, points) passent en quelques secondes chacun et
sont fusionnés par `jq`. Chaque lot est caché séparément : un échec partiel ne fait pas
tout recommencer.

**Décision : aller chercher un vrai MNT.** La consigne ne le demandait pas, mais
Montfaucon est un bourg **perché** (59 m) au-dessus de la Moine (31 m) tandis que Montigné
est sur un plateau à 82 m : sur un sol plat, la commune perd tout son sens. J'ai maillé
97 × 97 points (≈ 37 m) via OpenTopoData, en respectant sa limite de 100 points par appel
et ~1 appel/seconde — d'où les ~100 s du tout premier lancement, une seule fois.

**Décision : ne rien retélécharger.** `run.sh` ne refait le réseau que si le cache manque,
et ne reconstruit `scene.json` que si une source ou le préprocesseur est plus récent.
Tu peux travailler hors ligne après le premier lancement.

## 4. Le relief : amplifié depuis le niveau de la mer, puis creusé

**Décision : exagération verticale × 2,15, calée sur le zéro NGF.**

**Pourquoi.** Les altitudes réelles vont de 31 m (la Moine) à 106 m (le plateau de
Montigné) sur 3,6 km de large : 75 m de dénivelé pour 3 600 m, soit une pente moyenne de
2 %. À l'échelle 1:1 la commune s'aplatit à l'écran — on ne voit plus que Montfaucon est un
bourg perché. En amplifiant, la vallée redevient une vallée et le promontoire un
promontoire : 164 m de dénivelé apparent, 4,6 % de pente moyenne.

**Pourquoi depuis la mer et pas depuis un minimum local.** L'amplification est un simple
`altitude × 2,15` à partir de **0 m NGF**. Une altitude deux fois plus haute reste deux fois
plus haute ; la hiérarchie entre le fond de vallée, les coteaux et les plateaux est
préservée exactement. Si j'avais amplifié à partir du point bas de l'emprise, le résultat
aurait dépendu du cadrage — changer la bbox aurait changé le relief.

**Ce qui n'est PAS amplifié.** Tout le bâti et les ouvrages restent à l'échelle 1:1 : une
maison fait 6 m, le tablier du pont est à 4,30 m au-dessus de l'eau, la tour de la motte
fait 12 m. C'est la convention des maquettes de relief : on exagère le terrain, pas ce
qu'on pose dessus. Seules les profondeurs du lit suivent le terrain, sinon la rivière
disparaîtrait dans son propre creux.

**L'altitude réelle reste lisible.** La mini-carte affiche en permanence l'altitude NGF du
point visé (`altitude affichée = y / 2,15`), et les **courbes de niveau** optionnelles sont
tracées sur l'altitude réelle : équidistance 5 m, courbe maîtresse tous les 25 m.

Le MNT est ensuite ré-échantillonné en **193 × 193** (≈ 19 m) puis retravaillé :

1. **Creusement de la vallée.** EU-DEM à 25 m ne « voit » pas un lit de 10 m de large : la
   Moine s'y retrouvait à flanc de coteau. Je reconstruis donc un profil de lit strictement
   descendant vers l'aval (minimum courant + lissage), puis j'abaisse le terrain dans un
   couloir de 95 m autour de l'axe — **uniquement vers le bas, jamais vers le haut**, pour
   ne pas inventer de relief.
2. **Le fil de l'eau** est calé à 0,55 m sous ce profil ; le fond du lit à 1,70 m dessous.
   La rivière descend donc réellement d'amont en aval, sans marche ni retenue.
3. **Aucun autre aplanissement.** J'avais d'abord aplani le pré de la foire : ça relevait le
   fond de vallée et **barrait la Moine**. Supprimé. Les manèges et les tréteaux se posent
   sur le pré tel qu'il est, chacun à l'altitude du sol sous lui.

## 4 bis. Les textures : tout au pixel, rien de plaqué

Le sol était d'abord un aplat teinté par sommet sur une grille de 19 m — donc lisse et
répétitif. Il est maintenant peint dans le fragment shader, à partir de la position réelle
dans le monde.

- **Le parcellaire de bocage est fabriqué.** OpenStreetMap ne cadastre que **66 parcelles**
  sur les 12 km² de l'emprise : partout ailleurs, le sol était d'un vert uniforme. Un
  diagramme de **Voronoï** de 105 m de maille fabrique donc un parcellaire plausible sur le
  reste. Chaque cellule tire son propre ton (semis, regain, fauche, chaume), sa propre
  **orientation de labour**, et reçoit une lisière assombrie : c'est l'ombre des haies, la
  trame même du bocage des Mauges.
- **Les vraies parcelles gardent leur vraie orientation.** Pour les 66 parcelles OSM, le
  sens des sillons vient du **rectangle d'aire minimale** de la parcelle, calculé au
  préprocesseur : les labours suivent le grand côté du champ, comme un tracteur.
- **Chaque famille a son motif** : sillons et passages de roue sur les labours, touffes et
  andains sur les prairies, moutonnement des houppiers sous les bois, rangs serrés dans la
  vigne et les vergers, cours et jardins autour du bâti.
- **Fondu anti-moiré.** Les motifs fins s'effacent (`fwidth`) dès qu'un pixel couvre plus
  d'une période : sans ça, les sillons scintillent à l'horizon.
- **Micro-relief.** Le sol, les façades et les ardoises ont maintenant une **carte de
  normales** générée depuis un champ de hauteurs : mottes et cailloux au sol, encadrements
  en saillie et volets épais sur les façades, recouvrement de chaque rang d'ardoises sur les
  toits. C'est ce qui fait accrocher la lumière rasante.

Tout reste **procédural** : rien n'est téléchargé, tout est recalculé au chargement, et
l'ensemble tient à **60 fps** (≈ 730 k triangles, 508 appels de dessin).

## 5. Les bâtiments

- **2 607 emprises OSM extrudées.** Hauteur depuis `building:levels` quand il existe,
  sinon déduite du type et de la surface (annexe 2,5 m · maison 3,3–8 m · grange 4,8–6,2 m ·
  chapelle 7 m · église 12,5 m).
- **Toiture d'après le rectangle d'aire minimale** (rotating calipers sur l'enveloppe
  convexe) : deux pentes si l'emprise est franchement rectangulaire (> 78 %), croupe basse
  si elle l'est moyennement, terrasse sinon. Un débord de 42 cm, comme dans l'Anjou.
- **Teintes crème chaud** (ta demande) : `#f1e7d0`…`#f5eeda` pour la pierre de taille du
  centre-bourg, `#f7f2e5`…`#f9f4ea` pour les enduits des faubourgs, un cran plus patiné pour
  les granges. Le « centre-bourg » est défini comme un disque de 330 m autour de l'église
  Saint-Jacques et 260 m autour de l'église Saint-Martin.
- **Toits : l'ardoise domine** (94 % au centre, 83 % ailleurs), la tuile reste minoritaire
  et désaturée — c'est l'Anjou, pas le Midi.
- **Façades texturées à l'échelle réelle** : une travée = 3,20 m, un niveau = 2,95 m.
  Encadrements de pierre, croisillons, **volets battants**, appuis. La même texture sert de
  carte d'émission la nuit, avec seulement ~42 % des fenêtres allumées, et un décalage de
  tuile propre à chaque bâtiment pour qu'aucune rue ne se répète.
- **Le sens des faces a dû être inversé** : les contours OSM tournent dans le sens horaire
  vu du ciel, ce qui produisait des normales vers l'intérieur et des bâtiments invisibles.

## 6. Les cinq repères, modelés à la main

| Repère | Ce que j'en ai fait | Ancrage |
|---|---|---|
| **Pont de Moine** | Pont à **trois arches** de granit, avant-becs triangulaires, bandeau et parapets. | Le tablier OSM de la rue Louis Monnier (way 97416477), relevé à 4,3 m au-dessus du fil de l'eau. |
| **Moulins de Montigné** | Deux moulins à eau sur les deux rives, **roues à aubes qui tournent**, coursier, quai, et une **chaussée** en travers de la rivière. | Au droit de la rue des Vieux Moulins, sur l'axe réel de la Moine, à 13 m du lit. |
| **Motte féodale** | Tertre tronconique de 9,5 m, fossé, **palissade de 34 pieux**, tour de bois à hourd et rampe d'accès. | Le nœud OSM `Motte Féodale` (4011553256), recalé de 7 m pour le dégagement ; le rayon s'adapte au bâti voisin (24 m ici). |
| **Chapelle Saint-Jean** | L'emprise OSM réelle, coiffée d'un **clocher-mur** ajouré avec sa cloche et sa croix. | Way 98496442, au Bois Buteau. |
| **Foire de la Saint-Maurice** | Fête foraine : **manège** à 8 chevaux de bois qui tourne, **grande roue** à 12 nacelles, 18 tréteaux à bâches rayées, guirlandes entre 9 mâts, et 120 personnes qui déambulent. | **Aire de la Prée Saint-Maurice**, en aval immédiat du pont de Moine (ta précision) : 94 m du pont, 62 m du lit, 2 m au-dessus de l'eau. |

J'ai ajouté en prime les **clochers de Saint-Jacques et Saint-Martin** (flèches d'ardoise
octogonales, abat-sons, croix) — ce sont eux les « beffrois illuminés » de la nuit, avec
deux projecteurs au pied et une légère émission sur la pierre.

## 7. Les barques

**Décision.** **8 barques**, sur un circuit **fermé** de 1,9 km : elles remontent le long
d'une rive et redescendent par l'autre, sans jamais faire demi-tour.

**Pourquoi.** J'avais d'abord lâché 5 barques sur les 8,5 km de Moine traversant l'emprise :
on n'en croisait jamais. Le circuit est maintenant borné à **la traversée du bourg**, des
moulins au pont, plus 350 m de marge. Coque à fond plat extrudée d'un profil en amande,
batelier à la perche, sillage, roulis et tangage. **Allure ≈ 2 m/s** — j'étais parti à
11 m/s, ce qui donnait des hors-bord.

## 8. La lumière et l'heure

- **Course du soleil vraie** pour la latitude 47,09 N au **22 septembre** — le jour de la
  Saint-Maurice, justement. Lever ~6 h 15, coucher ~18 h 15, culmination à 42°.
- **Ciel en shader** : dégradé horizon/zénith interpolé sur huit paliers de hauteur solaire,
  plus le halo et le disque. Le brouillard, la lune, les étoiles et l'exposition suivent.
- **Nuit** : fenêtres allumées, réverbères (halos additifs plutôt que des centaines de
  vraies lumières, pour tenir le budget), clochers illuminés, foire éclairée.
- **Carte d'environnement** régénérée depuis le ciel lui-même (PMREM) : c'est elle qui donne
  son éclat à l'eau et aux ardoises. Régénérée seulement quand le soleil bouge de 1,4°.
- **Ombres** : carte 4096², **emprise adaptative** (150 → 900 m selon l'éloignement de la
  caméra), près/loin recalculés avec. Le terrain **ne projette pas** d'ombre : à cette
  résolution il ne produisait que de l'acné qui noircissait toute la scène.

## 9. La pluie

**Décision.** Rideau de **9 000 traits** en `LineSegments` animés dans un shader, boîte de
340 × 170 × 340 m qui suit la caméra, léger fil de vent.

**Pourquoi pas un système de particules classique.** À cette densité, un `Points` coûte plus
cher et rend mal les traînées ; les segments donnent directement la « pluie fine » qu'on
voulait. La pluie assombrit et désature le ciel, éteint le soleil de 86 %, épaissit la
brume — et **mouille les matériaux** : la pierre, l'enrobé et l'ardoise voient leur rugosité
baisser, donc ils luisent.

## 10. La navigation (revue après ton retour)

- **Molette = zoom vers le curseur** (`zoomToCursor`) : on va vers ce qu'on regarde.
- **Double-clic** sur le décor : vol vers ce point précis (lancer de rayon sur le sol et le
  bâti), en gardant l'orientation, à mi-distance.
- **Mini-carte** en bas à gauche : plan du bourg (bâti, routes, la Moine, les bois), cône de
  vue en direct, repères cliquables — **un clic n'importe où et on s'y rend**.
- **Clavier** : flèches / ZQSD / WASD en déplacement continu, vitesse proportionnelle à
  l'altitude, `Maj` pour accélérer, `+` / `−` pour le zoom.
- **Boutons de repère** avec vol amorti (interpolation sphérique, chemin d'azimut le plus
  court) et fiche explicative.
- **Altitude NGF** du point visé affichée en continu sous la mini-carte, et **courbes de
  niveau** en option : on garde la mesure malgré l'exagération du relief.
- La cible reste dans l'emprise et la caméra ne passe jamais sous le sol.

## 11. Choix techniques assumés

- **Aucune dépendance à installer.** `three.js 0.169` et `OrbitControls` sont **vendorés**
  dans `vendor/`, chargés par `importmap`. Pas de `npm install`, pas de bundler : le projet
  se lance avec Node seul.
- **Toutes les textures sont procédurales** (façades, ardoise, sol, normales de l'eau,
  bâches rayées, halos) : rien à télécharger, rendu identique partout, et on peut les régler
  dans le code plutôt que dans Photoshop.
- **Le gros du calcul est fait hors ligne** (`scripts/build-scene.mjs`) : projection,
  relief, classement, teintes, ombres portées du bocage. Le navigateur ne fait que
  construire les maillages.
- **Fusion agressive des géométries** : les 2 607 bâtiments tiennent en 3 maillages, les
  391 tronçons de voirie en 1, les 13 747 arbres en 3 `InstancedMesh`. ~730 k triangles.
- **Serveur statique maison** (`scripts/serve.mjs`) : 40 lignes, aucune dépendance, sert
  strictement le dossier du projet (normalisation de chemin, pas de traversée), types MIME
  corrects pour les modules ES. Écoute sur **127.0.0.1** et non `0.0.0.0` : c'est une carte
  locale, elle n'a pas à être exposée au réseau.
- **`globalThis.MM`** est laissé exposé dans la console (scène, caméra, données, `volerVers`) :
  c'est une maquette, autant pouvoir la triturer.
- **Pas d'importmap.** J'avais d'abord déclaré `three` via une `<script type="importmap">`.
  C'est un script **inline**, donc incompatible avec un `Content-Security-Policy` en
  `script-src 'self'` — et je ne voulais ni `'unsafe-inline'` ni un hash à maintenir à la
  main. Tout passe maintenant par `src/lib/three.js`, qui ré-exporte le module vendoré ;
  la page n'a plus un seul script inline, et fonctionne aussi dans les navigateurs sans
  support des importmaps.

## 13. Le déploiement

**Décision : image en deux étapes, Node pour construire, nginx pour servir.**

**Pourquoi pas servir avec `scripts/serve.mjs`.** Il fait très bien le travail en local
(40 lignes, zéro dépendance) mais il ne compresse pas. `scene.json` pèse 1,7 Mo ; gzippé
par nginx il tombe à **565 Ko**. nginx apporte aussi les en-têtes de cache différenciés
(`vendor/` 30 jours, `src/` et `data/` 1 heure, `index.html` jamais) et un CSP strict.

**Décision : versionner les caches OSM et MNT, pas la scène.**
`data/montfaucon-montigne.osm.json` (4,8 Mo) et `data/elevation.json` sont la matière
première, coûteuse à retélécharger et susceptible de devenir indisponible ; ils sont dans
le dépôt. `data/scene.json` en est dérivé : il est reconstruit à chaque `docker build`
(1,6 s) et ignoré par git — comme ça il ne peut jamais diverger du préprocesseur.
Conséquence agréable : **la construction de l'image ne touche pas au réseau**.

**Décision : réseau `dokploy-network` externe, pas de `ports:`.** Dokploy route par
Traefik ; publier un port sur l'hôte court-circuiterait le reverse proxy et le TLS. Le
conteneur se contente d'`expose: 80`, et `docker-compose.local.yml` existe pour les
essais hors Dokploy.

**Sécurité de l'image.** nginx sans modules superflus, `server_tokens off`, `nosniff`,
`X-Frame-Options`, `Referrer-Policy`, et un CSP qui n'autorise que l'origine elle-même —
la page ne fait aucune requête sortante une fois chargée. Un `/healthz` sert de sonde.

## 12. Ce que je n'ai pas fait

- **Pas de textures satellite ni de photos** : le parti pris est un rendu dessiné, cohérent
  à toute heure, et sans dépendance à un fournisseur de tuiles.
- **Pas de LOD ni de culling par tuile** : à 730 k triangles et ~500 appels de dessin, ça ne
  se justifiait pas. Ce serait le premier chantier si on doublait l'emprise.
- **Pas d'intérieurs, pas de personnages détaillés** hors foire.
- **La foire est une mise en scène**, pas un relevé : la fête foraine réelle n'est pas dans
  OpenStreetMap. L'emplacement, lui, est celui que tu m'as donné.

---

*Données © les contributeurs OpenStreetMap (ODbL) · relief EU-DEM / Copernicus via OpenTopoData.*
