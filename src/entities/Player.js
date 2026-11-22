import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { CONFIG } from '../config.js';

const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const dampAngle = (current, target, lambda, dt) => {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
};

/**
 * Third-person character: a Rapier kinematic capsule, a procedural stylised
 * rig and a small state machine for walking, sprinting, jumping, falling,
 * health regeneration, damage and death.
 */
export class Player {
  constructor({ scene, physics }) {
    this.scene = scene;
    this.physics = physics;
    this.RAPIER = physics.RAPIER;
    this.spawn = { ...CONFIG.player.spawn };

    this.radius = CONFIG.player.radius;
    this.capsuleHalfHeight = (CONFIG.player.height - this.radius * 2) / 2;
    this.feetOffset = this.capsuleHalfHeight + this.radius;

    this.velocity = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.active = true;
    this.dead = false;
    this.health = CONFIG.player.maxHealth;
    this.age = 0;
    this.lastDamageAt = -999;
    this.facingYaw = this.spawn.yaw;
    this.walkPhase = 0;
    this.moveBlend = 0;
    this.airBlend = 0;
    this.onDamage = null;
    this.onDeath = null;

    this._materials = new Set();
    this._geometries = new Set();

    this.body = this.physics.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.spawn.x,
        this.spawn.y,
        this.spawn.z,
      ),
    );
    this.collider = this.physics.world.createCollider(
      this.RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.radius)
        .setFriction(0.1)
        .setRestitution(0),
      this.body,
    );

    this.controller = this.physics.world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(0.32, 0.24, true);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((38 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(82);
    this.controller.setSlideEnabled(true);

    this._createModel();
    this.teleport(this.spawn.x, this.spawn.y, this.spawn.z, this.spawn.yaw);
  }

  _trackGeometry(geometry) {
    this._geometries.add(geometry);
    return geometry;
  }

  _material(options) {
    const material = new MeshStandardMaterial(options);
    this._materials.add(material);
    return material;
  }

  _createModel() {
    this.materials = {
      jacket: this._material({ color: 0xb55a30, roughness: 0.72, metalness: 0.03 }),
      jacketDark: this._material({ color: 0x7f3c20, roughness: 0.78 }),
      shirt: this._material({ color: 0xd9d2c2, roughness: 0.82 }),
      jeans: this._material({ color: 0x28303b, roughness: 0.88 }),
      shoe: this._material({ color: 0x17191d, roughness: 0.62 }),
      skin: this._material({ color: 0xce9d75, roughness: 0.7 }),
      hair: this._material({ color: 0x191614, roughness: 0.88 }),
      dark: this._material({ color: 0x111418, roughness: 0.5, metalness: 0.2 }),
      bag: this._material({ color: 0x3e3a32, roughness: 0.9 }),
    };

    this.geometries = {
      unitBox: this._trackGeometry(new BoxGeometry(1, 1, 1)),
      head: this._trackGeometry(new SphereGeometry(0.21, 16, 12)),
      hair: this._trackGeometry(new SphereGeometry(0.225, 16, 10)),
      torso: this._trackGeometry(new CapsuleGeometry(0.27, 0.32, 4, 10)),
      arm: this._trackGeometry(new CapsuleGeometry(0.085, 0.42, 3, 7)),
      leg: this._trackGeometry(new CapsuleGeometry(0.105, 0.46, 3, 8)),
      hand: this._trackGeometry(new SphereGeometry(0.095, 8, 6)),
    };

    this.model = new Group();
    this.model.name = 'player-model';
    this.scene.add(this.model);

    this.rig = {};

    const addBox = (parent, material, size, position) => {
      const mesh = new Mesh(this.geometries.unitBox, material);
      mesh.scale.set(size.x, size.y, size.z);
      mesh.position.set(position.x, position.y, position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.rig.hips = addBox(
      this.model,
      this.materials.jeans,
      { x: 0.5, y: 0.24, z: 0.34 },
      { x: 0, y: 0.94, z: 0 },
    );

    this.rig.torso = new Group();
    this.rig.torso.position.y = 1.15;
    this.rig.torsoBaseY = 1.15;
    this.model.add(this.rig.torso);

    const torso = new Mesh(this.geometries.torso, this.materials.jacket);
    torso.scale.set(1.15, 0.94, 0.8);
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.rig.torso.add(torso);

    addBox(this.rig.torso, this.materials.shirt, { x: 0.16, y: 0.44, z: 0.02 }, { x: 0, y: 0.06, z: -0.225 });
    addBox(this.rig.torso, this.materials.jacketDark, { x: 0.62, y: 0.08, z: 0.36 }, { x: 0, y: 0.3, z: 0 });
    addBox(this.rig.torso, this.materials.bag, { x: 0.38, y: 0.44, z: 0.17 }, { x: 0, y: 0.02, z: 0.23 });

    this.rig.head = new Group();
    this.rig.head.position.y = 0.47;
    this.rig.torso.add(this.rig.head);

    const head = new Mesh(this.geometries.head, this.materials.skin);
    head.castShadow = true;
    this.rig.head.add(head);

    const hair = new Mesh(this.geometries.hair, this.materials.hair);
    hair.scale.set(1, 0.68, 1);
    hair.position.y = 0.075;
    hair.castShadow = true;
    this.rig.head.add(hair);

    addBox(this.rig.head, this.materials.dark, { x: 0.3, y: 0.065, z: 0.035 }, { x: 0, y: 0.02, z: -0.185 });

    this.rig.arms = {};
    for (const side of [-1, 1]) {
      const arm = new Group();
      arm.position.set(side * 0.39, 0.23, 0);
      arm.rotation.z = side * 0.08;
      this.rig.torso.add(arm);

      const mesh = new Mesh(this.geometries.arm, this.materials.jacket);
      mesh.position.y = -0.28;
      mesh.castShadow = true;
      arm.add(mesh);

      const hand = new Mesh(this.geometries.hand, this.materials.skin);
      hand.position.y = -0.56;
      hand.castShadow = true;
      arm.add(hand);

      this.rig.arms[side < 0 ? 'left' : 'right'] = arm;
    }

    this.rig.legs = {};
    for (const side of [-1, 1]) {
      const leg = new Group();
      leg.position.set(side * 0.16, 0.88, 0);
      this.model.add(leg);

      const mesh = new Mesh(this.geometries.leg, this.materials.jeans);
      mesh.position.y = -0.33;
      mesh.castShadow = true;
      leg.add(mesh);

      addBox(leg, this.materials.shoe, { x: 0.23, y: 0.12, z: 0.38 }, { x: 0, y: -0.78, z: -0.07 });

      this.rig.legs[side < 0 ? 'left' : 'right'] = leg;
    }

    this.model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = false;
    });
  }

  getPosition() {
    const translation = this.body.translation();
    return { x: translation.x, y: translation.y, z: translation.z };
  }

  getFootPosition() {
    const translation = this.body.translation();
    return { x: translation.x, y: translation.y - this.feetOffset, z: translation.z };
  }

  getCameraTarget() {
    const translation = this.body.translation();
    return { x: translation.x, y: translation.y + 0.5, z: translation.z };
  }

  getSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  setActive(active) {
    this.active = active;
    this.body.setEnabled(active);
    this.collider.setEnabled(active);
    this.model.visible = active;
    if (!active) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.velocity.z = 0;
    }
  }

  teleport(x, y, z, yaw = this.facingYaw) {
    this.body.setEnabled(true);
    this.collider.setEnabled(true);
    this.active = true;
    this.model.visible = true;
    this.body.setTranslation({ x, y, z }, true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.facingYaw = yaw;
    this.grounded = false;
    this.syncMesh();
  }

  respawn() {
    this.dead = false;
    this.health = CONFIG.player.maxHealth;
    this.lastDamageAt = this.age;
    this.teleport(this.spawn.x, this.spawn.y, this.spawn.z, this.spawn.yaw);
  }

  takeDamage(amount, reason = 'damage') {
    if (this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = this.age;
    this.onDamage?.(amount, this.health, reason);
    if (this.health <= 0) {
      this.dead = true;
      this.onDeath?.();
    }
  }

  update(dt, input, cameraYaw) {
    this.age += dt;

    if (!this.active) {
      this.syncMesh();
      return;
    }

    if (this.dead) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.syncMesh();
      return;
    }

    const axis = input.getMoveAxis();
    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    let desiredX = forwardX * -axis.z + rightX * axis.x;
    let desiredZ = forwardZ * -axis.z + rightZ * axis.x;
    const inputLength = Math.hypot(desiredX, desiredZ);
    if (inputLength > 1) {
      desiredX /= inputLength;
      desiredZ /= inputLength;
    }

    const running = input.isRunning();
    const targetSpeed = inputLength > 0 ? (running ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed) : 0;
    const acceleration = this.grounded
      ? CONFIG.player.groundAcceleration
      : CONFIG.player.airAcceleration;

    this.velocity.x = damp(this.velocity.x, desiredX * targetSpeed, acceleration, dt);
    this.velocity.z = damp(this.velocity.z, desiredZ * targetSpeed, acceleration, dt);

    if (input.consume('Space') && this.grounded) {
      this.velocity.y = CONFIG.player.jumpSpeed;
      this.grounded = false;
    }

    if (!this.grounded) {
      this.velocity.y += CONFIG.player.gravity * dt;
      this.velocity.y = Math.max(this.velocity.y, -32);
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }

    const desiredTranslation = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };

    this.controller.computeColliderMovement(this.collider, desiredTranslation);
    const movement = this.controller.computedMovement();
    const wasGrounded = this.grounded;
    const impactVelocity = this.velocity.y;
    this.grounded = this.controller.computedGrounded();

    if (this.grounded) {
      if (!wasGrounded && impactVelocity < -CONFIG.player.fallDamageSpeed) {
        const damage = Math.round(
          (Math.abs(impactVelocity) - CONFIG.player.fallDamageSpeed) * CONFIG.player.fallDamageScale,
        );
        this.takeDamage(damage, 'fall');
      }
      if (this.velocity.y < 0) this.velocity.y = 0;
    } else if (this.velocity.y > 0 && movement.y < desiredTranslation.y - 0.0001) {
      this.velocity.y = 0;
    }

    const position = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });

    if (inputLength > 0.05) {
      const targetYaw = Math.atan2(-desiredX, -desiredZ);
      this.facingYaw = dampAngle(this.facingYaw, targetYaw, CONFIG.player.rotationSpeed, dt);
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.moveBlend = damp(this.moveBlend, Math.min(speed / CONFIG.player.runSpeed, 1), 9, dt);
    this.airBlend = damp(this.airBlend, this.grounded ? 0 : 1, 10, dt);
    this.walkPhase += speed * dt * 2.35 + this.moveBlend * dt * 2.2;

    if (
      this.health < CONFIG.player.maxHealth &&
      this.age - this.lastDamageAt > CONFIG.player.regenDelay
    ) {
      this.health = Math.min(CONFIG.player.maxHealth, this.health + CONFIG.player.regenRate * dt);
    }

    this.syncMesh();
  }

  syncMesh() {
    const translation = this.body.translation();
    this.model.position.set(translation.x, translation.y - this.feetOffset, translation.z);
    this.model.rotation.y = this.facingYaw;
    this._animate();
  }

  _animate() {
    const speedBlend = this.moveBlend;
    const groundBlend = 1 - this.airBlend;
    const stride = Math.sin(this.walkPhase) * 0.66 * speedBlend * groundBlend;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.035 * speedBlend * groundBlend;
    const idle = 1 - speedBlend;

    this.rig.torso.position.y =
      this.rig.torsoBaseY +
      bob +
      Math.sin(this.age * 1.8) * 0.006 * idle;
    this.rig.hips.position.y = 0.94 + bob * 0.45;

    this.rig.legs.left.rotation.x = stride + this.airBlend * 0.32;
    this.rig.legs.right.rotation.x = -stride - this.airBlend * 0.26;

    this.rig.arms.left.rotation.x =
      -stride * 0.82 + Math.sin(this.age * 1.5) * 0.025 * idle - this.airBlend * 0.35;
    this.rig.arms.right.rotation.x =
      stride * 0.82 - Math.sin(this.age * 1.5) * 0.025 * idle - this.airBlend * 0.35;
    this.rig.arms.left.rotation.z = -0.08 - this.airBlend * 0.22;
    this.rig.arms.right.rotation.z = 0.08 + this.airBlend * 0.22;

    this.rig.torso.rotation.x = -0.035 - speedBlend * 0.1 + this.airBlend * 0.04;
    this.rig.torso.rotation.z = Math.sin(this.walkPhase) * 0.018 * speedBlend * groundBlend;
    this.rig.head.rotation.x = 0.02 + speedBlend * 0.06 - this.airBlend * 0.02;
    this.rig.head.rotation.y = Math.sin(this.age * 0.7) * 0.035 * idle;
  }

  getState() {
    const position = this.getPosition();
    return {
      x: Math.round(position.x * 100) / 100,
      y: Math.round(position.y * 100) / 100,
      z: Math.round(position.z * 100) / 100,
      health: Math.round(this.health),
      dead: this.dead,
      grounded: this.grounded,
      speed: Math.round(this.getSpeed() * 100) / 100,
    };
  }

  dispose() {
    this.scene.remove(this.model);
    this.physics.world.removeRigidBody(this.body);
    try {
      this.physics.world.removeCharacterController(this.controller);
    } catch {
      // Older Rapier builds free character controllers with the world.
    }
    for (const geometry of this._geometries) geometry.dispose();
    for (const material of this._materials) material.dispose();
    this._geometries.clear();
    this._materials.clear();
  }
}



