/**
 * Boot screen, pause menu and fatal-error presentation. Keeps all menu DOM
 * wiring out of the game systems.
 */
export class GameUI {
  constructor({ onStartRequested }) {
    const byId = (id) => {
      const element = document.getElementById(id);
      if (!element) throw new Error(`UI element #${id} is missing from index.html.`);
      return element;
    };

    this.onStartRequested = onStartRequested;
    this.menu = byId('menu');
    this.menuCopy = byId('menu-copy');
    this.startButton = byId('start-button');
    this.bootStatus = byId('boot-status');
    this.errorScreen = byId('error-screen');
    this.errorMessage = byId('error-message');
    this.errorDetail = byId('error-detail');
    this.reloadButton = byId('reload-button');
    this.ready = false;
    this.menuVisible = true;
    this.defaultCopy = this.menuCopy.textContent.trim();

    this._onClick = this._onClick.bind(this);
    this._onReload = this._onReload.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this.startButton.addEventListener('click', this._onClick);
    this.reloadButton.addEventListener('click', this._onReload);
    window.addEventListener('keydown', this._onKeyDown);
  }

  setStatus(message, isError = false) {
    this.bootStatus.textContent = message;
    this.bootStatus.classList.toggle('is-error', isError);
  }

  setReady() {
    this.ready = true;
    this.startButton.disabled = false;
    this.startButton.textContent = 'ENTER THE CITY';
    this.setStatus('Ready · click to lock the mouse and play');
  }

  showPaused() {
    this.ready = true;
    this.menuVisible = true;
    this.menu.classList.remove('is-hidden');
    this.startButton.disabled = false;
    this.startButton.textContent = 'RESUME';
    this.menuCopy.textContent =
      'The city can wait. Take a breath, check your job, then head back out into the golden hour.';
    this.setStatus('Paused · your progress is safe');
  }

  hide() {
    this.menuVisible = false;
    this.menu.classList.add('is-hidden');
  }

  showStartScreen() {
    this.menuVisible = true;
    this.menu.classList.remove('is-hidden');
    this.menuCopy.textContent = this.defaultCopy;
  }

  showError(message, detail = '') {
    this.menu.classList.add('is-hidden');
    this.errorMessage.textContent = message;
    this.errorDetail.textContent = detail;
    this.errorScreen.classList.remove('is-hidden');
    this.startButton.disabled = true;
  }

  hideError() {
    this.errorScreen.classList.add('is-hidden');
  }

  _onClick() {
    if (!this.ready || this.startButton.disabled) return;
    this.onStartRequested?.();
  }

  _onReload() {
    window.location.reload();
  }

  _onKeyDown(event) {
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
    if (!this.menuVisible || !this.ready || this.startButton.disabled) return;
    event.preventDefault();
    this.onStartRequested?.();
  }

  dispose() {
    this.startButton.removeEventListener('click', this._onClick);
    this.reloadButton.removeEventListener('click', this._onReload);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
