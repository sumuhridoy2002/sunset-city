/**
 * Thin input layer: keyboard state, edge-triggered actions, pointer-lock mouse
 * look, drag-to-look fallback and camera zoom.
 */
export class Input {
  constructor(domElement) {
    if (!domElement) throw new Error('Input requires a DOM element for pointer handling.');
    this.domElement = domElement;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    this.zoomDelta = 0;
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.pointerLocked = false;
    this.onPointerLockChange = null;
    this.onPointerLockError = null;
    this.enabled = true;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onPointerLockError = this._onPointerLockError.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);

    this.attach();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('pointerlockerror', this._onPointerLockError);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('wheel', this._onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  _onKeyDown(event) {
    if (!this.enabled) return;

    const blocked = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (blocked.includes(event.code)) event.preventDefault();

    if (!this.keys.has(event.code)) this.pressedKeys.add(event.code);
    this.keys.add(event.code);
  }

  _onKeyUp(event) {
    this.keys.delete(event.code);
  }

  _onMouseMove(event) {
    if (!this.enabled) return;
    if (!this.pointerLocked && !this.dragging) return;

    let dx;
    let dy;
    if (this.pointerLocked) {
      dx = event.movementX || 0;
      dy = event.movementY || 0;
    } else {
      dx = event.clientX - this.lastPointer.x;
      dy = event.clientY - this.lastPointer.y;
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
    }

    this.mouseDelta.x += dx;
    this.mouseDelta.y += dy;
  }

  _onPointerDown(event) {
    if (!this.enabled || event.button !== 0) return;
    if (!this.pointerLocked) {
      this.dragging = true;
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
      this.domElement.setPointerCapture?.(event.pointerId);
    }
  }

  _onPointerUp() {
    this.dragging = false;
  }

  _onWheel(event) {
    if (!this.enabled) return;
    event.preventDefault();
    this.zoomDelta += Math.sign(event.deltaY);
  }

  _onContextMenu(event) {
    event.preventDefault();
  }

  _onPointerLockChange() {
    const locked = document.pointerLockElement === this.domElement;
    const changed = locked !== this.pointerLocked;
    this.pointerLocked = locked;
    if (locked) this.dragging = false;
    if (changed) this.onPointerLockChange?.(locked);
  }

  _onPointerLockError() {
    this.pointerLocked = false;
    this.onPointerLockError?.();
  }

  _onBlur() {
    this.keys.clear();
    this.pressedKeys.clear();
    this.dragging = false;
  }

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  /** Consume a one-shot key press (survives across fixed physics steps). */
  consume(code) {
    if (!this.pressedKeys.has(code)) return false;
    this.pressedKeys.delete(code);
    return true;
  }

  consumeMouseDelta() {
    const delta = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  consumeZoom() {
    const delta = this.zoomDelta;
    this.zoomDelta = 0;
    return delta;
  }

  getMoveAxis() {
    return {
      x: (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0),
      z: (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0),
    };
  }

  isRunning() {
    return this.isDown('ShiftLeft', 'ShiftRight');
  }

  clearTransient() {
    this.pressedKeys.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this.zoomDelta = 0;
    this.dragging = false;
  }

  clearPressedKeys() {
    this.pressedKeys.clear();
  }

  requestPointerLock() {
    if (document.pointerLockElement === this.domElement) return;
    try {
      const result = this.domElement.requestPointerLock();
      if (result && typeof result.catch === 'function') {
        result.catch((error) => this.onPointerLockError?.(error));
      }
    } catch (error) {
      this.onPointerLockError?.(error);
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.domElement) document.exitPointerLock();
  }

  dispose() {
    this.enabled = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('pointerlockerror', this._onPointerLockError);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.keys.clear();
    this.pressedKeys.clear();
  }
}

