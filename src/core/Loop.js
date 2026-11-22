/**
 * Fixed-timestep game loop with an accumulator. Physics receives a stable dt,
 * rendering happens once per animation frame.
 */
export class GameLoop {
  constructor({ update, render, fixedDt = 1 / 60, maxSubSteps = 5, maxFrameDt = 0.1 }) {
    this.update = update;
    this.render = render;
    this.fixedDt = fixedDt;
    this.maxSubSteps = maxSubSteps;
    this.maxFrameDt = maxFrameDt;
    this.accumulator = 0;
    this.lastTime = 0;
    this.rafId = 0;
    this.running = false;
    this.paused = false;
    this.elapsed = 0;

    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.accumulator = 0;
    this.lastTime = performance.now();
  }

  _tick(now) {
    if (!this.running) return;

    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0), this.maxFrameDt);

    if (!this.paused) {
      this.elapsed += dt;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
        this.update(this.fixedDt);
        this.accumulator -= this.fixedDt;
        steps += 1;
      }
      // Avoid a perpetual debt spiral after long stalls/tab switches.
      if (steps === this.maxSubSteps) this.accumulator = 0;
    }

    this.render(dt, this.paused ? 0 : this.accumulator / this.fixedDt);
    this.rafId = requestAnimationFrame(this._tick);
  }
}
