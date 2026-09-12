// Mini-carte : un plan du bourg pour se repérer et se déplacer d'un clic.
// Le fond est dessiné une fois ; seul le curseur de caméra est redessiné.
export function creerMiniCarte(canvas, data, { surClic }) {
  const W = data.meta.world.w, H = data.meta.world.h;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const L = canvas.clientWidth, Ht = canvas.clientHeight;
  canvas.width = L * dpr;
  canvas.height = Ht * dpr;

  const ech = Math.min(L / W, Ht / H);
  const ox = L / 2, oz = Ht / 2;
  const px = (x) => ox + x * ech;
  const pz = (z) => oz + z * ech;
  const monde = (cx, cz) => [(cx - ox) / ech, (cz - oz) / ech];

  /* ---------------------------------------------------------- fond ---- */
  const fond = document.createElement('canvas');
  fond.width = canvas.width;
  fond.height = canvas.height;
  const f = fond.getContext('2d');
  f.scale(dpr, dpr);

  f.fillStyle = '#27291f';
  f.fillRect(0, 0, L, Ht);

  // bois et prairies
  for (const zone of data.land) {
    const vert = { forest: '#38492f', scrub: '#414d33', meadow: '#333e28', grass: '#333e28', vineyard: '#3d4429', orchard: '#39462c', farmland: '#3a3a29' }[zone.k];
    if (!vert) continue;
    f.fillStyle = vert;
    f.beginPath();
    zone.r.forEach(([x, z], i) => (i ? f.lineTo(px(x), pz(z)) : f.moveTo(px(x), pz(z))));
    f.closePath();
    f.fill();
  }

  // bâti : la tache des bourgs
  f.fillStyle = 'rgba(233, 220, 190, .78)';
  for (const b of data.buildings) {
    let x = 0, z = 0;
    for (const p of b.r) { x += p[0]; z += p[1]; }
    f.fillRect(px(x / b.r.length) - 0.7, pz(z / b.r.length) - 0.7, 1.5, 1.5);
  }

  // routes principales
  f.strokeStyle = 'rgba(208, 190, 152, .62)';
  f.lineWidth = 0.8;
  f.beginPath();
  for (const r of data.roads) {
    if (!['secondary', 'tertiary', 'primary', 'unclassified'].includes(r.k)) continue;
    r.p.forEach(([x, z], i) => (i ? f.lineTo(px(x), pz(z)) : f.moveTo(px(x), pz(z))));
  }
  f.stroke();

  // la Moine
  f.fillStyle = '#4a86a0';
  for (const p of data.water) {
    f.beginPath();
    p.r.forEach(([x, z], i) => (i ? f.lineTo(px(x), pz(z)) : f.moveTo(px(x), pz(z))));
    f.closePath();
    f.fill();
  }
  f.strokeStyle = '#5b9ab6';
  f.lineWidth = 1.6;
  f.beginPath();
  data.river.pts.forEach(([x, z], i) => (i ? f.lineTo(px(x), pz(z)) : f.moveTo(px(x), pz(z))));
  f.stroke();

  // cadre
  f.strokeStyle = 'rgba(240, 228, 202, .22)';
  f.lineWidth = 1;
  f.strokeRect(0.5, 0.5, L - 1, Ht - 1);

  /* --------------------------------------------------------- repères ---- */
  const reperes = data.landmarks.map((l) => ({ ...l, cx: px(l.x), cz: pz(l.z) }));

  /* ------------------------------------------------------- interaction ---- */
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  let survol = null;

  const local = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  canvas.addEventListener('pointermove', (ev) => {
    const [cx, cz] = local(ev);
    survol = reperes.find((p) => Math.hypot(p.cx - cx, p.cz - cz) < 9) || null;
    canvas.style.cursor = survol ? 'pointer' : 'crosshair';
    canvas.title = survol ? survol.name : '';
  });
  canvas.addEventListener('pointerleave', () => { survol = null; canvas.title = ''; });
  canvas.addEventListener('click', (ev) => {
    const [cx, cz] = local(ev);
    const rep = reperes.find((p) => Math.hypot(p.cx - cx, p.cz - cz) < 9);
    if (rep) { surClic({ x: rep.x, z: rep.z, repere: rep }); return; }
    const [x, z] = monde(cx, cz);
    surClic({ x, z });
  });

  return {
    /** @param {{x:number,z:number}} cam @param {{x:number,z:number}} cible @param {number} fov */
    dessiner(cam, cible, capMonde, ouverture) {
      ctx.clearRect(0, 0, L, Ht);
      ctx.drawImage(fond, 0, 0, L, Ht);

      // cône de vue
      const cxp = px(cam.x), czp = pz(cam.z);
      const portee = Math.min(Math.max(Math.hypot(cam.x - cible.x, cam.z - cible.z) * ech * 2.6, 22), 260);
      ctx.beginPath();
      ctx.moveTo(cxp, czp);
      ctx.arc(cxp, czp, portee, capMonde - ouverture / 2, capMonde + ouverture / 2);
      ctx.closePath();
      const g = ctx.createRadialGradient(cxp, czp, 0, cxp, czp, portee);
      g.addColorStop(0, 'rgba(240, 208, 140, .38)');
      g.addColorStop(1, 'rgba(240, 208, 140, 0)');
      ctx.fillStyle = g;
      ctx.fill();

      // repères
      for (const p of reperes) {
        const vedette = survol === p;
        ctx.beginPath();
        ctx.arc(p.cx, p.cz, vedette ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = vedette ? '#ffd98e' : '#d8a24e';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(20,16,10,.75)';
        ctx.stroke();
      }

      // cible de la caméra
      ctx.beginPath();
      ctx.arc(px(cible.x), pz(cible.z), 3.2, 0, Math.PI * 2);
      ctx.strokeStyle = '#f6ecd6';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // position de la caméra
      ctx.beginPath();
      ctx.arc(cxp, czp, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#f6ecd6';
      ctx.fill();

      if (survol) {
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
        const t = survol.name;
        const w = ctx.measureText(t).width + 8;
        const bx = Math.min(Math.max(survol.cx - w / 2, 2), L - w - 2);
        const by = survol.cz > 24 ? survol.cz - 17 : survol.cz + 8;
        ctx.fillStyle = 'rgba(18,14,10,.86)';
        ctx.fillRect(bx, by, w, 14);
        ctx.fillStyle = '#f6ead2';
        ctx.fillText(t, bx + 4, by + 10.5);
      }
    },
  };
}
