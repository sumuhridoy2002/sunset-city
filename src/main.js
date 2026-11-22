import './styles/main.css';
import { Game } from './core/Game.js';
import { GameUI } from './ui/UI.js';

let game = null;

const ui = new GameUI({
  onStartRequested: () => {
    game?.start();
  },
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Sunset City] Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  // Runtime errors are also surfaced by the game loop; keep the native console
  // message intact for debugging while avoiding duplicate fatal screens.
  console.error('[Sunset City] Window error:', event.error || event.message);
});

async function boot() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('The #game-canvas element could not be found.');

  ui.setStatus('Starting the physics engine…');
  game = new Game({ canvas, ui });
  window.__game = game;

  await game.init();
  ui.setReady();
}

boot().catch((error) => {
  console.error('[Sunset City] Failed to start:', error);
  ui.showError(
    'The city could not be loaded. Check the browser console for details, then try again.',
    error?.stack || String(error),
  );
});
