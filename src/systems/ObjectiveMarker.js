import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  TorusGeometry,
} from 'three';

const COLORS = {
  contact: new Color(0x74d9ff),
  objective: new Color(0xffbb4d),
};

/**
 * A reusable objective beacon: glowing ground ring, light beam and rotating
 * floating diamond. Rendered with unlit additive materials so it reads clearly
 * in the warm dusk lighting.
 */
export class ObjectiveMarker {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.name = 'objective-marker';
    this.group.visible = false;
    this.scene.add(this.group);
    this.time = 0;
    this.kind = null;

    this._geometries = new Set();
    this._materials = new Set();

    this.ringMaterial = this._basicMaterial({ opacity: 0.9 });
    this.discMaterial = this._basicMaterial({ opacity: 0.09 });
    this.beamMaterial = this._basicMaterial({ opacity: 0.11 });
    this.diamondMaterial = this._basicMaterial({ opacity: 0.95 });

    const ringGeometry = this._track(new TorusGeometry(1.75, 0.055, 8, 52));
    this.ring = new Mesh(ringGeometry, this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.group.add(this.ring);

    const discGeometry = this._track(new CircleGeometry(1.72, 40));
    this.disc = new Mesh(discGeometry, this.discMaterial);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.03;
    this.group.add(this.disc);

    const beamGeometry = this._track(new CylinderGeometry(0.5, 0.92, 6.2, 18, 1, true));
    this.beam = new Mesh(beamGeometry, this.beamMaterial);
    this.beam.position.y = 3.1;
    this.group.add(this.beam);

    const diamondGeometry = this._track(new OctahedronGeometry(0.3, 0));
    this.diamond = new Mesh(diamondGeometry, this.diamondMaterial);
    this.diamond.position.y = 2.9;
    this.group.add(this.diamond);

    this.setKind('objective');
  }

  _track(geometry) {
    this._geometries.add(geometry);
    return geometry;
  }

  _basicMaterial({ opacity = 1 } = {}) {
    const material = new MeshBasicMaterial({
      color: 0xf2c269,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      side: DoubleSide,
    });
    this._materials.add(material);
    return material;
  }

  setKind(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    const color = COLORS[kind] || COLORS.objective;
    for (const material of this._materials) material.color.copy(color);
  }

  show(x, z, ground = 0, kind = 'objective') {
    this.setKind(kind);
    this.group.position.set(x, ground + 0.02, z);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 3.4) * 0.045;
    this.ring.scale.set(pulse, pulse, pulse);
    this.beamMaterial.opacity = 0.08 + (Math.sin(this.time * 2.1) * 0.5 + 0.5) * 0.06;
    this.diamond.rotation.y += dt * 1.6;
    this.diamond.position.y = 2.9 + Math.sin(this.time * 2.2) * 0.14;
    this.discMaterial.opacity = 0.06 + (Math.sin(this.time * 3.4) * 0.5 + 0.5) * 0.06;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.clear();
    for (const geometry of this._geometries) geometry.dispose();
    for (const material of this._materials) material.dispose();
    this._geometries.clear();
    this._materials.clear();
  }
}
