/**
 * Data-only description of the city. The renderer (City.js), minimap and mission
 * system all read from this module so visuals and gameplay never drift apart.
 *
 * Layout math:
 *   - 3 x 3 blocks, 36 m each, separated by 12 m roads.
 *   - Block centres at -48 / 0 / 48; roads at -24 / 24 and the outer ring at ±72.
 *   - A raised sidewalk platform covers every block. The central block is a park.
 */

export const CITY = Object.freeze({
  blockSize: 36,
  roadWidth: 12,
  sidewalkWidth: 3.2,
  platformHeight: 0.18,
  centers: Object.freeze([-48, 0, 48]),
  roadCenters: Object.freeze([-72, -24, 24, 72]),
  asphaltExtent: 84,
  outerSidewalkWidth: 6,
  playableExtent: 76,
});

export const PLAYER_SPAWN = Object.freeze({ x: -11.2, z: 20.7, yaw: 0 });
export const VEHICLE_SPAWN = Object.freeze({ x: -5.2, z: 21.1, yaw: Math.PI / 2 });

export const MISSION = Object.freeze({
  contact: Object.freeze({ x: -4.2, z: 8.6, ground: CITY.platformHeight }),
  dropoff: Object.freeze({ x: 72, z: 43, ground: 0 }),
  checkpoints: Object.freeze([
    Object.freeze({ x: 24, z: -52, ground: 0 }),
    Object.freeze({ x: -52, z: -72, ground: 0 }),
    Object.freeze({ x: -72, z: 24, ground: 0 }),
  ]),
  dockContainers: Object.freeze([
    Object.freeze({ x: 81.2, z: 37.5, yaw: 0.06, color: 0x356f76 }),
    Object.freeze({ x: 80.8, z: 49.5, yaw: -0.04, color: 0x8a4b38 }),
  ]),
});

const PARK_TREES = Object.freeze([
  { x: -10.6, z: -10.4, scale: 1.08 },
  { x: 10.8, z: -10.2, scale: 0.95 },
  { x: -10.4, z: 10.7, scale: 0.9 },
  { x: 10.2, z: 10.6, scale: 1.1 },
  { x: -12.1, z: -3.8, scale: 0.82 },
  { x: 12.0, z: 3.2, scale: 0.88 },
  { x: 3.5, z: -12.2, scale: 0.78 },
  { x: -3.8, z: 12.1, scale: 0.86 },
]);

const PARK_BENCHES = Object.freeze([
  { x: 5.2, z: 0, yaw: Math.PI / 2 },
  { x: -5.2, z: 0, yaw: -Math.PI / 2 },
  { x: 0, z: 5.2, yaw: Math.PI },
  { x: 0, z: -5.2, yaw: 0 },
]);

const SIGN_TEXTS = [
  'NOODLE BAR',
  'MOTEL',
  '24/7',
  'PAWN SHOP',
  'ARCADE',
  'DINER',
  'VINYL',
  'TATTOO',
  'LAUNDRY',
  'LIQUOR',
];

const SIGN_COLORS = [
  { bg: '#1a1f26', fg: '#ffcc66', accent: '#e07a45' },
  { bg: '#20141b', fg: '#ff8a9a', accent: '#ff5c77' },
  { bg: '#101d1a', fg: '#8ff0c1', accent: '#55d8a6' },
  { bg: '#1c1a11', fg: '#f4e8c4', accent: '#d8a74d' },
];

const BLOCK_PROFILES = [
  { gx: -1, gz: -1, name: 'WEST END', density: 2 },
  { gx: 0, gz: -1, name: 'NORTH LOOP', density: 2 },
  { gx: 1, gz: -1, name: 'SKYLINE', density: 3, landmark: true },
  { gx: -1, gz: 0, name: 'MARKET', density: 2 },
  { gx: 0, gz: 0, name: 'MEMORIAL PARK', density: 0 },
  { gx: 1, gz: 0, name: 'EASTSIDE', density: 2 },
  { gx: -1, gz: 1, name: 'HARBOR', density: 1 },
  { gx: 0, gz: 1, name: 'GARMENT', density: 2 },
  { gx: 1, gz: 1, name: 'DOCKS', density: 1 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const random = mulberry32(seed);
  return {
    next: random,
    range(min, max) {
      return min + random() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + random() * (max - min + 1));
    },
    chance(probability) {
      return random() < probability;
    },
    pick(items) {
      return items[Math.floor(random() * items.length)];
    },
    shuffle(items) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundTo = (value, step = 0.1) => Math.round(value / step) * step;

function createBuildingSpec(rng, { gx, gz, quadrant, index, profile }) {
  const lotHalf = CITY.blockSize / 2 - CITY.sidewalkWidth - 0.5;
  const width = roundTo(rng.range(9.2, 13.0));
  const depth = roundTo(rng.range(9.2, 13.0));
  const baseX = quadrant.x * rng.range(7.1, 7.8);
  const baseZ = quadrant.z * rng.range(7.1, 7.8);

  const x = clamp(baseX, -lotHalf + width / 2, lotHalf - width / 2);
  const z = clamp(baseZ, -lotHalf + depth / 2, lotHalf - depth / 2);

  let height;
  if (profile.density === 1) height = rng.range(9.5, 17.5);
  else if (profile.density === 2) height = rng.range(14, 27);
  else height = rng.range(18, 36);

  if (profile.landmark && index === 0) {
    height = rng.range(48, 56);
  } else if (profile.density === 2 && rng.chance(0.18)) {
    height += rng.range(5, 10);
  }
  height = roundTo(height, 0.5);

  let type = 'block';
  if (height >= 38) type = 'tower';
  else if (height >= 21) type = 'setback';

  const style = profile.landmark && index === 0 ? 0 : rng.int(0, 4);

  let sign = null;
  if (height < 20 && rng.chance(0.58)) {
    const useXSide = rng.chance(0.5);
    const normal = useXSide
      ? { x: quadrant.x > 0 ? 1 : -1, z: 0 }
      : { x: 0, z: quadrant.z > 0 ? 1 : -1 };
    const palette = rng.pick(SIGN_COLORS);
    sign = {
      text: rng.pick(SIGN_TEXTS),
      normal,
      bg: palette.bg,
      fg: palette.fg,
      accent: palette.accent,
      height: rng.range(3.7, 5.2),
      width: rng.range(3.6, 5.4),
    };
  }

  return {
    id: `${gx}:${gz}:${index}`,
    x,
    z,
    width,
    depth,
    height,
    type,
    style,
    sign,
    isLandmark: Boolean(profile.landmark && index === 0),
    rooftopSeed: rng.int(0, 9999),
  };
}

function createBlocks() {
  const blocks = [];
  let seed = 28457;

  for (const profile of BLOCK_PROFILES) {
    const worldX = profile.gx * 48;
    const worldZ = profile.gz * 48;
    seed += 7919;

    if (profile.gx === 0 && profile.gz === 0) {
      blocks.push({
        id: 'park',
        type: 'park',
        gx: 0,
        gz: 0,
        name: 'MEMORIAL PARK',
        center: { x: 0, z: 0 },
        buildings: [],
        trees: PARK_TREES.map((tree) => ({ ...tree })),
        benches: PARK_BENCHES.map((bench) => ({ ...bench })),
      });
      continue;
    }

    const rng = makeRng(seed);
    const count = profile.density === 3 ? 4 : rng.int(2, 4);
    const quadrants = rng.shuffle([
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: 1, z: 1 },
    ]);
    const buildings = [];

    for (let i = 0; i < count; i += 1) {
      const spec = createBuildingSpec(rng, {
        gx: profile.gx,
        gz: profile.gz,
        quadrant: quadrants[i],
        index: i,
        profile,
      });
      buildings.push({ ...spec, x: worldX + spec.x, z: worldZ + spec.z });
    }

    blocks.push({
      id: `${profile.gx}:${profile.gz}`,
      type: 'buildings',
      gx: profile.gx,
      gz: profile.gz,
      name: profile.name,
      center: { x: worldX, z: worldZ },
      buildings,
      trees: [],
      benches: [],
    });
  }

  return blocks;
}

export const BLOCKS = createBlocks();

/** Closest safe point on the road network, used for resets and respawns. */
export function nearestRoadPoint(x, z) {
  let best = null;

  for (const roadX of CITY.roadCenters) {
    const distance = Math.abs(x - roadX);
    if (!best || distance < best.distance) {
      best = {
        distance,
        axis: 'x',
        x: roadX,
        z: clamp(z, -CITY.playableExtent, CITY.playableExtent),
        yaw: z >= 0 ? Math.PI : 0,
      };
    }
  }

  for (const roadZ of CITY.roadCenters) {
    const distance = Math.abs(z - roadZ);
    if (!best || distance < best.distance) {
      best = {
        distance,
        axis: 'z',
        x: clamp(x, -CITY.playableExtent, CITY.playableExtent),
        z: roadZ,
        yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2,
      };
    }
  }

  return best;
}

/** Human-readable neighbourhood for the minimap. */
export function getDistrictName(x, z) {
  if (Math.hypot(x, z) < 19) return 'MEMORIAL PARK';
  if (Math.hypot(x, z) > 83) return 'CITY LIMITS';

  let closest = null;
  for (const block of BLOCKS) {
    if (block.type !== 'buildings') continue;
    const d = (block.center.x - x) ** 2 + (block.center.z - z) ** 2;
    if (!closest || d < closest.d) closest = { d, name: block.name };
  }
  return closest ? closest.name : 'DOWNTOWN';
}

export const CITY_LAYOUT = Object.freeze({
  blocks: BLOCKS,
  spawnPlayer: PLAYER_SPAWN,
  spawnVehicle: VEHICLE_SPAWN,
  mission: MISSION,
});
