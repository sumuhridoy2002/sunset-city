import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Small wrapper around Rapier. Keeps the physics engine out of gameplay classes
 * while still exposing the underlying handles needed for the character and
 * raycast vehicle controllers.
 */
export class Physics {
  static async create() {
    try {
      await RAPIER.init();
    } catch (error) {
      throw new Error(`Rapier failed to initialise its WebAssembly module: ${error.message}`);
    }
    return new Physics();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = CONFIG.loop.fixedDt;
    this.fixedDt = CONFIG.loop.fixedDt;
    this.staticBodyCount = 0;
  }

  step() {
    this.world.step();
  }

  addFixedBox(x, y, z, hx, hy, hz, { friction = 0.9, restitution = 0 } = {}) {
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    const collider = this.world.createCollider(
      this.RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(restitution),
      body,
    );
    this.staticBodyCount += 1;
    return { body, collider };
  }

  addFixedCylinder(x, y, z, halfHeight, radius, { friction = 0.8 } = {}) {
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    const collider = this.world.createCollider(
      this.RAPIER.ColliderDesc.cylinder(halfHeight, radius).setFriction(friction),
      body,
    );
    this.staticBodyCount += 1;
    return { body, collider };
  }

  /**
   * Cast a ray and optionally ignore specific rigid bodies. Used by the camera
   * boom and vehicle placement checks.
   */
  castRay(origin, direction, maxDistance, { excludeBodies = [], solid = true } = {}) {
    const excludedHandles = new Set(excludeBodies.filter(Boolean).map((body) => body.handle));
    const ray = new this.RAPIER.Ray(origin, direction);
    const hit = this.world.castRay(
      ray,
      maxDistance,
      solid,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const parent = collider.parent();
        return !parent || !excludedHandles.has(parent.handle);
      },
    );

    if (!hit) return null;
    // Rapier 0.21 exposes timeOfImpact (older releases used toi).
    const distance = hit.timeOfImpact ?? hit.toi ?? 0;
    return {
      toi: distance,
      timeOfImpact: distance,
      point: ray.pointAt(distance),
      collider: hit.collider,
    };
  }

  /**
   * Cheap clearance test for spawning the player beside a vehicle or validating
   * a respawn position. Returns true when a sphere at `position` is unobstructed.
   */
  isPositionClear(position, radius, { excludeBodies = [] } = {}) {
    const excludedHandles = new Set(excludeBodies.filter(Boolean).map((body) => body.handle));
    const shape = new this.RAPIER.Ball(radius);
    const hit = this.world.intersectionWithShape(
      position,
      IDENTITY_ROTATION,
      shape,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const parent = collider.parent();
        return !parent || !excludedHandles.has(parent.handle);
      },
    );
    return hit === null;
  }

  getStats() {
    return {
      bodies: this.world.bodies.len(),
      colliders: this.world.colliders.len(),
      staticBodies: this.staticBodyCount,
    };
  }

  dispose() {
    this.world.free();
  }
}
