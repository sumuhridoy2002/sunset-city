import { BLOCKS, CITY } from '../world/CityLayout.js';

const TAU = Math.PI * 2;
const MAP_RANGE = 86;
const MAP_REDRAW_MS = 66;

/**
 * Rotating, circular radar drawn with Canvas 2D. The map is rendered in world
 * coordinates (blocks and building footprints), clipped to a circle, then the
 * player arrow, car blip and mission blips are drawn upright on top.
 */
export class Minimap {
  constructor(canvas) {
    if (!canvas) throw new Error('Minimap canvas is missing from the page.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Could not create the minimap 2D context.');

    this.size = canvas.width;
    this.center = this.size / 2;
    this.radius = this.center - 3;
    this.scale = this.radius / MAP_RANGE;
    this.lastDraw = -Infinity;
    this.time = 0;
  }

  draw(state, force = false) {
    const now = performance.now();
    this.time = now / 1000;
    if (!force && now - this.lastDraw < MAP_REDRAW_MS) return;
    this.lastDraw = now;

    const ctx = this.ctx;
    const size = this.size;
    const cx = this.center;
    const cy = this.center;
    const radius = this.radius;
    const heading = state.heading || 0;
    const px = state.x;
    const pz = state.z;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = '#171b17';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, TAU);
    ctx.clip();

    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(22, 28, 29, 0.96)');
    gradient.addColorStop(1, 'rgba(10, 14, 15, 0.98)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-heading);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-px, -pz);
    this._drawWorld(ctx);
    ctx.restore();

    const vignette = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
    vignette.addColorStop(0, 'rgba(4, 7, 9, 0)');
    vignette.addColorStop(1, 'rgba(4, 7, 9, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    for (const blip of state.blips || []) {
      const placed = this._project(blip.x, blip.z, px, pz, heading);
      this._drawObjective(ctx, placed.x, placed.y, placed.clamped, blip.kind);
    }

    if (state.vehicle && !state.vehicle.occupied) {
      const placed = this._project(state.vehicle.x, state.vehicle.z, px, pz, heading);
      this._drawVehicleBlip(ctx, placed.x, placed.y, placed.clamped, state.vehicle.heading - heading);
    }

    this._drawPlayerArrow(ctx, cx, cy);

    const northX = cx - Math.sin(heading) * (radius - 15);
    const northY = cy - Math.cos(heading) * (radius - 15);
    ctx.beginPath();
    ctx.arc(northX, northY, 8, 0, TAU);
    ctx.fillStyle = 'rgba(10, 13, 17, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(242, 194, 105, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f2c269';
    ctx.font = '700 9px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', northX, northY + 0.5);

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, TAU);
    ctx.strokeStyle = 'rgba(235, 229, 212, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  _drawWorld(ctx) {
    const half = CITY.asphaltExtent;

    ctx.fillStyle = '#1a2118';
    ctx.fillRect(-320, -320, 640, 640);
    ctx.fillStyle = '#16191d';
    ctx.fillRect(-half, -half, half * 2, half * 2);

    for (const block of BLOCKS) {
      const x = block.center.x - CITY.blockSize / 2;
      const z = block.center.z - CITY.blockSize / 2;
      ctx.fillStyle = block.type === 'park' ? '#33523b' : '#3a3f45';
      ctx.fillRect(x, z, CITY.blockSize, CITY.blockSize);
      ctx.strokeStyle = 'rgba(235, 231, 217, 0.14)';
      ctx.lineWidth = 0.55;
      ctx.strokeRect(x, z, CITY.blockSize, CITY.blockSize);

      if (block.type === 'park') {
        ctx.strokeStyle = 'rgba(203, 191, 163, 0.5)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(block.center.x, block.center.z - 14);
        ctx.lineTo(block.center.x, block.center.z + 14);
        ctx.moveTo(block.center.x - 14, block.center.z);
        ctx.lineTo(block.center.x + 14, block.center.z);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(block.center.x, block.center.z, 3.4, 0, TAU);
        ctx.fillStyle = '#4b8a90';
        ctx.fill();
        continue;
      }

      for (const building of block.buildings) {
        ctx.fillStyle = 'rgba(23, 26, 31, 0.88)';
        ctx.fillRect(
          building.x - building.width / 2,
          building.z - building.depth / 2,
          building.width,
          building.depth,
        );
      }
    }

    ctx.strokeStyle = 'rgba(219, 190, 112, 0.18)';
    ctx.lineWidth = 0.32;
    for (const value of CITY.roadCenters) {
      ctx.beginPath();
      ctx.moveTo(-half, value);
      ctx.lineTo(half, value);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(value, -half);
      ctx.lineTo(value, half);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(220, 214, 199, 0.14)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-half, -half, half * 2, half * 2);
  }

  _project(wx, wz, px, pz, heading) {
    const dx = wx - px;
    const dz = wz - pz;
    const cos = Math.cos(-heading);
    const sin = Math.sin(-heading);
    let x = (dx * cos - dz * sin) * this.scale;
    let y = (dx * sin + dz * cos) * this.scale;
    const distance = Math.hypot(x, y);
    const max = this.radius - 14;
    let clamped = false;
    if (distance > max) {
      const ratio = max / distance;
      x *= ratio;
      y *= ratio;
      clamped = true;
    }
    return { x: this.center + x, y: this.center + y, clamped };
  }

  _drawObjective(ctx, x, y, clamped, kind = 'objective') {
    const pulse = 0.5 + Math.sin(this.time * 4.2) * 0.5;
    const gold = kind === 'contact' ? '#74d9ff' : '#ffbb4d';
    const ringColor =
      kind === 'contact'
        ? `rgba(116, 217, 255, ${clamped ? 0.12 : 0.22})`
        : `rgba(255, 187, 77, ${clamped ? 0.12 : 0.22})`;

    ctx.beginPath();
    ctx.arc(x, y, 11 + pulse * 4, 0, TAU);
    ctx.fillStyle = ringColor;
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.65;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = gold;
    ctx.fillRect(-5.6, -5.6, 11.2, 11.2);
    ctx.strokeStyle = 'rgba(15, 18, 22, 0.9)';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-5.6, -5.6, 11.2, 11.2);
    ctx.restore();
  }

  _drawVehicleBlip(ctx, x, y, clamped, angle) {
    if (clamped) {
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, TAU);
      ctx.fillStyle = '#74d5c3';
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 13, 16, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#74d5c3';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 13, 16, 0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  _drawPlayerArrow(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#f8f3e8';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(15, 18, 22, 0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
}

