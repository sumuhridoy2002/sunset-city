import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
} from 'three';
import { BLOCKS, CITY, MISSION } from './CityLayout.js';
import { CONFIG, PALETTE } from '../config.js';

const dummy = new Object3D();

/**
 * Builds the static city: roads, sidewalks, buildings, park, street furniture,
 * props and matching Rapier colliders. Everything is procedural and shares
 * geometry/material instances via WorldMaterials.
 */
export class City {
  constructor({ scene, physics, materials }) {
    this.scene = scene;
    this.physics = physics;
    this.materials = materials;
    this.root = new Group();
    this.root.name = 'city';
    this._localGeometries = new Set();
    this._localMaterials = new Set();
    this._effects = [];
    this.streetLights = [];
    this.treeCount = 0;
    this.scene.add(this.root);
  }

  build() {
    this._buildGround();
    this._buildBlocks();
    this._buildOuterSidewalks();
    this._buildRoadMarkings();
    this._buildStreetLights();
    this._buildTrees();
    this._buildPark();
    this._buildDock();
    this._buildDistantSkyline();
    this._buildDistantGreenery();
    return this;
  }

  _track(geometry) {
    this._localGeometries.add(geometry);
    return geometry;
  }

  _localMaterial(options) {
    const material = new MeshStandardMaterial(options);
    this._localMaterials.add(material);
    return material;
  }

  _addMesh(geometry, material, { cast = true, receive = true, position = null } = {}) {
    const mesh = new Mesh(geometry, material);
    if (cast) mesh.castShadow = true;
    if (receive) mesh.receiveShadow = true;
    if (position) mesh.position.set(position.x, position.y, position.z);
    this.root.add(mesh);
    return mesh;
  }

  _addInstanced(geometry, material, matrices, { cast = true, receive = true } = {}) {
    if (matrices.length === 0) return null;
    const mesh = new InstancedMesh(geometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.root.add(mesh);
    return mesh;
  }

  _buildGround() {
    const grass = new Mesh(
      this.materials.createPlane(CONFIG.world.groundSize, CONFIG.world.groundSize, 90, 90),
      this.materials.materials.grass,
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    this.root.add(grass);

    const asphalt = new Mesh(
      this.materials.createPlane(CITY.asphaltExtent, CITY.asphaltExtent, 26, 26),
      this.materials.materials.asphalt,
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = 0.004;
    asphalt.receiveShadow = true;
    this.root.add(asphalt);

    this.physics.addFixedBox(0, -0.5, 0, 320, 0.5, 320, { friction: 0.72 });
  }

  _buildBlocks() {
    const platformH = CITY.platformHeight;
    const size = CITY.blockSize;
    const topRepeat = size / 4;

    for (const block of BLOCKS) {
      const cx = block.center.x;
      const cz = block.center.z;

      const platformGeometry = this.materials.createBox(size, platformH, size, [
        [1, 1],
        [1, 1],
        [topRepeat, topRepeat],
        [1, 1],
        [1, 1],
        [1, 1],
      ]);
      const platform = new Mesh(platformGeometry, [
        this.materials.materials.curb,
        this.materials.materials.curb,
        this.materials.materials.sidewalk,
        this.materials.materials.curb,
        this.materials.materials.curb,
        this.materials.materials.curb,
      ]);
      platform.position.set(cx, platformH / 2, cz);
      platform.receiveShadow = true;
      this.root.add(platform);

      this.physics.addFixedBox(cx, platformH / 2, cz, size / 2, platformH / 2, size / 2, {
        friction: 0.9,
      });

      if (block.type === 'park') continue;

      const lotSize = size - CITY.sidewalkWidth * 2;
      const lot = new Mesh(
        this.materials.createPlane(lotSize, lotSize, 5, 5),
        this.materials.materials.asphalt,
      );
      lot.rotation.x = -Math.PI / 2;
      lot.position.set(cx, platformH + 0.006, cz);
      lot.receiveShadow = true;
      this.root.add(lot);

      for (const building of block.buildings) {
        this._buildBuilding(building);
      }
    }
  }

  _buildOuterSidewalks() {
    const width = CITY.outerSidewalkWidth;
    const half = CITY.asphaltExtent;
    const platformH = CITY.platformHeight;
    const pieces = [
      { x: 0, z: half - width / 2, w: half * 2, d: width },
      { x: 0, z: -half + width / 2, w: half * 2, d: width },
      { x: half - width / 2, z: 0, w: width, d: half * 2 - width * 2 },
      { x: -half + width / 2, z: 0, w: width, d: half * 2 - width * 2 },
    ];

    for (const piece of pieces) {
      const geometry = this.materials.createBox(piece.w, platformH, piece.d, [
        [1, 1],
        [1, 1],
        [piece.w / 4, piece.d / 4],
        [1, 1],
        [1, 1],
        [1, 1],
      ]);
      const mesh = new Mesh(geometry, [
        this.materials.materials.curb,
        this.materials.materials.curb,
        this.materials.materials.sidewalk,
        this.materials.materials.curb,
        this.materials.materials.curb,
        this.materials.materials.curb,
      ]);
      mesh.position.set(piece.x, platformH / 2, piece.z);
      mesh.receiveShadow = true;
      this.root.add(mesh);

      this.physics.addFixedBox(
        piece.x,
        platformH / 2,
        piece.z,
        piece.w / 2,
        platformH / 2,
        piece.d / 2,
        { friction: 0.9 },
      );
    }
  }

  _buildBuilding(building) {
    const baseY = CITY.platformHeight;
    const group = new Group();
    group.position.set(building.x, baseY, building.z);
    this.root.add(group);

    const styleIndex = building.style % this.materials.materials.facade.length;
    const facadeMaterial = this.materials.materials.facade[styleIndex];
    const roofMaterial = this.materials.materials.roof;
    const roofSlabMaterial = this.materials.materials.roofSlab;
    const materialsForBox = [
      facadeMaterial,
      facadeMaterial,
      roofMaterial,
      roofMaterial,
      facadeMaterial,
      facadeMaterial,
    ];

    let tiers;
    if (building.type === 'block') {
      tiers = [{ w: building.width, d: building.depth, h: building.height, y: 0 }];
    } else if (building.type === 'setback') {
      const h1 = building.height * 0.68;
      tiers = [
        { w: building.width, d: building.depth, h: h1, y: 0 },
        { w: building.width * 0.76, d: building.depth * 0.76, h: building.height - h1, y: h1 },
      ];
    } else {
      const h1 = building.height * 0.36;
      const h2 = building.height * 0.33;
      const h3 = building.height - h1 - h2;
      tiers = [
        { w: building.width, d: building.depth, h: h1, y: 0 },
        { w: building.width * 0.81, d: building.depth * 0.81, h: h2, y: h1 },
        { w: building.width * 0.58, d: building.depth * 0.58, h: h3, y: h1 + h2 },
      ];
    }

    for (const tier of tiers) {
      const geometry = this.materials.createBuildingBox(tier.w, tier.h, tier.d);
      const mesh = new Mesh(geometry, materialsForBox);
      mesh.position.y = tier.y + tier.h / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Ground-floor retail band wraps the base in darker glass and gives the
    // facades a believable street-level scale.
    const storeHeight = Math.min(3.15, building.height * 0.3);
    const storeWidth = building.width + 0.16;
    const storeDepth = building.depth + 0.16;
    const storeGeometry = this.materials.createBox(storeWidth, storeHeight, storeDepth, [
      [storeDepth / 8, 1],
      [storeDepth / 8, 1],
      [1, 1],
      [1, 1],
      [storeWidth / 8, 1],
      [storeWidth / 8, 1],
    ]);
    const store = new Mesh(storeGeometry, [
      this.materials.materials.storefront,
      this.materials.materials.storefront,
      roofSlabMaterial,
      roofSlabMaterial,
      this.materials.materials.storefront,
      this.materials.materials.storefront,
    ]);
    store.position.y = storeHeight / 2;
    store.castShadow = false;
    store.receiveShadow = true;
    group.add(store);

    const topTier = tiers[tiers.length - 1];
    const roofSlab = new Mesh(
      this.materials.createBox(topTier.w * 1.03, 0.3, topTier.d * 1.03),
      roofSlabMaterial,
    );
    roofSlab.position.y = building.height + 0.02;
    roofSlab.castShadow = false;
    roofSlab.receiveShadow = true;
    group.add(roofSlab);

    this._buildRoofDetails(group, building, topTier, building.height + 0.2);
    this._buildSignAndAwning(group, building, styleIndex);

    this.physics.addFixedBox(
      building.x,
      baseY + building.height / 2,
      building.z,
      building.width / 2,
      building.height / 2,
      building.depth / 2,
      { friction: 0.86 },
    );
  }

  _buildRoofDetails(group, building, topTier, roofY) {
    let seed = building.rooftopSeed || 1;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) {
      const unit = new Mesh(this.materials.geometries.acUnit, this.materials.materials.ac);
      const scale = 0.7 + random() * 0.75;
      unit.scale.set(scale, 0.7 + random() * 0.5, scale);
      unit.position.set(
        (random() - 0.5) * Math.max(1, topTier.w - 3.4),
        roofY + 0.32 * scale,
        (random() - 0.5) * Math.max(1, topTier.d - 3.4),
      );
      unit.rotation.y = random() * Math.PI;
      unit.castShadow = false;
      unit.receiveShadow = true;
      group.add(unit);
    }

    if (building.height > 27) {
      const antenna = new Mesh(
        this.materials.geometries.antenna,
        this.materials.materials.metalDark,
      );
      antenna.position.set(topTier.w * 0.28, roofY + 1.7, -topTier.d * 0.2);
      antenna.castShadow = false;
      group.add(antenna);

      const tip = new Mesh(this.materials.geometries.unitBox, this.materials.materials.lamp);
      tip.scale.set(0.16, 0.16, 0.16);
      tip.position.copy(antenna.position);
      tip.position.y += 1.75;
      group.add(tip);
    }

    if (building.isLandmark) {
      const crown = new Mesh(
        this.materials.createBox(topTier.w * 0.42, 4.2, topTier.d * 0.42),
        this.materials.materials.facade[0],
      );
      crown.position.y = roofY + 2.1;
      crown.castShadow = false;
      group.add(crown);
    }
  }

  _buildSignAndAwning(group, building, styleIndex) {
    const sign = building.sign;
    const awningNormal = sign ? sign.normal : { x: building.x > 0 ? 1 : -1, z: 0 };

    if (building.height < 20) {
      const awning = new Mesh(
        this.materials.createBox(
          awningNormal.z !== 0 ? building.width * 0.54 : 1.1,
          0.12,
          awningNormal.z !== 0 ? 1.1 : building.depth * 0.54,
        ),
        this.materials.materials.awning[styleIndex % this.materials.materials.awning.length],
      );
      awning.position.set(
        awningNormal.x * (building.width / 2 + 0.56),
        2.86,
        awningNormal.z * (building.depth / 2 + 0.56),
      );
      awning.castShadow = false;
      awning.receiveShadow = true;
      group.add(awning);
    }

    if (!sign) return;

    const faceWidth =
      sign.normal.x !== 0
        ? Math.min(sign.width, building.depth - 1.2)
        : Math.min(sign.width, building.width - 1.2);
    const plane = new Mesh(
      this.materials.createPlane(faceWidth, 1.28, 1, 1),
      this.materials.getSignMaterial(sign),
    );
    const backing = new Mesh(
      this.materials.createBox(
        sign.normal.x !== 0 ? 0.12 : faceWidth + 0.16,
        1.44,
        sign.normal.z !== 0 ? 0.12 : faceWidth + 0.16,
      ),
      this.materials.materials.metalDark,
    );

    let rotationY;
    const outwardX = sign.normal.x;
    const outwardZ = sign.normal.z;
    if (outwardX !== 0) rotationY = outwardX > 0 ? Math.PI / 2 : -Math.PI / 2;
    else rotationY = outwardZ > 0 ? 0 : Math.PI;

    const x = outwardX * (building.width / 2 + 0.1);
    const z = outwardZ * (building.depth / 2 + 0.1);
    plane.position.set(x, sign.height, z);
    plane.rotation.y = rotationY;
    plane.castShadow = false;
    plane.receiveShadow = false;
    group.add(plane);

    backing.position.copy(plane.position);
    backing.position.x -= outwardX * 0.08;
    backing.position.z -= outwardZ * 0.08;
    backing.rotation.y = rotationY;
    backing.castShadow = false;
    group.add(backing);
  }

  _buildRoadMarkings() {
    const crosswalkMatrices = [];
    const dashMatrices = [];
    const roads = CITY.roadCenters;
    const y = 0.012;

    for (const rx of roads) {
      for (const rz of roads) {
        for (const side of ['north', 'south', 'east', 'west']) {
          for (let i = 0; i < 9; i += 1) {
            const offset = -5.2 + i * 1.3;
            if (side === 'north' || side === 'south') {
              dummy.position.set(rx + offset, y, rz + (side === 'north' ? -7.2 : 7.2));
              dummy.scale.set(0.62, 1, 2.35);
            } else {
              dummy.position.set(rx + (side === 'west' ? -7.2 : 7.2), y, rz + offset);
              dummy.scale.set(2.35, 1, 0.62);
            }
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            crosswalkMatrices.push(dummy.matrix.clone());
          }
        }
      }
    }

    const skipNearIntersection = (value) => roads.some((road) => Math.abs(value - road) < 8.4);

    for (const rz of roads) {
      for (let x = -78; x <= 78; x += 7.4) {
        if (skipNearIntersection(x)) continue;
        dummy.position.set(x, y, rz);
        dummy.scale.set(3.1, 1, 0.17);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        dashMatrices.push(dummy.matrix.clone());
      }
    }

    for (const rx of roads) {
      for (let z = -78; z <= 78; z += 7.4) {
        if (skipNearIntersection(z)) continue;
        dummy.position.set(rx, y, z);
        dummy.scale.set(0.17, 1, 3.1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        dashMatrices.push(dummy.matrix.clone());
      }
    }

    const markingGeometry = this.materials.createPlane(1, 1, 1, 1);
    markingGeometry.rotateX(-Math.PI / 2);

    this._addInstanced(markingGeometry, this.materials.materials.crosswalk, crosswalkMatrices, {
      cast: false,
      receive: true,
    });
    this._addInstanced(markingGeometry, this.materials.materials.laneLine, dashMatrices, {
      cast: false,
      receive: true,
    });
  }

  _buildStreetLights() {
    const specs = [];
    const platformY = CITY.platformHeight;

    for (const block of BLOCKS) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          specs.push({
            x: block.center.x + sx * 16.7,
            z: block.center.z + sz * 16.7,
            ground: platformY,
            yaw: Math.atan2(-sz, sx),
          });
        }
      }
    }

    for (const [x, z] of [
      [-81, -81],
      [81, -81],
      [-81, 81],
      [81, 81],
      [0, -81],
      [0, 81],
      [-81, 0],
      [81, 0],
    ]) {
      const yaw = Math.atan2(z, -x);
      specs.push({ x, z, ground: platformY, yaw });
    }

    const poleMatrices = [];
    const armMatrices = [];
    const lampMatrices = [];

    for (const spec of specs) {
      const dirX = Math.cos(spec.yaw);
      const dirZ = -Math.sin(spec.yaw);

      dummy.position.set(spec.x, spec.ground + 2.7, spec.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleMatrices.push(dummy.matrix.clone());

      dummy.position.set(spec.x + dirX * 0.85, spec.ground + 5.2, spec.z + dirZ * 0.85);
      dummy.rotation.set(0, spec.yaw, 0);
      dummy.updateMatrix();
      armMatrices.push(dummy.matrix.clone());

      dummy.position.set(spec.x + dirX * 1.72, spec.ground + 5.08, spec.z + dirZ * 1.72);
      dummy.rotation.set(0, spec.yaw, 0);
      dummy.updateMatrix();
      lampMatrices.push(dummy.matrix.clone());

      this.physics.addFixedCylinder(spec.x, spec.ground + 2.7, spec.z, 2.7, 0.11, {
        friction: 0.7,
      });
      this.streetLights.push(spec);
    }

    this._addInstanced(
      this.materials.geometries.pole,
      this.materials.materials.metalDark,
      poleMatrices,
      { cast: true, receive: false },
    );
    this._addInstanced(
      this.materials.geometries.arm,
      this.materials.materials.metalDark,
      armMatrices,
      { cast: true, receive: false },
    );
    this._addInstanced(
      this.materials.geometries.lampHead,
      this.materials.materials.lamp,
      lampMatrices,
      { cast: false, receive: false },
    );
  }

  _buildTrees() {
    const specs = [];
    const platformY = CITY.platformHeight;

    for (const block of BLOCKS) {
      if (block.type === 'park') {
        for (const tree of block.trees) {
          specs.push({ x: tree.x, z: tree.z, scale: tree.scale, ground: platformY });
        }
        continue;
      }

      const offsets = [
        { x: 16.4, z: 6.8 },
        { x: -16.4, z: -6.8 },
        { x: 6.8, z: -16.4 },
        { x: -6.8, z: 16.4 },
      ];
      const pickA = (block.gx + block.gz + 8) % offsets.length;
      const pickB = (pickA + 2) % offsets.length;
      for (const index of [pickA, pickB]) {
        const offset = offsets[index];
        const jitter = ((block.gx * 13 + block.gz * 7 + index * 11) % 7) / 7;
        specs.push({
          x: block.center.x + offset.x,
          z: block.center.z + offset.z + (jitter - 0.5) * 2,
          scale: 0.88 + jitter * 0.22,
          ground: platformY,
        });
      }
    }

    for (const [x, z] of [
      [-81, -34],
      [81, 34],
      [-34, 81],
      [34, -81],
      [-81, 47],
      [81, -47],
      [47, 81],
      [-47, -81],
    ]) {
      specs.push({ x, z, scale: 1.02, ground: platformY });
    }

    let seed = 9391;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const trunkMatrices = [];
    const leafMatrices = [];
    const leafColors = [];
    const darkGreen = new Color(0x456037);
    const lightGreen = new Color(0x82945a);
    const deepGreen = new Color(0x344d2c);

    for (const spec of specs) {
      const scale = spec.scale ?? 1;
      dummy.position.set(spec.x, spec.ground + 1.25 * scale, spec.z);
      dummy.rotation.set(0, random() * Math.PI * 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunkMatrices.push(dummy.matrix.clone());

      this.physics.addFixedCylinder(
        spec.x,
        spec.ground + 1.25 * scale,
        spec.z,
        1.25 * scale,
        0.22 * scale,
        { friction: 0.8 },
      );

      for (let i = 0; i < 3; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = i === 0 ? 0 : 0.75 * scale;
        const leafScale = scale * (1.15 + random() * 0.55);
        dummy.position.set(
          spec.x + Math.cos(angle) * radius,
          spec.ground + (3.3 + i * 0.62) * scale,
          spec.z + Math.sin(angle) * radius,
        );
        dummy.rotation.set(random() * 0.5, random() * Math.PI * 2, random() * 0.5);
        dummy.scale.set(leafScale, leafScale * 0.82, leafScale);
        dummy.updateMatrix();
        leafMatrices.push(dummy.matrix.clone());
        leafColors.push(
          darkGreen.clone().lerp(i === 1 ? lightGreen : deepGreen, 0.25 + random() * 0.65),
        );
      }
    }

    this._addInstanced(
      this.materials.geometries.treeTrunk,
      this.materials.materials.treeTrunk,
      trunkMatrices,
      { cast: true, receive: true },
    );

    const leaves = new InstancedMesh(
      this.materials.geometries.treeLeaf,
      this.materials.materials.foliage,
      leafMatrices.length,
    );
    for (let i = 0; i < leafMatrices.length; i += 1) {
      leaves.setMatrixAt(i, leafMatrices[i]);
      leaves.setColorAt(i, leafColors[i]);
    }
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    this.root.add(leaves);

    this.treeCount = specs.length;
  }

  _buildPark() {
    const park = BLOCKS.find((block) => block.type === 'park');
    if (!park) return;
    const y = CITY.platformHeight;
    const pathMaterial = this.materials.materials.path;
    const grassMaterial = this.materials.materials.grass;
    const platformHalf = CITY.blockSize / 2 - CITY.sidewalkWidth;

    const lawn = new Mesh(
      this.materials.createPlane(platformHalf * 2, platformHalf * 2, 7, 7),
      grassMaterial,
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = y + 0.006;
    lawn.receiveShadow = true;
    this.root.add(lawn);

    const plaza = new Mesh(this._track(new CircleGeometry(5.3, 40)), pathMaterial);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = y + 0.014;
    plaza.receiveShadow = true;
    this.root.add(plaza);

    const paths = [
      { x: 0, z: platformHalf / 2, w: 3.1, d: platformHalf },
      { x: 0, z: -platformHalf / 2, w: 3.1, d: platformHalf },
      { x: platformHalf / 2, z: 0, w: platformHalf, d: 3.1 },
      { x: -platformHalf / 2, z: 0, w: platformHalf, d: 3.1 },
    ];

    for (const path of paths) {
      const mesh = new Mesh(
        this.materials.createPlane(path.w, path.d, path.w / 3, path.d / 3),
        pathMaterial,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(path.x, y + 0.012, path.z);
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    this._buildFountain(y);

    for (const bench of park.benches) {
      this._buildBench(bench, y);
    }

    this._buildContactNpc(y);
  }

  _buildFountain(y) {
    const stone = this._localMaterial({ color: 0x8d877c, roughness: 0.78, metalness: 0.05 });
    const water = this.materials.materials.water;

    const basin = new Mesh(this._track(new CylinderGeometry(3.15, 3.35, 0.62, 28)), stone);
    basin.position.y = y + 0.31;
    basin.castShadow = true;
    basin.receiveShadow = true;
    this.root.add(basin);

    const inner = new Mesh(this._track(new CylinderGeometry(2.92, 2.92, 0.1, 28)), stone);
    inner.position.y = y + 0.4;
    inner.receiveShadow = true;
    this.root.add(inner);

    const waterSurface = new Mesh(this._track(new CircleGeometry(2.8, 32)), water);
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.y = y + 0.56;
    this.root.add(waterSurface);

    const rim = new Mesh(this._track(new TorusGeometry(3.19, 0.12, 8, 32)), stone);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y + 0.62;
    rim.castShadow = true;
    this.root.add(rim);

    const pedestal = new Mesh(this._track(new CylinderGeometry(0.44, 0.62, 1.35, 10)), stone);
    pedestal.position.y = y + 1.28;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.root.add(pedestal);

    const sculpture = new Mesh(
      this._track(new TorusKnotGeometry(0.72, 0.15, 72, 9)),
      this.materials.materials.statue,
    );
    sculpture.position.y = y + 2.8;
    sculpture.rotation.set(0.3, 0.6, 0.15);
    sculpture.castShadow = true;
    this.root.add(sculpture);

    const jetGeometry = this._track(new CylinderGeometry(0.05, 0.11, 1.0, 6));
    const jets = [
      { x: -0.65, z: 0.2, phase: 0 },
      { x: 0.62, z: -0.3, phase: 1.9 },
      { x: 0.1, z: 0.65, phase: 3.5 },
    ];
    for (const jet of jets) {
      const mesh = new Mesh(jetGeometry, water);
      mesh.position.set(jet.x, y + 1.65, jet.z);
      this.root.add(mesh);
      this._effects.push({ mesh, baseY: y + 1.65, phase: jet.phase, type: 'jet' });
    }

    this.physics.addFixedCylinder(0, y + 0.31, 0, 0.31, 3.35, { friction: 0.8 });
  }

  _buildBench(bench, y) {
    const group = new Group();
    group.position.set(bench.x, y, bench.z);
    group.rotation.y = Math.atan2(-bench.x, -bench.z);
    this.root.add(group);

    const seat = new Mesh(this.materials.geometries.benchSeat, this.materials.materials.wood);
    seat.position.y = 0.48;
    seat.castShadow = true;
    seat.receiveShadow = true;
    group.add(seat);

    const back = new Mesh(this.materials.geometries.benchBack, this.materials.materials.wood);
    back.position.set(0, 0.78, -0.23);
    back.rotation.x = -0.08;
    back.castShadow = true;
    group.add(back);

    for (const x of [-0.66, 0.66]) {
      const leg = new Mesh(this.materials.geometries.benchLeg, this.materials.materials.metal);
      leg.position.set(x, 0.23, 0);
      leg.castShadow = true;
      group.add(leg);
    }

    const rotated = Math.abs(Math.sin(group.rotation.y)) > 0.5;
    this.physics.addFixedBox(
      bench.x,
      y + 0.45,
      bench.z,
      rotated ? 0.3 : 0.86,
      0.45,
      rotated ? 0.86 : 0.3,
      { friction: 0.8 },
    );
  }

  _buildContactNpc(y) {
    const jacket = this._localMaterial({ color: 0x2b3542, roughness: 0.86 });
    const shirt = this._localMaterial({ color: 0xb9b2a2, roughness: 0.8 });
    const pants = this._localMaterial({ color: 0x22262b, roughness: 0.9 });
    const skin = this._localMaterial({ color: 0xc79872, roughness: 0.72 });
    const hair = this._localMaterial({ color: 0x1a1714, roughness: 0.9 });

    const group = new Group();
    group.position.set(-6.1, y, 8.5);
    group.rotation.y = 0.6;
    this.root.add(group);

    const addPart = (material, sx, sy, sz, px, py, pz) => {
      const mesh = new Mesh(this.materials.geometries.unitBox, material);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    addPart(pants, 0.21, 0.86, 0.24, -0.14, 0.43, 0);
    addPart(pants, 0.21, 0.86, 0.24, 0.14, 0.43, 0);
    addPart(jacket, 0.58, 0.7, 0.32, 0, 1.21, 0);
    addPart(shirt, 0.18, 0.44, 0.02, 0, 1.28, 0.17);
    addPart(jacket, 0.16, 0.62, 0.2, -0.37, 1.17, 0.02);
    addPart(jacket, 0.16, 0.62, 0.2, 0.37, 1.17, 0.02);
    addPart(hair, 0.34, 0.12, 0.32, 0, 1.91, -0.01);

    const head = new Mesh(this._track(new SphereGeometry(0.23, 12, 10)), skin);
    head.position.set(0, 1.74, 0);
    head.scale.z = 1.02;
    head.castShadow = true;
    group.add(head);

    this.physics.addFixedCylinder(group.position.x, y + 0.9, group.position.z, 0.9, 0.34, {
      friction: 0.7,
    });
  }

  _buildDock() {
    const y = CITY.platformHeight;
    const containers = MISSION.dockContainers;

    for (const spec of containers) {
      const group = new Group();
      group.position.set(spec.x, y, spec.z);
      group.rotation.y = spec.yaw;
      this.root.add(group);

      const material =
        spec.color === 0x356f76
          ? this.materials.materials.containerTeal
          : this.materials.materials.containerRust;

      const body = new Mesh(this.materials.createBox(2.45, 2.6, 6.1), material);
      body.position.y = 1.3;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const railGeometry = this.materials.createBox(2.5, 0.1, 6.15);
      for (const railY of [0.18, 2.42]) {
        const rail = new Mesh(railGeometry, this.materials.materials.metalDark);
        rail.position.y = railY;
        rail.castShadow = true;
        group.add(rail);
      }

      const stripe = new Mesh(this.materials.createBox(2.48, 0.5, 0.5), this.materials.materials.tactile);
      stripe.position.set(0, 1.7, 1.8);
      group.add(stripe);

      this.physics.addFixedBox(spec.x, y + 1.3, spec.z, 1.25, 1.3, 3.1, {
        friction: 0.8,
      });
    }

    const coneMaterial = this._localMaterial({ color: 0xd46a36, roughness: 0.82 });
    const coneGeometry = this._track(new ConeGeometry(0.26, 0.72, 10));
    const dropZone = MISSION.dropoff;
    for (const [dx, dz] of [
      [-3.3, -4.4],
      [3.3, -4.4],
      [-3.3, 4.4],
      [3.3, 4.4],
    ]) {
      const cone = new Mesh(coneGeometry, coneMaterial);
      cone.position.set(dropZone.x + dx, 0.36, dropZone.z + dz);
      cone.castShadow = true;
      this.root.add(cone);
    }

    const pad = new Mesh(
      this.materials.createPlane(6.6, 8.8, 1, 1),
      this.materials.materials.dropZone,
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(dropZone.x, 0.014, dropZone.z);
    this.root.add(pad);
  }

  _buildDistantSkyline() {
    const material = this._localMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.04,
    });
    const matrices = [];
    const colors = [];
    let seed = 7741;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const baseColor = new Color(0x3b4d5b);
    const farColor = new Color(0x2f404d);

    for (let ring = 0; ring < 2; ring += 1) {
      const count = ring === 0 ? 32 : 26;
      const radius = ring === 0 ? 205 : 300;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + random() * 0.12;
        const distance = radius + (random() - 0.5) * (ring === 0 ? 42 : 70);
        const height = (ring === 0 ? 22 : 30) + random() * (ring === 0 ? 44 : 58);
        const width = 15 + random() * 22;
        const depth = 15 + random() * 22;
        dummy.position.set(Math.cos(angle) * distance, height / 2 - 0.05, Math.sin(angle) * distance);
        dummy.rotation.set(0, random() * Math.PI * 0.5, 0);
        dummy.scale.set(width, height, depth);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(baseColor.clone().lerp(farColor, random() * 0.8));
      }
    }

    const mesh = new InstancedMesh(
      this.materials.geometries.unitBox,
      material,
      matrices.length,
    );
    for (let i = 0; i < matrices.length; i += 1) {
      mesh.setMatrixAt(i, matrices[i]);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.root.add(mesh);
  }

  _buildDistantGreenery() {
    const matrices = [];
    const colors = [];
    const deep = new Color(0x2f4728);
    const mid = new Color(0x45603a);
    let seed = 5127;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < 46; i += 1) {
      const angle = (i / 46) * Math.PI * 2 + random() * 0.1;
      const radius = 104 + random() * 94;
      const scale = 2.4 + random() * 3.2;
      dummy.position.set(Math.cos(angle) * radius, scale * 0.55, Math.sin(angle) * radius);
      dummy.rotation.set(random() * 0.3, random() * Math.PI * 2, random() * 0.3);
      dummy.scale.set(scale, scale * 0.7, scale);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
      colors.push(deep.clone().lerp(mid, random()));
    }

    const mesh = new InstancedMesh(
      this.materials.geometries.treeLeaf,
      this.materials.materials.foliage,
      matrices.length,
    );
    for (let i = 0; i < matrices.length; i += 1) {
      mesh.setMatrixAt(i, matrices[i]);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.root.add(mesh);
  }

  update(_dt, elapsed) {
    const lamp = this.materials.materials.lamp;
    lamp.emissiveIntensity = 2.7 + Math.sin(elapsed * 1.4) * 0.22;

    for (const effect of this._effects) {
      if (effect.type !== 'jet') continue;
      const wave = Math.sin(elapsed * 2.2 + effect.phase);
      effect.mesh.scale.y = 0.72 + wave * 0.18;
      effect.mesh.position.y = effect.baseY + wave * 0.08;
    }
  }

  getStats() {
    let buildings = 0;
    for (const block of BLOCKS) buildings += block.buildings.length;
    return {
      blocks: BLOCKS.length,
      buildings,
      trees: this.treeCount,
      streetLights: this.streetLights.length,
    };
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.clear();
    for (const geometry of this._localGeometries) geometry.dispose();
    for (const material of this._localMaterials) material.dispose();
    this._localGeometries.clear();
    this._localMaterials.clear();
    this._effects.length = 0;
  }
}






