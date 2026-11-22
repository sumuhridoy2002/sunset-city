import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  IcosahedronGeometry,
  LinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { PALETTE } from '../config.js';

const FACADE_STYLES = [
  { wall: '#5c6f7c', wallShade: '#425461', frame: '#283540', glass: '#8fb7c8', lit: '#ffd79a', brick: false, metalness: 0.34, roughness: 0.4 },
  { wall: '#b09a80', wallShade: '#8d7962', frame: '#4b4034', glass: '#817b6f', lit: '#f8c382', brick: true, metalness: 0.05, roughness: 0.84 },
  { wall: '#8b8d8c', wallShade: '#6e706f', frame: '#3b3d3d', glass: '#697e88', lit: '#ffcc8f', brick: false, metalness: 0.12, roughness: 0.76 },
  { wall: '#8c5948', wallShade: '#6b4336', frame: '#3a2a23', glass: '#6d7276', lit: '#ffbf7a', brick: true, metalness: 0.04, roughness: 0.9 },
  { wall: '#3b4148', wallShade: '#2a3036', frame: '#171b1f', glass: '#516b78', lit: '#ffd39a', brick: false, metalness: 0.28, roughness: 0.52 },
];

function makeSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(width, height) {
  if (typeof document === 'undefined') {
    throw new Error('Canvas 2D is unavailable; procedural textures could not be generated.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire a 2D canvas context for procedural textures.');
  return { canvas, ctx };
}

function addNoise(ctx, width, height, rng, { alpha = 0.08, light = '#ffffff', dark = '#000000', count = 2400 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const size = 1 + rng() * 2.4;
    ctx.globalAlpha = alpha * (0.4 + rng());
    ctx.fillStyle = rng() > 0.5 ? light : dark;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawAsphalt(ctx, width, height) {
  const rng = makeSeededRandom(81);
  ctx.fillStyle = '#2b2c30';
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 44; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const r = 22 + rng() * 90;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rng() > 0.5 ? 'rgba(70,71,76,0.16)' : 'rgba(13,14,17,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  addNoise(ctx, width, height, rng, { count: 9000, alpha: 0.1 });

  ctx.strokeStyle = 'rgba(18,19,22,0.34)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    let x = rng() * width;
    let y = rng() * height;
    ctx.moveTo(x, y);
    for (let step = 0; step < 5; step += 1) {
      x += (rng() - 0.5) * 60;
      y += rng() * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawPavement(ctx, width, height) {
  const rng = makeSeededRandom(29);
  ctx.fillStyle = '#a7a398';
  ctx.fillRect(0, 0, width, height);
  addNoise(ctx, width, height, rng, { count: 7500, alpha: 0.12, light: '#efe9da', dark: '#4a473f' });

  const cell = width / 4;
  ctx.strokeStyle = 'rgba(74, 71, 64, 0.36)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(width, i * cell);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(60, 57, 51, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 26, y + (rng() - 0.5) * 26);
    ctx.stroke();
  }
}

function drawPath(ctx, width, height) {
  const rng = makeSeededRandom(117);
  ctx.fillStyle = '#b2a58f';
  ctx.fillRect(0, 0, width, height);
  addNoise(ctx, width, height, rng, { count: 6000, alpha: 0.1, light: '#f1e5cf', dark: '#574d3f' });

  const cell = width / 2;
  ctx.strokeStyle = 'rgba(86, 74, 57, 0.34)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(width, i * cell);
    ctx.stroke();
  }
}

function drawGrass(ctx, width, height) {
  const rng = makeSeededRandom(203);
  ctx.fillStyle = '#526c3d';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 5200; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const length = 2 + rng() * 7;
    const tone = rng();
    ctx.strokeStyle =
      tone > 0.72 ? 'rgba(126,151,83,0.48)' : tone > 0.38 ? 'rgba(68,94,47,0.55)' : 'rgba(39,60,31,0.45)';
    ctx.lineWidth = 0.8 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 4, y - length);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const r = 16 + rng() * 70;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rng() > 0.5 ? 'rgba(146,158,100,0.1)' : 'rgba(26,44,25,0.14)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function drawFacade(ctx, width, height, styleIndex) {
  const style = FACADE_STYLES[styleIndex % FACADE_STYLES.length];
  const rng = makeSeededRandom(1000 + styleIndex * 91);
  ctx.fillStyle = style.wall;
  ctx.fillRect(0, 0, width, height);

  addNoise(ctx, width, height, rng, {
    count: 2600,
    alpha: 0.08,
    light: style.wallShade,
    dark: '#1c1d20',
  });

  if (style.brick) {
    const brickH = 8;
    const brickW = 22;
    ctx.strokeStyle = 'rgba(45, 34, 27, 0.2)';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += brickH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      const offset = (Math.floor(y / brickH) % 2) * (brickW / 2);
      for (let x = offset; x < width; x += brickW) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + brickH);
        ctx.stroke();
      }
    }
  }

  const cols = 4;
  const rows = 4;
  const cellW = width / cols;
  const cellH = height / rows;
  const marginX = cellW * 0.19;
  const marginY = cellH * 0.21;
  const winW = cellW - marginX * 2;
  const winH = cellH - marginY * 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellW + marginX;
      const y = row * cellH + marginY;
      const lit = rng() > 0.78;

      ctx.fillStyle = 'rgba(20, 23, 27, 0.3)';
      ctx.fillRect(x + 3, y + 4, winW, winH);

      ctx.fillStyle = style.frame;
      ctx.fillRect(x, y, winW, winH);

      const inset = 3;
      const grad = ctx.createLinearGradient(x, y, x + winW, y + winH);
      if (lit) {
        grad.addColorStop(0, style.lit);
        grad.addColorStop(1, '#a9763d');
      } else {
        grad.addColorStop(0, style.glass);
        grad.addColorStop(0.55, '#43535c');
        grad.addColorStop(1, '#242c31');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x + inset, y + inset, winW - inset * 2, winH - inset * 2);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.moveTo(x + inset, y + inset);
      ctx.lineTo(x + winW * 0.68, y + inset);
      ctx.lineTo(x + inset, y + winH * 0.7);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = style.frame;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + winW / 2, y + inset);
      ctx.lineTo(x + winW / 2, y + winH - inset);
      ctx.stroke();

      if (winH > 22) {
        ctx.beginPath();
        ctx.moveTo(x + inset, y + winH * 0.56);
        ctx.lineTo(x + winW - inset, y + winH * 0.56);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(18, 20, 23, 0.34)';
      ctx.fillRect(x - 2, y + winH, winW + 4, 3);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fillRect(0, row * cellH, width, 2);
  }

  // Slight grime toward the bottom of each texture tile.
  const grime = ctx.createLinearGradient(0, height * 0.7, 0, height);
  grime.addColorStop(0, 'rgba(20, 20, 20, 0)');
  grime.addColorStop(1, 'rgba(20, 20, 20, 0.12)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, width, height);
}

function drawStorefront(ctx, width, height) {
  const rng = makeSeededRandom(515);
  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#34313a';
  ctx.fillRect(0, 0, width, 18);

  const panels = 3;
  const panelW = width / panels;
  for (let i = 0; i < panels; i += 1) {
    const x = i * panelW + 10;
    const y = 28;
    const w = panelW - 20;
    const h = height - 42;

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, rng() > 0.5 ? '#3a4d50' : '#2b363d');
    grad.addColorStop(0.58, '#1f292f');
    grad.addColorStop(1, '#12181d');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(247, 193, 109, 0.42)';
    ctx.fillRect(x + 12, y + h * 0.44, w - 24, 4);
    ctx.fillStyle = 'rgba(246, 217, 168, 0.14)';
    ctx.fillRect(x + 10, y + 10, w - 20, h - 20);

    ctx.strokeStyle = 'rgba(10, 12, 15, 0.7)';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x + w * 0.18, y + 9, 2, h - 18);
  }
}

function drawSign(ctx, width, height, spec) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(9, 9, width - 18, height - 18);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, width - 36, height - 36);

  ctx.fillStyle = spec.accent;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(30, height - 34, width - 60, 3);
  ctx.globalAlpha = 1;

  ctx.font = '700 58px "Bahnschrift", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = spec.fg;
  ctx.shadowColor = spec.fg;
  ctx.shadowBlur = 12;
  let fontSize = 58;
  while (ctx.measureText(spec.text).width > width - 80 && fontSize > 22) {
    fontSize -= 3;
    ctx.font = `700 ${fontSize}px "Bahnschrift", "Arial Narrow", sans-serif`;
  }
  ctx.fillText(spec.text, width / 2, height / 2 - 4);
  ctx.shadowBlur = 0;
}

/**
 * Scales the 6 face UV sets of a BoxGeometry so world-space material tiling is
 * independent of the object's dimensions. Face order is +X, -X, +Y, -Y, +Z, -Z.
 */
export function scaleBoxUVs(geometry, repeats) {
  const uv = geometry.attributes.uv;
  for (let face = 0; face < 6; face += 1) {
    const [repeatU, repeatV] = repeats[face] || [1, 1];
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      uv.setXY(index, uv.getX(index) * repeatU, uv.getY(index) * repeatV);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

export class WorldMaterials {
  constructor(renderer) {
    this.renderer = renderer;
    this._textures = new Set();
    this._materials = new Set();
    this._geometries = new Set();
    this._signCache = new Map();
    this._build();
  }

  _texture(canvas) {
    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    this._textures.add(texture);
    return texture;
  }

  _mapMaterial(options) {
    const material = new MeshStandardMaterial(options);
    this._materials.add(material);
    return material;
  }

  _basicMaterial(options) {
    const material = new MeshBasicMaterial(options);
    this._materials.add(material);
    return material;
  }

  _geometry(geometry) {
    this._geometries.add(geometry);
    return geometry;
  }

  _build() {
    const asphalt = this._texture(createCanvasTexture(512, 512, drawAsphalt));
    const pavement = this._texture(createCanvasTexture(512, 512, drawPavement));
    const path = this._texture(createCanvasTexture(512, 512, drawPath));
    const grass = this._texture(createCanvasTexture(512, 512, drawGrass));
    const storefront = this._texture(createCanvasTexture(512, 128, drawStorefront));

    this.facadeTexture = FACADE_STYLES.map((_, styleIndex) =>
      this._texture(createCanvasTexture(256, 256, (ctx, width, height) => drawFacade(ctx, width, height, styleIndex))),
    );

    this.materials = {
      asphalt: this._mapMaterial({ map: asphalt, roughness: 0.94, metalness: 0.02, color: 0xffffff }),
      sidewalk: this._mapMaterial({ map: pavement, roughness: 0.9, metalness: 0.02, color: 0xffffff }),
      curb: this._mapMaterial({ color: 0x6e6b63, roughness: 0.9 }),
      path: this._mapMaterial({ map: path, roughness: 0.92, metalness: 0.01 }),
      grass: this._mapMaterial({ map: grass, roughness: 1, metalness: 0 }),
      roadLine: this._mapMaterial({ color: 0xeee4ca, roughness: 0.74 }),
      laneLine: this._mapMaterial({ color: 0xd6ac50, roughness: 0.72 }),
      crosswalk: this._mapMaterial({ color: 0xe8e1d2, roughness: 0.76 }),
      roof: this._mapMaterial({ color: PALETTE.roof, roughness: 0.96 }),
      roofSlab: this._mapMaterial({ color: 0x46474a, roughness: 0.92 }),
      roofDetail: this._mapMaterial({ color: 0x65666a, roughness: 0.82, metalness: 0.12 }),
      metal: this._mapMaterial({ color: 0x3b3e42, roughness: 0.46, metalness: 0.7 }),
      metalDark: this._mapMaterial({ color: 0x25282c, roughness: 0.55, metalness: 0.62 }),
      glassDark: this._mapMaterial({
        color: 0x26343b,
        roughness: 0.18,
        metalness: 0.68,
        transparent: true,
        opacity: 0.86,
      }),
      lamp: this._mapMaterial({
        color: 0xfff2d0,
        emissive: 0xffcf86,
        emissiveIntensity: 3,
        roughness: 0.32,
        toneMapped: false,
      }),
      treeTrunk: this._mapMaterial({ color: 0x5b4632, roughness: 0.97 }),
      foliage: this._mapMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }),
      water: this._mapMaterial({
        color: 0x2f6771,
        roughness: 0.08,
        metalness: 0.5,
        transparent: true,
        opacity: 0.86,
      }),
      statue: this._mapMaterial({ color: 0x77766e, roughness: 0.48, metalness: 0.6 }),
      ac: this._mapMaterial({ color: 0x8e8f8c, roughness: 0.66, metalness: 0.35 }),
      wood: this._mapMaterial({ color: 0x7a583d, roughness: 0.84 }),
      hedge: this._mapMaterial({ color: 0x3d5b33, roughness: 1 }),
      tactile: this._mapMaterial({ color: 0xb59f6a, roughness: 0.95 }),
      dropZone: this._mapMaterial({ color: 0x746238, roughness: 0.94, metalness: 0.02 }),
      containerTeal: this._mapMaterial({ color: 0x356f76, roughness: 0.72, metalness: 0.3 }),
      containerRust: this._mapMaterial({ color: 0x8a4b38, roughness: 0.8, metalness: 0.22 }),
      awning: [0x9b3c36, 0x3f6d5d, 0x3b4c72, 0xa87835].map((color) =>
        this._mapMaterial({ color, roughness: 0.82 }),
      ),
      facade: FACADE_STYLES.map((style, index) =>
        this._mapMaterial({
          map: this.facadeTexture[index],
          roughness: style.roughness,
          metalness: style.metalness,
          envMapIntensity: 0.9,
        }),
      ),
      storefront: this._mapMaterial({
        map: storefront,
        roughness: 0.42,
        metalness: 0.22,
        emissive: 0x1a1208,
        emissiveIntensity: 0.55,
      }),
    };

    this.geometries = {
      pole: this._geometry(new CylinderGeometry(0.06, 0.09, 5.4, 6)),
      arm: this._geometry(new BoxGeometry(1.7, 0.08, 0.08)),
      lampHead: this._geometry(new BoxGeometry(0.5, 0.16, 0.26)),
      acUnit: this._geometry(new BoxGeometry(1.25, 0.65, 1.0)),
      antenna: this._geometry(new CylinderGeometry(0.035, 0.06, 3.4, 5)),
      treeTrunk: this._geometry(new CylinderGeometry(0.16, 0.25, 2.5, 6)),
      treeLeaf: this._geometry(new IcosahedronGeometry(1, 0)),
      benchSeat: this._geometry(new BoxGeometry(1.7, 0.09, 0.52)),
      benchBack: this._geometry(new BoxGeometry(1.7, 0.46, 0.08)),
      benchLeg: this._geometry(new BoxGeometry(0.08, 0.42, 0.46)),
      unitBox: this._geometry(new BoxGeometry(1, 1, 1)),
    };
  }

  /** Returns a cached neon-style shop sign material. */
  getSignMaterial(sign) {
    const key = `${sign.text}|${sign.bg}|${sign.fg}|${sign.accent}`;
    if (this._signCache.has(key)) return this._signCache.get(key);

    const texture = this._texture(
      createCanvasTexture(512, 128, (ctx, width, height) => drawSign(ctx, width, height, sign)),
    );
    const material = this._basicMaterial({
      map: texture,
      toneMapped: false,
      transparent: false,
    });
    this._signCache.set(key, material);
    return material;
  }

  /** Box geometry whose facade UVs tile by physical size. */
  createBuildingBox(width, height, depth) {
    const geometry = new BoxGeometry(width, height, depth);
    scaleBoxUVs(geometry, [
      [depth / 10, height / 12],
      [depth / 10, height / 12],
      [1, 1],
      [1, 1],
      [width / 10, height / 12],
      [width / 10, height / 12],
    ]);
    return this._geometry(geometry);
  }

  /** Box geometry for storefronts, pavement platforms, containers, etc. */
  createBox(width, height, depth, repeats = null) {
    const geometry = new BoxGeometry(width, height, depth);
    if (repeats) scaleBoxUVs(geometry, repeats);
    return this._geometry(geometry);
  }

  createPlane(width, height, repeatX = 1, repeatY = 1) {
    const geometry = new PlaneGeometry(width, height);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    }
    uv.needsUpdate = true;
    return this._geometry(geometry);
  }

  dispose() {
    for (const texture of this._textures) texture.dispose();
    for (const material of this._materials) material.dispose();
    for (const geometry of this._geometries) geometry.dispose();
    this._textures.clear();
    this._materials.clear();
    this._geometries.clear();
    this._signCache.clear();
  }
}

function createCanvasTexture(width, height, draw) {
  const { canvas, ctx } = createCanvas(width, height);
  draw(ctx, width, height);
  return canvas;
}


