# Montfaucon-Montigné en 3D

Carte 3D interactive de **Montfaucon-Montigné (49230)** — la vallée de la Moine, ses deux
bourgs, son pont, ses moulins et sa motte — construite à partir des vraies données
**OpenStreetMap** et du relief **EU-DEM**, rendue avec **three.js**.

Le relief est amplifié **× 2,15 depuis le niveau de la mer** pour que la vallée se lise :
les altitudes réelles restent affichées en mètres NGF, et les courbes de niveau sont
tracées dessus.

## Lancement

```bash
./run.sh
```

Puis <http://localhost:3002>.

Le premier lancement télécharge les données (Overpass + OpenTopoData) et les met en cache
dans `./data` — compter **~2 minutes**, une seule fois. Les suivants sont immédiats.

Prérequis : **Node.js** et **jq**. Aucun `npm install` : three.js est vendoré dans `vendor/`.

## Ce qu'on peut faire

| | |
|---|---|
| **Glisser** | tourner autour du point visé |
| **Molette** | zoomer vers le curseur |
| **Double-clic** | se rendre à l'endroit visé |
| **Clic droit** / **flèches** / **ZQSD** | se déplacer (`Maj` pour accélérer) |
| **Mini-carte** (en bas à gauche) | clic pour s'y rendre ; les pastilles dorées sont les repères ; l'altitude NGF du point visé s'affiche dessous |
| **Curseur d'heure** | de minuit à minuit — aube, midi, crépuscule, nuit avec fenêtres allumées et clochers illuminés |
| **▶ / espace** | faire défiler l'heure tout seul |
| **Courbes de niveau** | équidistance 5 m, maîtresse tous les 25 m, sur l'altitude réelle NGF |
| **Pluie fine** | l'averse des Mauges, et la pierre qui luit |
| **Ronde** | rotation lente automatique |

Les six boutons de repère mènent à la **chapelle Saint-Jean**, au **pont de Moine**, aux
**moulins de Montigné**, à la **motte féodale**, à la **foire de la Saint-Maurice** et aux
deux clochers.

## Déploiement

### Dokploy

Le dépôt contient tout ce qu'il faut : application de type **Compose**, provider
**GitHub**, dépôt `CaptainFloax/montfaucon-3D`, branche `main`, fichier
`docker-compose.yml`. Puis, dans l'onglet **Domains** : service `montfaucon-3d`,
port conteneur **80** — Dokploy pose lui-même les labels Traefik.

Le service est attaché au réseau externe `dokploy-network`, celui que Traefik écoute.

### Ailleurs

```bash
docker compose -f docker-compose.local.yml up --build   # → http://localhost:3002
```

ou, sans Compose :

```bash
docker build -t montfaucon-3d . && docker run --rm -p 3002:80 montfaucon-3d
```

L'image est construite en deux temps : **Node** prépare `data/scene.json` à partir des
caches OSM et MNT versionnés — donc **sans accès réseau**, de façon déterministe — puis
**nginx** sert les fichiers statiques (gzip : `scene.json` passe de 1,7 Mo à 565 Ko,
en-têtes de cache, CSP strict). Image finale : ~80 Mo.

## Organisation

```
run.sh                    une commande : données → scène → serveur
scripts/
  fetch-osm.sh            Overpass, en six lots, mis en cache
  fetch-elevation.mjs     MNT EU-DEM 25 m (OpenTopoData)
  build-scene.mjs         préprocesseur → data/scene.json
  serve.mjs               serveur statique local, sans dépendance
  lib/geo.mjs             projection, rectangle minimal, chaînage de polylignes
src/
  main.js                 assemblage et boucle de rendu
  sky.js                  course du soleil, ciel, lumières, ombres
  weather.js              pluie
  ui.js  minimap.js       panneau de commande, étiquettes, mini-carte
  world/                  terrain, bâtiments, voirie, eau, bocage,
                          repères, foire, barques, réverbères
  lib/                    triangulation, échantillonnage du relief, textures
vendor/                   three.js 0.169 + OrbitControls
data/                     caches OSM et MNT (versionnés) ; scene.json est reconstruit
Dockerfile                Node prépare la scène → nginx la sert
docker/nginx.conf         gzip, cache, CSP
docker-compose.yml        déploiement Dokploy
docker-compose.local.yml  essai en local
```

`DECISIONS.md` détaille tous les choix faits en autonomie et pourquoi.

---

Données © les contributeurs **OpenStreetMap** (ODbL) · relief **EU-DEM / Copernicus** via
OpenTopoData.
