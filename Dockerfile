# syntax=docker/dockerfile:1

# ─── 1. Préparation de la scène ────────────────────────────────────────────
# Les caches OpenStreetMap et MNT sont versionnés : la construction est donc
# hors-ligne, déterministe, et ne dépend ni d'Overpass ni d'OpenTopoData.
FROM node:22-alpine AS scene
WORKDIR /build
COPY scripts ./scripts
COPY data/montfaucon-montigne.osm.json data/elevation.json ./data/
RUN node scripts/build-scene.mjs

# ─── 2. Service statique ───────────────────────────────────────────────────
FROM nginx:1.27-alpine AS web
LABEL org.opencontainers.image.title="Montfaucon-Montigné en 3D"
LABEL org.opencontainers.image.description="Carte 3D de Montfaucon-Montigné (49230) — données OpenStreetMap (ODbL) et relief EU-DEM"
LABEL org.opencontainers.image.source="https://github.com/CaptainFloax/montfaucon-3D"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY index.html ./
COPY src ./src
COPY vendor ./vendor
COPY --from=scene /build/data/scene.json ./data/scene.json

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/index.html || exit 1
