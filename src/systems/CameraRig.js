import { Vector3 } from 'three';
import { CONFIG } from '../config.js';

const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const dampAngle = (current, target, lambda, dt) => {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
};

/**
 * Third-person orbital camera with spring smoothing, a collision-aware boom,
 * smooth mode changes, vehicle follow-assist, sprint/car FOV and a cinematic
 * menu orbit.
 */
export class CameraRig {
  constructor({ camera, physics, input }) {
    this.camera = camera;
    this.physics = physics;
    this.input = input;

    this.mode = 'foot';
    this.yaw = 0.1;
    this.pitch = 0.26;
    this.baseDistance = CONFIG.camera.footDistance;
    this.zoomOffset = 0;
    this.currentDistance = CONFIG.camera.footDistance;
    this.time = 0;
    this.timeSinceLook = 99;
    this.target = new Vector3();
    this._targetVector = new Vector3();
    this._offset = new Vector3();
    this._lookTarget = new Vector3();
    this._hasSnapped = false;
    this._fov = CONFIG.camera.fov;
  }

  setMode(mode, { vehicleHeading = null, snap = false } = {}) {
    const changed = mode !== this.mode;
    this.mode = mode;
    this.baseDistance = mode === 'vehicle' ? CONFIG.camera.carDistance : CONFIG.camera.footDistance;
    this.zoomOffset = 0;

    if (vehicleHeading !== null) {
      this.yaw = vehicleHeading + Math.PI;
      this.pitch = 0.2;
    }

    if (changed || snap) {
      this.timeSinceLook = 99;
      this._hasSnapped = false;
    }
  }

  snap(target) {
    if (target) this.target.set(target.x, target.y, target.z);
    this._hasSnapped = true;
    this.currentDistance = this._desiredDistance();
    this._apply(target || this.target, null);
  }

  update(dt, context) {
    this.time += dt;
    const target = context.target;
    if (!target) return;

    const mouse = this.input.consumeMouseDelta();
    if (Math.abs(mouse.x) + Math.abs(mouse.y) > 0.01) {
      this.yaw -= mouse.x * CONFIG.camera.sensitivity;
      this.pitch += mouse.y * CONFIG.camera.sensitivity;
      this.timeSinceLook = 0;
    } else {
      this.timeSinceLook += dt;
    }

    const zoom = this.input.consumeZoom();
    if (zoom !== 0) {
      this.zoomOffset = Math.min(
        CONFIG.camera.maxDistance - this.baseDistance,
        Math.max(CONFIG.camera.minDistance - this.baseDistance, this.zoomOffset + zoom * 0.9),
      );
    }

    if (
      this.mode === 'vehicle' &&
      context.vehicleHeading !== null &&
      this.timeSinceLook > CONFIG.camera.vehicleLookAssistDelay &&
      (context.vehicleSpeed ?? 0) > 1.2
    ) {
      this.yaw = dampAngle(this.yaw, context.vehicleHeading + Math.PI, 1.6, dt);
    }

    this.pitch = Math.min(CONFIG.camera.maxPitch, Math.max(CONFIG.camera.minPitch, this.pitch));

    const damping = this.mode === 'vehicle' ? 17 : 12;
    this._targetVector.set(target.x, target.y, target.z);
    if (!this._hasSnapped) {
      this.target.copy(this._targetVector);
      this._hasSnapped = true;
    } else {
      this.target.lerp(this._targetVector, 1 - Math.exp(-damping * dt));
    }

    const desiredDistance = this._desiredDistance();
    this._offset.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    const hit = this.physics.castRay(
      { x: this.target.x, y: this.target.y, z: this.target.z },
      { x: this._offset.x, y: this._offset.y, z: this._offset.z },
      desiredDistance,
      { excludeBodies: context.excludeBodies || [] },
    );

    const allowedDistance = hit
      ? Math.max(1.15, hit.toi - CONFIG.camera.collisionPadding)
      : desiredDistance;

    if (allowedDistance < this.currentDistance) {
      // Pull in immediately to avoid clipping through walls.
      this.currentDistance = allowedDistance;
    } else {
      this.currentDistance = damp(
        this.currentDistance,
        Math.min(desiredDistance, allowedDistance),
        5.5,
        dt,
      );
    }

    this._apply(this.target, context);

    const speed = context.speed ?? 0;
    const fovTarget =
      CONFIG.camera.fov +
      (this.mode === 'vehicle'
        ? Math.min(10, Math.max(0, (speed - 4) * 0.7))
        : Math.min(5, Math.max(0, (speed - 3) * 1.2)));
    this._fov = damp(this._fov, fovTarget, 3.5, dt);
    if (Math.abs(this.camera.fov - this._fov) > 0.01) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _desiredDistance() {
    return Math.min(
      CONFIG.camera.maxDistance,
      Math.max(CONFIG.camera.minDistance, this.baseDistance + this.zoomOffset),
    );
  }

  _apply(target, context) {
    this._offset.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    const distance = this._hasSnapped ? this.currentDistance : this._desiredDistance();
    this.camera.position.set(
      target.x + this._offset.x * distance,
      Math.max(0.35, target.y + this._offset.y * distance),
      target.z + this._offset.z * distance,
    );

    const lookAhead = context?.lookAhead;
    if (lookAhead) {
      this._lookTarget.set(
        target.x + lookAhead.x,
        target.y + lookAhead.y,
        target.z + lookAhead.z,
      );
    } else {
      this._lookTarget.set(target.x, target.y + 0.08, target.z);
    }
    this.camera.lookAt(this._lookTarget);
  }

  /** Slow establishing shot behind the title screen. */
  updateMenu(elapsed) {
    const angle = elapsed * 0.055 + 0.7;
    const radius = 96;
    this.camera.position.set(
      Math.cos(angle) * radius,
      46 + Math.sin(elapsed * 0.1) * 3,
      Math.sin(angle) * radius,
    );
    this.camera.lookAt(0, 6, 0);
    if (this.camera.fov !== 52) {
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
    }
  }
}
