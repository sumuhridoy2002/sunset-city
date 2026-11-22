import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CONFIG } from '../config.js';
import { Input } from './Input.js';
import { GameLoop } from './Loop.js';
import { Physics } from './Physics.js';
import { Player } from '../entities/Player.js';
import { Vehicle } from '../entities/Vehicle.js';
import { CameraRig } from '../systems/CameraRig.js';
import { HUD } from '../systems/HUD.js';
import { MissionSystem } from '../systems/MissionSystem.js';
import { VehicleSystem } from '../systems/VehicleSystem.js';
import { City } from '../world/City.js';
import { CITY_LAYOUT } from '../world/CityLayout.js';
import { Environment } from '../world/Environment.js';
import { WorldMaterials } from '../world/Materials.js';

const now = () => performance.now();

/**
 * Composition root. Creates every system, owns the fixed-step update orchestration
 * and handles start/pause/respawn/error flows. Gameplay logic lives in the
 * dedicated modules; this file only wires them together.
 */
export class Game {
  constructor({ canvas, ui }) {
    if (!canvas) throw new Error('Game requires the viewport canvas.');
    if (!ui) throw new Error('Game requires the UI controller.');
    this.canvas = canvas;
    this.ui = ui;
    this.layout = CITY_LAYOUT;
    this.ready = false;
    this.started = false;
    this.paused = false;
    this.fatal = false;
    this.money = CONFIG.game.startingMoney;
    this.elapsed = 0;
    this.deathPending = false;
    this.respawnTimer = 0;
    this._hasLockedOnce = false;
    this._lockHintShown = false;
    this._forward = new Vector3();
    this._lookAhead = new Vector3();

    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._onContextLost = this._onContextLost.bind(this);
    this._onCanvasPointerDown = this._onCanvasPointerDown.bind(this);
    this._fixedUpdate = this._fixedUpdate.bind(this);
    this._render = this._render.bind(this);
  }

  async init() {
    this.ui.setStatus('Starting the physics engine…');
    await this._nextFrame();
    this.physics = await Physics.create();

    this._createRenderer();
    this._createScene();
    this.input = new Input(this.canvas);
    this.hud = new HUD();

    this.ui.setStatus('Paving streets and raising buildings…');
    await this._nextFrame();
    this.environment = new Environment({ scene: this.scene, renderer: this.renderer });
    this.materials = new WorldMaterials(this.renderer);
    this.city = new City({
      scene: this.scene,
      physics: this.physics,
      materials: this.materials,
    }).build();

    this.ui.setStatus('Warming up the car…');
    await this._nextFrame();
    this.player = new Player({ scene: this.scene, physics: this.physics });
    this.vehicle = new Vehicle({
      scene: this.scene,
      physics: this.physics,
      spawn: CONFIG.vehicle.spawn,
    });
    this.cameraRig = new CameraRig({
      camera: this.camera,
      physics: this.physics,
      input: this.input,
    });
    this.vehicleSystem = new VehicleSystem({
      physics: this.physics,
      player: this.player,
      vehicle: this.vehicle,
    });

    this._wireSystems();

    this.missionSystem = new MissionSystem({
      scene: this.scene,
      hud: this.hud,
      vehicleSystem: this.vehicleSystem,
      onReward: (amount) => {
        this.money += amount;
        this.hud.setMoney(this.money);
      },
    });

    this.loop = new GameLoop({
      update: this._fixedUpdate,
      render: this._render,
      fixedDt: CONFIG.loop.fixedDt,
      maxSubSteps: CONFIG.loop.maxSubSteps,
      maxFrameDt: CONFIG.loop.maxFrameDt,
    });

    this._bindEvents();
    this.environment.update({ x: 0, z: 0 }, this.camera.position);
    this.loop.start();
    this.loop.setPaused(true);
    this.ready = true;
    this.ui.setStatus('Ready');
  }

  _nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  _createRenderer() {
    try {
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (error) {
      throw new Error(
        `WebGL could not start. A browser with WebGL 2 support and hardware acceleration is required. (${error.message})`,
      );
    }

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, CONFIG.renderer.pixelRatioCap),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.renderer.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
  }

  _createScene() {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      CONFIG.camera.fov,
      window.innerWidth / Math.max(1, window.innerHeight),
      CONFIG.camera.near,
      CONFIG.camera.far,
    );
    this.camera.position.set(90, 48, 90);
    this.camera.lookAt(0, 6, 0);
  }

  _wireSystems() {
    this.vehicleSystem.setCallbacks({
      onEnter: () => {
        this.cameraRig.setMode('vehicle', { vehicleHeading: this.vehicle.getHeading() });
        this.hud.setVehicleMode(true);
        this.hud.showToast('SPACE handbrake · SHIFT boost · R reset', 3000);
      },
      onExit: () => {
        this.cameraRig.setMode('foot');
        this.hud.setVehicleMode(false);
      },
      onPrompt: (prompt) => this.hud.setPrompt(prompt),
      onToast: (message) => this.hud.showToast(message),
    });

    this.player.onDamage = (_amount, health) => {
      this.hud.setHealth(health);
      this.hud.flashDamage();
    };
    this.player.onDeath = () => this._handlePlayerDeath();

    this.input.onPointerLockChange = (locked) => this._onPointerLockChange(locked);
    this.input.onPointerLockError = () => {
      if (this._lockHintShown) return;
      this._lockHintShown = true;
      this.hud.showToast('Mouse lock unavailable — drag anywhere in the world to look around', 3800);
    };
  }

  _bindEvents() {
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    this.canvas.addEventListener('webglcontextlost', this._onContextLost);
    this.canvas.addEventListener('pointerdown', this._onCanvasPointerDown);
  }

  _onResize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, CONFIG.renderer.pixelRatioCap),
    );
    this.renderer.setSize(width, height, false);
  }

  _onVisibility() {
    if (document.hidden && this.started && !this.paused) this.pause();
  }

  _onContextLost(event) {
    event.preventDefault();
    this._fail(new Error('The WebGL context was lost. Reload the page to restart the city.'));
  }

  _onCanvasPointerDown() {
    if (!this.started || this.paused || this.fatal) return;
    if (!this.input.pointerLocked) this.input.requestPointerLock();
  }

  _onPointerLockChange(locked) {
    if (locked) {
      this._hasLockedOnce = true;
      return;
    }
    if (this.started && !this.paused && this._hasLockedOnce) {
      this.pause();
    }
  }

  start() {
    if (!this.ready || this.fatal) return;

    if (this.started) {
      if (this.paused) this.resume();
      return;
    }

    this.started = true;
    this.paused = false;
    this.loop.setPaused(false);
    this.ui.hide();
    this.hud.show();
    this.hud.setMoney(this.money, { animate: false });
    this.hud.setHealth(this.player.health);
    this.hud.setVehicleMode(false);
    this.cameraRig.setMode('foot');
    this.cameraRig.snap(this.player.getCameraTarget());
    this.missionSystem.start();
    this.input.clearTransient();
    this.input.requestPointerLock();
  }

  pause() {
    if (!this.started || this.paused || this.fatal) return;
    this.paused = true;
    this.loop.setPaused(true);
    this.input.clearTransient();
    this.input.exitPointerLock();
    this.hud.hide();
    this.ui.showPaused();
  }

  resume() {
    if (!this.started || !this.paused || this.fatal) return;
    this.paused = false;
    this.loop.setPaused(false);
    this.ui.hide();
    this.hud.show();
    this.input.clearTransient();
    this.input.requestPointerLock();
  }

  _fixedUpdate(dt) {
    if (!this.started || this.paused || this.fatal) return;
    try {
      this.vehicleSystem.update(dt, this.input);

      if (!this.vehicleSystem.isDriving) {
        this.player.update(dt, this.input, this.cameraRig.yaw);
      }

      this.physics.step();
      this.vehicle.syncMesh();
      this.player.syncMesh();

      if (!this.player.dead && !this.vehicleSystem.isDriving) {
        const foot = this.player.getFootPosition();
        if (foot.y < -12) this.player.takeDamage(999, 'void');
      }

      if (this.deathPending) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this._respawnPlayer();
      }

      this.missionSystem.update(dt, this._buildMissionContext());
      this.input.clearPressedKeys();
    } catch (error) {
      this._fail(error);
    }
  }

  _buildMissionContext() {
    return {
      isDriving: this.vehicleSystem.isDriving,
      playerPosition: this.player.getFootPosition(),
      vehiclePosition: this.vehicle.getPosition(),
      vehicleSpeedKmh: Math.abs(this.vehicle.getForwardSpeed()) * 3.6,
    };
  }

  _handlePlayerDeath() {
    if (this.deathPending) return;
    this.deathPending = true;
    this.respawnTimer = CONFIG.game.respawnDelay;
    this.hud.setHealth(0);
    this.hud.showWasted(true);
    this.hud.setPrompt(null);
  }

  _respawnPlayer() {
    this.deathPending = false;
    this.hud.showWasted(false);
    this.player.respawn();
    this.hud.setHealth(this.player.health);
    this.cameraRig.setMode('foot');
    this.cameraRig.snap(this.player.getCameraTarget());
    this.hud.showToast('Back on your feet', 2200);
  }

  _render(dt) {
    if (this.fatal) return;
    try {
      if (!this.started) {
        const t = now() / 1000;
        this.cameraRig.updateMenu(t);
        this.environment.update({ x: 0, z: 0 }, this.camera.position);
        this.city.update(dt, t);
        this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.paused) {
        this.renderer.render(this.scene, this.camera);
        return;
      }

      this.elapsed += dt;
      const driving = this.vehicleSystem.isDriving;
      const vehicleSpeed = Math.abs(this.vehicle.getForwardSpeed());

      let target;
      let playerHeading;
      if (driving) {
        target = this.vehicle.getCameraTarget();
        this._forward.set(0, 0, 1).applyQuaternion(this.vehicle.getQuaternion());
        playerHeading = Math.atan2(this._forward.x, -this._forward.z);
        this._lookAhead.set(this._forward.x * 2.4, 0.32, this._forward.z * 2.4);
      } else {
        target = this.player.getCameraTarget();
        playerHeading = -this.player.facingYaw;
        this._lookAhead.set(0, 0.06, 0);
      }

      this.cameraRig.update(dt, {
        target,
        mode: driving ? 'vehicle' : 'foot',
        vehicleHeading: driving ? this.vehicle.getHeading() : null,
        speed: driving ? vehicleSpeed : this.player.getSpeed(),
        excludeBodies: [this.player.body, this.vehicle.body],
        lookAhead: this._lookAhead,
      });

      const focus = driving ? this.vehicle.getPosition() : this.player.getFootPosition();
      this.environment.update(focus, this.camera.position);
      this.city.update(dt, this.elapsed);

      this.hud.update(dt);
      this.hud.setHealth(this.player.health);
      if (driving) {
        this.hud.setVehicleStats(this.vehicle.getSpeedKmh(), this.vehicle.getForwardSpeed());
      }

      this._updateMinimap(driving, playerHeading);
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this._fail(error);
    }
  }

  _updateMinimap(driving, playerHeading) {
    const position = driving ? this.vehicle.getPosition() : this.player.getFootPosition();
    this._forward.set(0, 0, 1).applyQuaternion(this.vehicle.getQuaternion());
    const vehicleHeading = Math.atan2(this._forward.x, -this._forward.z);

    this.hud.updateMinimap({
      x: position.x,
      z: position.z,
      heading: playerHeading,
      vehicle: {
        x: this.vehicle.getPosition().x,
        z: this.vehicle.getPosition().z,
        heading: vehicleHeading,
        occupied: driving,
      },
      blips: this.missionSystem.getBlips(),
    });
  }

  _fail(error) {
    if (this.fatal) return;
    this.fatal = true;
    console.error('[Sunset City] Fatal runtime error:', error);
    this.loop?.setPaused(true);
    this.input?.exitPointerLock();
    this.hud?.hide();
    this.ui.showError(
      'The game hit a runtime error and had to stop.',
      error?.stack || String(error),
    );
  }

  getDebugState() {
    return {
      ready: this.ready,
      started: this.started,
      paused: this.paused,
      fatal: this.fatal,
      money: this.money,
      elapsed: Math.round(this.elapsed * 100) / 100,
      player: this.player?.getState(),
      vehicle: this.vehicle?.getState(),
      driving: this.vehicleSystem?.isDriving ?? false,
      mission: this.missionSystem?.getState(),
      city: this.city?.getStats(),
      physics: this.physics?.getStats(),
      render: this.renderer
        ? {
            calls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
            geometries: this.renderer.info.memory.geometries,
            textures: this.renderer.info.memory.textures,
          }
        : null,
      camera: {
        yaw: Math.round((this.cameraRig?.yaw ?? 0) * 100) / 100,
        pitch: Math.round((this.cameraRig?.pitch ?? 0) * 100) / 100,
      },
    };
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('pointerdown', this._onCanvasPointerDown);
    this.loop?.stop();
    this.input?.dispose();
    this.hud?.dispose();
    this.missionSystem?.dispose();
    this.player?.dispose();
    this.vehicle?.dispose();
    this.city?.dispose();
    this.environment?.dispose();
    this.materials?.dispose();
    this.renderer?.dispose();
    this.physics?.dispose();
  }
}



