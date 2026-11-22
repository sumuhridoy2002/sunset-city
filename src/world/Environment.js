import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG, PALETTE } from '../config.js';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  varying vec3 vDirection;

  void main() {
    float height = clamp(vDirection.y, 0.0, 1.0);
    vec3 sky = mix(uHorizonColor, uTopColor, pow(height, 0.3));

    float warmth = exp(-height * 11.0);
    sky = mix(sky, uHorizonColor * 1.06, warmth * 0.34);

    float sunAmount = max(dot(vDirection, uSunDirection), 0.0);
    sky += uSunColor * (pow(sunAmount, 14.0) * 0.25 + pow(sunAmount, 190.0) * 1.5);

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Handles the late-afternoon atmosphere: gradient sky, sun, fog, shadows and
 * image-based lighting. The sun's shadow frustum follows the player so a modest
 * 2048px shadow map covers the area that matters.
 */
export class Environment {
  constructor({ scene, renderer }) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunOffset = new Vector3(-62, 72, 78);
    this.sunDirection = this.sunOffset.clone().normalize();
    this.environmentTarget = null;
    this._buildSky();
    this._buildLights();
    this._buildEnvironmentMap();
  }

  _buildSky() {
    this.skyMaterial = new ShaderMaterial({
      uniforms: {
        uTopColor: { value: new Color(PALETTE.skyTop) },
        uHorizonColor: { value: new Color(PALETTE.skyHorizon) },
        uSunColor: { value: new Color(PALETTE.sun) },
        uSunDirection: { value: this.sunDirection.clone() },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });

    this.sky = new Mesh(new SphereGeometry(480, 32, 20), this.skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _buildLights() {
    this.scene.fog = new Fog(PALETTE.fog, 100, 390);

    this.hemisphere = new HemisphereLight(0xb9d4ef, 0x77624b, 0.68);
    this.scene.add(this.hemisphere);

    this.sun = new DirectionalLight(0xffd6a7, 3.65);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(CONFIG.renderer.shadowMapSize, CONFIG.renderer.shadowMapSize);
    this.sun.shadow.camera.near = 8;
    this.sun.shadow.camera.far = 240;
    this.sun.shadow.camera.left = -62;
    this.sun.shadow.camera.right = 62;
    this.sun.shadow.camera.top = 72;
    this.sun.shadow.camera.bottom = -62;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new DirectionalLight(0x8fb3dc, 0.3);
    this.fill.position.set(55, 38, -60);
    this.scene.add(this.fill);
  }

  _buildEnvironmentMap() {
    try {
      const pmrem = new PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      const room = new RoomEnvironment();
      this.environmentTarget = pmrem.fromScene(room, 0.04);
      this.scene.environment = this.environmentTarget.texture;
      this.scene.environmentIntensity = 0.44;
      pmrem.dispose();
    } catch (error) {
      // IBL is a nice-to-have. The game remains fully lit without it.
      console.warn('[Environment] Image-based lighting unavailable:', error);
    }
  }

  /** Keeps the sky dome and shadow frustum anchored around the action. */
  update(focusPosition, cameraPosition) {
    this.sky.position.set(cameraPosition.x, 0, cameraPosition.z);

    const focus = focusPosition || { x: 0, z: 0 };
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.set(
      focus.x + this.sunOffset.x,
      this.sunOffset.y,
      focus.z + this.sunOffset.z,
    );
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  dispose() {
    this.scene.remove(this.sky);
    this.sky.geometry.dispose();
    this.skyMaterial.dispose();
    this.scene.remove(this.sun, this.sun.target, this.hemisphere, this.fill);
    this.sun.shadow.dispose();
    if (this.environmentTarget) this.environmentTarget.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
  }
}
