import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  SpotLight,
  Vector3,
} from 'three';
import { CONFIG } from '../config.js';
import { nearestRoadPoint } from '../world/CityLayout.js';

const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * A single raycast-suspension sedan. Rapier's DynamicRayCastVehicleController
 * supplies suspension, traction and steering; the class owns the procedural
 * mesh, wheel animation, lights and all driver input translation.
 */
export class Vehicle {
  constructor({ scene, physics, spawn = CONFIG.vehicle.spawn }) {
    this.scene = scene;
    this.physics = physics;
    this.RAPIER = physics.RAPIER;
    this.occupied = false;
    this.spawn = { ...spawn };
    this._tmpQuaternion = new Quaternion();
    this._tmpForward = new Vector3();

    this._materials = new Set();
    this._geometries = new Set();
    this.steeringValue = 0;
    this.throttleValue = 0;
    this.isBraking = false;
    this.isReversing = false;

    const config = CONFIG.vehicle;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spawn.yaw);

    this.body = this.physics.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.06)
        .setAngularDamping(1.1)
        .setCanSleep(false)
        .setCcdEnabled(true),
    );

    this.collider = this.physics.world.createCollider(
      this.RAPIER.ColliderDesc.cuboid(
        config.chassis.hx,
        config.chassis.hy,
        config.chassis.hz,
      )
        .setMass(config.mass)
        .setFriction(0.72)
        .setRestitution(0.12),
      this.body,
    );

    this.controller = this.physics.world.createVehicleController(this.body);
    this.wheels = [
      { x: -config.wheel.x, z: config.wheel.z, front: true },
      { x: config.wheel.x, z: config.wheel.z, front: true },
      { x: -config.wheel.x, z: -config.wheel.z, front: false },
      { x: config.wheel.x, z: -config.wheel.z, front: false },
    ];

    for (let index = 0; index < this.wheels.length; index += 1) {
      const wheel = this.wheels[index];
      this.controller.addWheel(
        { x: wheel.x, y: config.wheel.connectionY, z: wheel.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        config.wheel.suspensionRestLength,
        config.wheel.radius,
      );
      this.controller.setWheelSuspensionStiffness(index, config.wheel.stiffness);
      this.controller.setWheelMaxSuspensionTravel(index, config.wheel.maxSuspensionTravel);
      this.controller.setWheelSuspensionCompression(index, config.wheel.compression);
      this.controller.setWheelSuspensionRelaxation(index, config.wheel.relaxation);
      this.controller.setWheelMaxSuspensionForce(index, config.wheel.maxSuspensionForce);
      this.controller.setWheelFrictionSlip(index, config.wheel.frictionSlip);
      this.controller.setWheelSideFrictionStiffness(index, config.wheel.sideFriction);
      this.controller.setWheelSteering(index, 0);
      this.controller.setWheelEngineForce(index, 0);
      this.controller.setWheelBrake(index, 0);
    }

    this._createModel();
    this.syncMesh();
  }

  _material(options) {
    const material = new MeshStandardMaterial(options);
    this._materials.add(material);
    return material;
  }

  _geometry(geometry) {
    this._geometries.add(geometry);
    return geometry;
  }

  _createModel() {
    const wheelConfig = CONFIG.vehicle.wheel;

    this.materials = {
      paint: this._material({ color: 0x2f7669, metalness: 0.68, roughness: 0.27, envMapIntensity: 1.25 }),
      paintDark: this._material({ color: 0x1e4c45, metalness: 0.55, roughness: 0.36 }),
      trim: this._material({ color: 0x121519, metalness: 0.45, roughness: 0.55 }),
      chrome: this._material({ color: 0xc3c8cc, metalness: 0.92, roughness: 0.22 }),
      glass: this._material({
        color: 0x35525c,
        metalness: 0.48,
        roughness: 0.1,
        transparent: true,
        opacity: 0.72,
      }),
      tire: this._material({ color: 0x0f1012, roughness: 0.95, metalness: 0.02 }),
      rim: this._material({ color: 0xb7bcc1, metalness: 0.9, roughness: 0.28 }),
      headlight: this._material({
        color: 0xfff4d6,
        emissive: 0xffe5b0,
        emissiveIntensity: 3.2,
        roughness: 0.25,
      }),
      taillight: this._material({
        color: 0xb32218,
        emissive: 0xff2a17,
        emissiveIntensity: 1.2,
        roughness: 0.35,
      }),
      plate: this._material({ color: 0xe7dfc9, roughness: 0.82 }),
      interior: this._material({ color: 0x17191c, roughness: 0.86 }),
      driverJacket: this._material({ color: 0x9f4d2b, roughness: 0.78 }),
      driverSkin: this._material({ color: 0xc3916b, roughness: 0.72 }),
    };

    const lowerBody = this._geometry(new BoxGeometry(1.92, 0.5, 4.15));
    const hood = this._geometry(new BoxGeometry(1.8, 0.16, 1.34));
    const boot = this._geometry(new BoxGeometry(1.82, 0.14, 1.0));
    const skirt = this._geometry(new BoxGeometry(1.95, 0.14, 3.15));
    const roof = this._geometry(new BoxGeometry(1.36, 0.07, 1.24));
    const bumper = this._geometry(new BoxGeometry(1.9, 0.2, 0.24));
    const grille = this._geometry(new BoxGeometry(0.74, 0.16, 0.06));
    const headlight = this._geometry(new BoxGeometry(0.44, 0.13, 0.06));
    const taillight = this._geometry(new BoxGeometry(0.42, 0.13, 0.06));
    const plate = this._geometry(new BoxGeometry(0.46, 0.13, 0.03));
    const mirror = this._geometry(new BoxGeometry(0.13, 0.09, 0.2));
    const handle = this._geometry(new BoxGeometry(0.035, 0.035, 0.22));
    const fender = this._geometry(new BoxGeometry(0.14, 0.2, 0.78));
    const spoilerWing = this._geometry(new BoxGeometry(1.46, 0.06, 0.24));
    const spoilerPost = this._geometry(new BoxGeometry(0.07, 0.18, 0.08));
    const exhaust = this._geometry(new CylinderGeometry(0.055, 0.07, 0.25, 8));
    const wheelTire = this._geometry(
      new CylinderGeometry(wheelConfig.radius, wheelConfig.radius, wheelConfig.width, 20),
    );
    const wheelRim = this._geometry(
      new CylinderGeometry(0.2, 0.2, wheelConfig.width + 0.015, 12),
    );
    const wheelHub = this._geometry(
      new CylinderGeometry(0.055, 0.055, wheelConfig.width + 0.03, 8),
    );
    const caliper = this._geometry(new BoxGeometry(0.06, 0.16, 0.12));

    const cabinShape = new Shape();
    cabinShape.moveTo(-1.04, 0);
    cabinShape.lineTo(1.03, 0);
    cabinShape.lineTo(0.64, 0.5);
    cabinShape.lineTo(-0.7, 0.5);
    cabinShape.closePath();
    const cabinGeometry = new ExtrudeGeometry(cabinShape, {
      depth: 1.56,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    cabinGeometry.rotateY(-Math.PI / 2);
    // The -90° Y rotation maps the extrusion (0..depth on +Z) onto -X, so
    // centering requires a positive translate. This keeps the greenhouse
    // centred over the chassis.
    cabinGeometry.translate(0.78, 0, 0);
    this._geometries.add(cabinGeometry);

    this.mesh = new Group();
    this.mesh.name = 'vehicle-model';
    this.scene.add(this.mesh);

    this._part(lowerBody, this.materials.paint, { x: 0, y: -0.05, z: 0 });
    this._part(skirt, this.materials.trim, { x: 0, y: -0.24, z: 0 });
    this._part(hood, this.materials.paint, { x: 0, y: 0.17, z: 1.32 });
    this._part(boot, this.materials.paint, { x: 0, y: 0.18, z: -1.48 });
    this._part(bumper, this.materials.trim, { x: 0, y: -0.02, z: 2.05 });
    this._part(bumper, this.materials.trim, { x: 0, y: -0.02, z: -2.05 });
    this._part(grille, this.materials.trim, { x: 0, y: 0.06, z: 2.11 });

    this._part(cabinGeometry, this.materials.glass, { x: 0, y: 0.22, z: 0 }, false);
    this._part(roof, this.materials.paint, { x: 0, y: 0.755, z: -0.03 });

    this._part(headlight, this.materials.headlight, { x: -0.6, y: 0.12, z: 2.08 }, false);
    this._part(headlight, this.materials.headlight, { x: 0.6, y: 0.12, z: 2.08 }, false);
    this._part(taillight, this.materials.taillight, { x: -0.58, y: 0.12, z: -2.08 }, false);
    this._part(taillight, this.materials.taillight, { x: 0.58, y: 0.12, z: -2.08 }, false);
    this._part(plate, this.materials.plate, { x: 0, y: -0.1, z: -2.09 }, false);

    for (const side of [-1, 1]) {
      this._part(mirror, this.materials.paintDark, { x: side * 0.99, y: 0.48, z: 0.78 });
      this._part(handle, this.materials.chrome, { x: side * 0.966, y: 0.12, z: 0.28 });
      this._part(handle, this.materials.chrome, { x: side * 0.966, y: 0.12, z: -0.62 });
      this._part(fender, this.materials.trim, { x: side * 0.945, y: -0.14, z: 1.38 });
      this._part(fender, this.materials.trim, { x: side * 0.945, y: -0.14, z: -1.38 });
    }

    this._part(spoilerWing, this.materials.paintDark, { x: 0, y: 0.36, z: -1.98 });
    this._part(spoilerPost, this.materials.trim, { x: -0.48, y: 0.26, z: -1.98 });
    this._part(spoilerPost, this.materials.trim, { x: 0.48, y: 0.26, z: -1.98 });

    for (const x of [-0.45, 0.45]) {
      const pipe = this._part(exhaust, this.materials.chrome, { x, y: -0.24, z: -2.06 });
      pipe.rotation.x = Math.PI / 2;
    }

    this.wheelVisuals = [];
    for (let i = 0; i < this.wheels.length; i += 1) {
      const wheel = this.wheels[i];
      const steerGroup = new Group();
      steerGroup.position.set(
        wheel.x,
        CONFIG.vehicle.wheel.connectionY - CONFIG.vehicle.wheel.suspensionRestLength,
        wheel.z,
      );
      this.mesh.add(steerGroup);

      const spinGroup = new Group();
      steerGroup.add(spinGroup);

      const tire = new Mesh(wheelTire, this.materials.tire);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      tire.receiveShadow = true;
      spinGroup.add(tire);

      const rim = new Mesh(wheelRim, this.materials.rim);
      rim.rotation.z = Math.PI / 2;
      rim.castShadow = true;
      spinGroup.add(rim);

      const hub = new Mesh(wheelHub, this.materials.chrome);
      hub.rotation.z = Math.PI / 2;
      spinGroup.add(hub);

      const brakeCaliper = new Mesh(caliper, this.materials.paint);
      brakeCaliper.position.set(0, 0.12, -0.12);
      brakeCaliper.castShadow = true;
      steerGroup.add(brakeCaliper);

      this.wheelVisuals.push({ steer: steerGroup, spin: spinGroup });
    }

    this.driver = new Group();
    this.driver.position.set(0.34, 0.16, -0.18);
    this.driver.visible = false;
    this.mesh.add(this.driver);

    const driverTorso = new Mesh(
      this._geometry(new BoxGeometry(0.34, 0.34, 0.26)),
      this.materials.driverJacket,
    );
    driverTorso.position.y = 0.18;
    driverTorso.castShadow = true;
    this.driver.add(driverTorso);
    this.driverHead = new Mesh(
      this._geometry(new BoxGeometry(0.24, 0.24, 0.22)),
      this.materials.driverSkin,
    );
    this.driverHead.position.y = 0.42;
    this.driverHead.castShadow = true;
    this.driver.add(this.driverHead);
    const driverHair = new Mesh(
      this._geometry(new BoxGeometry(0.25, 0.07, 0.23)),
      this.materials.trim,
    );
    driverHair.position.y = 0.53;
    this.driver.add(driverHair);

    // Beltline trim and B-pillars break up the glass canopy.
    const beltline = this._geometry(new BoxGeometry(0.055, 0.055, 1.9));
    const pillar = this._geometry(new BoxGeometry(0.06, 0.48, 0.1));
    const dashboard = this._geometry(new BoxGeometry(1.26, 0.12, 0.3));
    for (const side of [-1, 1]) {
      this._part(beltline, this.materials.trim, { x: side * 0.79, y: 0.255, z: 0.02 });
      this._part(pillar, this.materials.paintDark, { x: side * 0.8, y: 0.48, z: -0.28 });
    }
    this._part(dashboard, this.materials.interior, { x: 0, y: 0.29, z: 0.46 }, false);

    this.headlights = [];
    for (const x of [-0.58, 0.58]) {
      const light = new SpotLight(0xffe4b8, 0, 38, 0.5, 0.62, 1.4);
      light.position.set(x, 0.18, 2.02);
      light.castShadow = false;
      const target = new Object3D();
      target.position.set(x * 1.6, -0.65, 17);
      this.mesh.add(target);
      light.target = target;
      this.mesh.add(light);
      this.headlights.push(light);
    }

    this._setOccupiedVisuals(false);
  }

  _part(geometry, material, position, castShadow = true) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.mesh.add(mesh);
    return mesh;
  }

  update(dt, input, occupied = this.occupied) {
    const config = CONFIG.vehicle;
    const speed = this.getForwardSpeed();
    const speedAbs = Math.abs(speed);
    let engineForce = 0;
    let brakeForce = config.rollingBrake;
    let steeringTarget = 0;
    let handbrake = false;

    if (occupied) {
      const throttle = input.isDown('KeyW', 'ArrowUp');
      const reverse = input.isDown('KeyS', 'ArrowDown');
      const steerLeft = input.isDown('KeyA', 'ArrowLeft');
      const steerRight = input.isDown('KeyD', 'ArrowRight');
      handbrake = input.isDown('Space');
      const boost = input.isRunning();

      if (throttle && speed < config.maxForwardSpeed) {
        engineForce = config.engineForce * (boost ? 1.28 : 1);
        brakeForce = 0;
      }

      if (reverse) {
        if (speed > 1.2) {
          brakeForce = config.brakeForce;
        } else if (speed > -config.maxReverseSpeed) {
          engineForce = -config.reverseForce;
          brakeForce = 0;
        }
      }

      if (!throttle && !reverse) brakeForce = config.rollingBrake;
      if (handbrake) {
        engineForce = 0;
        brakeForce = config.handbrakeForce;
      }

      const steerInput = (steerLeft ? 1 : 0) - (steerRight ? 1 : 0);
      const steerFactor =
        1 - clamp(speedAbs / config.maxForwardSpeed, 0, 1) * (1 - config.highSpeedSteerFactor);
      steeringTarget = steerInput * config.maxSteer * steerFactor;

      this.throttleValue = throttle ? 1 : 0;
      this.isBraking = (reverse && speed > 1.2) || handbrake;
      this.isReversing = speed < -0.4;
    } else {
      brakeForce = 7;
      this.throttleValue = 0;
      this.isBraking = false;
      this.isReversing = false;
    }

    this.steeringValue = damp(this.steeringValue, steeringTarget, occupied ? config.steerSpeed : 11, dt);

    for (let index = 0; index < this.wheels.length; index += 1) {
      const wheel = this.wheels[index];
      this.controller.setWheelSteering(index, wheel.front ? this.steeringValue : 0);
      this.controller.setWheelEngineForce(index, wheel.front ? 0 : engineForce);
      this.controller.setWheelBrake(index, brakeForce);
      this.controller.setWheelSideFrictionStiffness(
        index,
        handbrake && !wheel.front ? 0.38 : config.wheel.sideFriction,
      );
    }

    this.controller.updateVehicle(dt, undefined, undefined, (collider) => {
      return collider.handle !== this.collider.handle;
    });

    this.materials.taillight.emissiveIntensity = this.isBraking ? 4.5 : this.isReversing ? 2.3 : 1.2;
  }

  setOccupied(occupied) {
    this.occupied = occupied;
    this._setOccupiedVisuals(occupied);
  }

  _setOccupiedVisuals(occupied) {
    if (this.driver) this.driver.visible = occupied;
    if (this.headlights) {
      for (const light of this.headlights) light.intensity = occupied ? 28 : 0;
    }
  }

  syncMesh() {
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    this.mesh.position.set(translation.x, translation.y, translation.z);
    this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    const config = CONFIG.vehicle.wheel;
    const maxSuspension = config.suspensionRestLength + config.maxSuspensionTravel;

    for (let index = 0; index < this.wheelVisuals.length; index += 1) {
      const visual = this.wheelVisuals[index];
      const suspensionRaw = this.controller.wheelSuspensionLength(index);
      const suspension =
        suspensionRaw === null || suspensionRaw === undefined
          ? config.suspensionRestLength
          : clamp(suspensionRaw, 0, maxSuspension);
      visual.steer.position.y = CONFIG.vehicle.wheel.connectionY - suspension;
      visual.steer.rotation.y = this.controller.wheelSteering(index) ?? 0;
      visual.spin.rotation.x = this.controller.wheelRotation(index) ?? 0;
    }
  }

  getPosition() {
    const translation = this.body.translation();
    return { x: translation.x, y: translation.y, z: translation.z };
  }

  getCameraTarget() {
    const translation = this.body.translation();
    return { x: translation.x, y: translation.y + 0.72, z: translation.z };
  }

  getForwardSpeed() {
    const velocity = this.body.linvel();
    this._tmpForward.set(0, 0, 1).applyQuaternion(this.getQuaternion(this._tmpQuaternion));
    return velocity.x * this._tmpForward.x + velocity.z * this._tmpForward.z;
  }

  getSpeedKmh() {
    return Math.abs(this.getForwardSpeed()) * 3.6;
  }

  getQuaternion(target = new Quaternion()) {
    const rotation = this.body.rotation();
    return target.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  getHeading() {
    this._tmpForward.set(0, 0, 1).applyQuaternion(this.getQuaternion(this._tmpQuaternion));
    return Math.atan2(this._tmpForward.x, this._tmpForward.z);
  }

  localToWorld(local) {
    const translation = this.body.translation();
    const offset = new Vector3(local.x, local.y ?? 0, local.z).applyQuaternion(this.getQuaternion());
    return {
      x: translation.x + offset.x,
      y: translation.y + offset.y,
      z: translation.z + offset.z,
    };
  }

  /** Distance from a world-space point (usually the player's feet) to the car's box. */
  getDoorDistance(point) {
    const translation = this.body.translation();
    const inverse = this.getQuaternion().invert();
    const local = new Vector3(point.x - translation.x, 0, point.z - translation.z).applyQuaternion(
      inverse,
    );
    const closestX = clamp(local.x, -CONFIG.vehicle.chassis.hx, CONFIG.vehicle.chassis.hx);
    const closestZ = clamp(local.z, -CONFIG.vehicle.chassis.hz, CONFIG.vehicle.chassis.hz);
    return Math.hypot(local.x - closestX, local.z - closestZ);
  }

  getExitCandidates() {
    const config = CONFIG.vehicle;
    return [
      { x: config.exitOffsetX, z: config.exitOffsetZ, side: 'left' },
      { x: -config.exitOffsetX, z: config.exitOffsetZ, side: 'right' },
      { x: 0, z: -config.chassis.hz - 1.2, side: 'rear' },
      { x: 0, z: config.chassis.hz + 1.2, side: 'front' },
    ].map((local) => ({ ...local, world: this.localToWorld(local) }));
  }

  isFlipped() {
    const up = new Vector3(0, 1, 0).applyQuaternion(this.getQuaternion());
    return up.y < 0.45;
  }

  reset() {
    const position = this.body.translation();
    const road = nearestRoadPoint(position.x, position.z);
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), road.yaw);

    this.body.setTranslation({ x: road.x, y: 1.15, z: road.z }, true);
    this.body.setRotation(
      { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steeringValue = 0;
    this.syncMesh();
  }

  getState() {
    const position = this.getPosition();
    return {
      x: Math.round(position.x * 100) / 100,
      y: Math.round(position.y * 100) / 100,
      z: Math.round(position.z * 100) / 100,
      speed: Math.round(this.getForwardSpeed() * 100) / 100,
      speedKmh: Math.round(this.getSpeedKmh()),
      occupied: this.occupied,
      heading: Math.round(this.getHeading() * 100) / 100,
      flipped: this.isFlipped(),
    };
  }

  dispose() {
    this.scene.remove(this.mesh);
    try {
      this.physics.world.removeVehicleController(this.controller);
    } catch {
      // Controller is also freed with the world on teardown.
    }
    this.physics.world.removeRigidBody(this.body);
    for (const geometry of this._geometries) geometry.dispose();
    for (const material of this._materials) material.dispose();
    this._geometries.clear();
    this._materials.clear();
  }
}




