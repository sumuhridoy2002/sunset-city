import { CONFIG } from '../config.js';
import { getDistrictName } from '../world/CityLayout.js';
import { Minimap } from './Minimap.js';

const moneyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * DOM HUD: health, cash, mission card, context prompt, speedometer, radar,
 * toasts and the mission-passed banner. Game logic talks to this facade rather
 * than querying the document directly.
 */
export class HUD {
  constructor() {
    const byId = (id) => {
      const element = document.getElementById(id);
      if (!element) throw new Error(`HUD element #${id} is missing from index.html.`);
      return element;
    };

    this.root = byId('hud');
    this.elements = {
      healthFill: byId('health-fill'),
      healthValue: byId('health-value'),
      moneyDisplay: byId('money-display'),
      moneyValue: byId('money-value'),
      missionCard: byId('mission-card'),
      missionTitle: byId('mission-title'),
      missionObjective: byId('mission-objective'),
      missionDistance: byId('mission-distance'),
      missionReward: byId('mission-reward'),
      missionBanner: byId('mission-banner'),
      bannerTitle: byId('banner-title'),
      bannerReward: byId('banner-reward'),
      prompt: byId('prompt'),
      promptKey: byId('prompt-key'),
      promptLabel: byId('prompt-label'),
      speedo: byId('speedo'),
      speedValue: byId('speed-value'),
      speedFill: byId('speed-fill'),
      gearValue: byId('gear-value'),
      toast: byId('toast'),
      wasted: byId('wasted'),
      minimap: byId('minimap'),
      minimapZone: byId('minimap-zone'),
      controlsHint: byId('controls-hint'),
      damageFlash: byId('damage-flash'),
    };

    this.minimap = new Minimap(this.elements.minimap);
    this.moneyCurrent = CONFIG.game.startingMoney;
    this.moneyTarget = CONFIG.game.startingMoney;
    this._lastHealthShown = null;
    this._lastHealthPercent = null;
    this._lastMissionSignature = '';
    this._lastPromptSignature = '';
    this._lastZone = '';
    this._lastSpeed = null;
    this._lastGear = '';
    this._toastTimer = 0;
    this._bannerTimer = 0;
    this._helpTimer = 0;

    this._renderMoney(true);
    this.setHealth(CONFIG.player.maxHealth, CONFIG.player.maxHealth);
  }

  show() {
    this.root.classList.remove('is-hidden');
    window.clearTimeout(this._helpTimer);
    this.elements.controlsHint.classList.remove('is-dim');
    this._helpTimer = window.setTimeout(() => {
      this.elements.controlsHint.classList.add('is-dim');
    }, 12000);
  }

  hide() {
    this.root.classList.add('is-hidden');
  }

  setHealth(value, max = CONFIG.player.maxHealth) {
    const clamped = Math.max(0, Math.min(max, value));
    const shown = Math.ceil(clamped);
    const percent = Math.round((clamped / max) * 1000) / 10;

    if (shown !== this._lastHealthShown) {
      this.elements.healthValue.textContent = String(shown);
      this._lastHealthShown = shown;
    }
    if (percent !== this._lastHealthPercent) {
      this.elements.healthFill.style.width = `${percent}%`;
      this.elements.healthFill.classList.toggle('is-low', percent <= 30);
      this._lastHealthPercent = percent;
    }
  }

  setMoney(value, { animate = true } = {}) {
    const next = Math.max(0, Math.round(value));
    const changed = next !== this.moneyTarget;
    this.moneyTarget = next;

    if (changed && animate) {
      const el = this.elements.moneyDisplay;
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    }

    if (!animate) {
      this.moneyCurrent = next;
      this._renderMoney(true);
    }
  }

  _renderMoney(force = false) {
    const shown = Math.round(this.moneyCurrent);
    if (!force && this.elements.moneyValue.textContent === String(shown)) return;
    this.elements.moneyValue.textContent = moneyFormatter.format(shown);
  }

  setMission(mission) {
    if (!mission) {
      if (this._lastMissionSignature === 'empty') return;
      this._lastMissionSignature = 'empty';
      this.elements.missionCard.classList.add('is-empty');
      this.elements.missionTitle.textContent = 'FREE ROAM';
      this.elements.missionObjective.textContent = 'Explore Sunset City';
      this.elements.missionDistance.textContent = '—';
      this.elements.missionReward.textContent = '';
      return;
    }

    const distanceLabel =
      mission.distance === null || mission.distance === undefined
        ? '— m'
        : `${Math.max(0, Math.round(mission.distance))} m`;
    const signature = `${mission.title}|${mission.objective}|${distanceLabel}|${mission.reward ?? ''}`;
    if (signature === this._lastMissionSignature) return;
    this._lastMissionSignature = signature;

    this.elements.missionCard.classList.remove('is-empty');
    this.elements.missionTitle.textContent = mission.title || 'MISSION';
    this.elements.missionObjective.textContent = mission.objective || '';
    this.elements.missionDistance.textContent = distanceLabel;
    this.elements.missionReward.textContent = mission.reward
      ? `$${moneyFormatter.format(mission.reward)}`
      : '';
  }

  setPrompt(prompt) {
    const signature = prompt ? `${prompt.key}|${prompt.label}` : 'hidden';
    if (signature === this._lastPromptSignature) return;
    this._lastPromptSignature = signature;

    if (!prompt) {
      this.elements.prompt.classList.add('is-hidden');
      return;
    }

    this.elements.promptKey.textContent = prompt.key;
    this.elements.promptLabel.textContent = prompt.label;
    this.elements.prompt.classList.remove('is-hidden');
  }

  setVehicleMode(active) {
    this.elements.speedo.classList.toggle('is-hidden', !active);
    if (!active) {
      this._lastSpeed = null;
      this._lastGear = '';
    }
  }

  setVehicleStats(speedKmh, forwardSpeed) {
    const shown = Math.round(Math.max(0, speedKmh));
    const gear = forwardSpeed < -0.5 ? 'R' : shown < 1 ? 'N' : 'D';

    if (shown !== this._lastSpeed) {
      this.elements.speedValue.textContent = String(shown);
      const percent = Math.min(100, (shown / 150) * 100);
      this.elements.speedFill.style.width = `${percent}%`;
      this._lastSpeed = shown;
    }
    if (gear !== this._lastGear) {
      this.elements.gearValue.textContent = gear;
      this._lastGear = gear;
    }
  }

  showToast(message, duration = 2300) {
    const toast = this.elements.toast;
    toast.textContent = message;
    toast.classList.add('is-shown');
    window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => toast.classList.remove('is-shown'), duration);
  }

  showMissionBanner(title, reward, duration = 3600) {
    this.elements.bannerTitle.textContent = title;
    this.elements.bannerReward.textContent = `+$${moneyFormatter.format(reward)}`;
    this.elements.missionBanner.classList.remove('is-hidden');
    window.clearTimeout(this._bannerTimer);
    this._bannerTimer = window.setTimeout(() => this.hideMissionBanner(), duration);
  }

  hideMissionBanner() {
    this.elements.missionBanner.classList.add('is-hidden');
    window.clearTimeout(this._bannerTimer);
  }

  showWasted(visible) {
    this.elements.wasted.classList.toggle('is-hidden', !visible);
  }

  flashDamage() {
    const el = this.elements.damageFlash;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  updateMinimap(state) {
    this.minimap.draw(state);
    const zone = getDistrictName(state.x, state.z);
    if (zone !== this._lastZone) {
      this.elements.minimapZone.textContent = zone;
      this._lastZone = zone;
    }
  }

  update(dt) {
    if (this.moneyCurrent !== this.moneyTarget) {
      const diff = this.moneyTarget - this.moneyCurrent;
      const step = Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 7));
      if (Math.abs(diff) <= Math.abs(step)) this.moneyCurrent = this.moneyTarget;
      else this.moneyCurrent += step;
      this._renderMoney();
    }
  }

  dispose() {
    window.clearTimeout(this._toastTimer);
    window.clearTimeout(this._bannerTimer);
    window.clearTimeout(this._helpTimer);
  }
}

