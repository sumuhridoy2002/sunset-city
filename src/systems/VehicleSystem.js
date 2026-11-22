import { CONFIG } from '../config.js';

/**
 * Coordinates the player and the car: proximity prompts, entering/exiting,
 * camera/HUD notifications and vehicle resets. Neither entity knows about the
 * other, which keeps both reusable.
 */
export class VehicleSystem {
  constructor({ physics, player, vehicle }) {
    this.physics = physics;
    this.player = player;
    this.vehicle = vehicle;
    this.isDriving = false;
    this.prompt = null;
    this.callbacks = {
      onEnter: null,
      onExit: null,
      onPrompt: null,
      onToast: null,
    };
  }

  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }

  update(dt, input) {
    if (input.consume('KeyE')) {
      if (this.isDriving) this._tryExit();
      else this._tryEnter();
    }

    if (input.consume('KeyR') && this.isDriving) {
      this.vehicle.reset();
      this.callbacks.onToast?.('Vehicle reset to the nearest road');
    }

    const position = this.vehicle.getPosition();
    if (position.y < -8 || Math.abs(position.x) > 155 || Math.abs(position.z) > 155) {
      this.vehicle.reset();
      this.callbacks.onToast?.('Recovered the vehicle');
    }

    this.vehicle.update(dt, input, this.isDriving);
    this._updatePrompt();
  }

  _tryEnter() {
    if (this.isDriving || this.player.dead || !this.player.active) return;
    const foot = this.player.getFootPosition();
    const distance = this.vehicle.getDoorDistance(foot);
    if (distance > CONFIG.vehicle.enterPadding) return;

    if (Math.abs(this.vehicle.getForwardSpeed()) > 7) {
      this.callbacks.onToast?.('The car is moving too fast');
      return;
    }

    this.isDriving = true;
    this.vehicle.setOccupied(true);
    this.player.setActive(false);
    this.callbacks.onEnter?.(this.vehicle);
    this._updatePrompt();
  }

  _tryExit() {
    if (!this.isDriving) return;
    if (this.vehicle.getSpeedKmh() > CONFIG.vehicle.exitMaxSpeed * 3.6) {
      this.callbacks.onToast?.('Slow down before exiting');
      return;
    }

    const candidates = this.vehicle.getExitCandidates();
    let exit = null;

    for (const candidate of candidates) {
      const world = candidate.world;
      const groundY = this._groundAt(world.x, world.z);
      const clear = this.physics.isPositionClear(
        { x: world.x, y: groundY + 1.0, z: world.z },
        0.33,
        { excludeBodies: [this.vehicle.body, this.player.body] },
      );
      if (clear) {
        exit = {
          x: world.x,
          z: world.z,
          bodyY: groundY + this.player.feetOffset + 0.07,
        };
        break;
      }
    }

    if (!exit) {
      const fallback = candidates[0].world;
      const groundY = this._groundAt(fallback.x, fallback.z);
      exit = {
        x: fallback.x,
        z: fallback.z,
        bodyY: groundY + this.player.feetOffset + 0.07,
      };
    }

    const carPosition = this.vehicle.getPosition();
    const outwardX = exit.x - carPosition.x;
    const outwardZ = exit.z - carPosition.z;
    const yaw = Math.atan2(-outwardX, -outwardZ);

    this.isDriving = false;
    this.vehicle.setOccupied(false);
    this.player.teleport(exit.x, exit.bodyY, exit.z, yaw);
    this.callbacks.onExit?.(this.player);
    this._updatePrompt();
  }

  _groundAt(x, z) {
    const hit = this.physics.castRay(
      { x, y: 24, z },
      { x: 0, y: -1, z: 0 },
      40,
      { excludeBodies: [this.vehicle.body, this.player.body] },
    );
    return hit ? hit.point.y : 0;
  }

  _updatePrompt() {
    let next = null;

    if (this.isDriving) {
      next = this.vehicle.isFlipped()
        ? { key: 'R', label: 'Reset vehicle' }
        : { key: 'E', label: 'Exit vehicle' };
    } else if (!this.player.dead) {
      const distance = this.vehicle.getDoorDistance(this.player.getFootPosition());
      if (distance <= CONFIG.vehicle.enterPadding) {
        next = { key: 'E', label: 'Enter vehicle' };
      }
    }

    const changed =
      (next?.key ?? null) !== (this.prompt?.key ?? null) ||
      (next?.label ?? null) !== (this.prompt?.label ?? null);

    if (changed) {
      this.prompt = next;
      this.callbacks.onPrompt?.(next);
    }
  }

  getCameraTarget() {
    return this.isDriving ? this.vehicle.getCameraTarget() : this.player.getCameraTarget();
  }

  getState() {
    return {
      driving: this.isDriving,
      prompt: this.prompt ? { ...this.prompt } : null,
      vehicle: this.vehicle.getState(),
      player: this.player.getState(),
    };
  }
}
