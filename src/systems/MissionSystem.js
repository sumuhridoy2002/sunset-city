import { MISSION } from '../world/CityLayout.js';
import { ObjectiveMarker } from './ObjectiveMarker.js';

export const MISSIONS = [
  {
    id: 'repo-run',
    title: 'Repo Run',
    reward: 1500,
    steps: [
      {
        type: 'reach',
        label: 'Meet the fixer in Memorial Park',
        target: MISSION.contact,
        radius: 3.6,
        onFoot: true,
        markerKind: 'contact',
      },
      { type: 'enter-vehicle', label: 'Take the parked green sedan', markerKind: 'objective' },
      {
        type: 'drive',
        label: 'Deliver the car to Dock 12 — stop inside the marker',
        target: MISSION.dropoff,
        radius: 6.4,
        requireStop: true,
        markerKind: 'objective',
      },
    ],
  },
  {
    id: 'line-runner',
    title: 'Line Runner',
    reward: 900,
    steps: [
      { type: 'enter-vehicle', label: 'Get back behind the wheel', markerKind: 'objective' },
      {
        type: 'drive',
        label: 'Hit the northside checkpoint',
        target: MISSION.checkpoints[0],
        radius: 5.6,
        markerKind: 'objective',
      },
      {
        type: 'drive',
        label: 'Swing through the west loop',
        target: MISSION.checkpoints[1],
        radius: 5.6,
        markerKind: 'objective',
      },
      {
        type: 'drive',
        label: 'Finish the run at the market',
        target: MISSION.checkpoints[2],
        radius: 5.6,
        markerKind: 'objective',
      },
    ],
  },
];

const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Data-driven objective runner. Steps only know how to describe themselves and
 * how to be completed; the system handles markers, HUD text, money, success
 * banners and the hand-off between missions.
 */
export class MissionSystem {
  constructor({ scene, hud, vehicleSystem, onReward }) {
    this.hud = hud;
    this.vehicleSystem = vehicleSystem;
    this.onReward = onReward;
    this.marker = new ObjectiveMarker(scene);
    this.state = 'idle';
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.intermission = 0;
    this.elapsed = 0;
    this.currentTarget = null;
    this.currentDistance = null;
  }

  get mission() {
    return MISSIONS[this.missionIndex] || null;
  }

  get step() {
    return this.mission?.steps[this.stepIndex] || null;
  }

  start() {
    if (this.state !== 'idle') return;
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.state = 'active';
    this.hud.showToast(`NEW JOB · ${this.mission.title}`, 3000);
    if (this._lastContext) this._refresh(this._lastContext);
  }

  update(dt, context) {
    this._lastContext = context;
    this.elapsed += dt;
    this.marker.update(dt);

    if (this.state === 'intermission') {
      this.intermission -= dt;
      if (this.intermission <= 0) this._startNextMission();
      return;
    }

    if (this.state !== 'active') return;

    const step = this.step;
    if (!step) return;
    const target = this._resolveTarget(step, context);
    if (!target) return;

    let completed = false;
    if (step.type === 'reach') {
      const distance = distance2D(context.playerPosition, target);
      if ((!step.onFoot || !context.isDriving) && distance <= step.radius) completed = true;
    } else if (step.type === 'enter-vehicle') {
      if (context.isDriving) completed = true;
    } else if (step.type === 'drive') {
      const distance = distance2D(context.vehiclePosition, target);
      const slowEnough = !step.requireStop || Math.abs(context.vehicleSpeedKmh) < 6;
      if (context.isDriving && distance <= step.radius && slowEnough) completed = true;
    }

    if (completed) this._completeStep();
    this._refresh(context);
  }

  _completeStep() {
    const mission = this.mission;
    if (this.stepIndex < mission.steps.length - 1) {
      this.stepIndex += 1;
      this.hud.showToast(mission.steps[this.stepIndex].label, 2600);
      return;
    }

    this.state = 'intermission';
    this.intermission = 5;
    this.marker.hide();
    this.onReward?.(mission.reward, mission);
    this.hud.showMissionBanner(mission.title, mission.reward, 3600);
    this.hud.setMission({
      title: mission.title,
      objective: 'Mission passed — enjoy the payout',
      distance: null,
      reward: mission.reward,
    });
  }

  _startNextMission() {
    const nextIndex = this.missionIndex + 1;
    if (nextIndex >= MISSIONS.length) {
      this.state = 'finished';
      this.marker.hide();
      this.currentTarget = null;
      this.currentDistance = null;
      this.hud.setMission(null);
      this.hud.showToast('All jobs complete — free roam unlocked', 4200);
      return;
    }

    this.missionIndex = nextIndex;
    this.stepIndex = 0;
    this.state = 'active';
    this.hud.hideMissionBanner();
    this.hud.showToast(`NEW JOB · ${this.mission.title}`, 3000);
    if (this._lastContext) this._refresh(this._lastContext);
  }

  _resolveTarget(step, context) {
    if (!step || !context) return null;

    if (step.type === 'enter-vehicle') {
      const vehicle = context.vehiclePosition;
      return {
        x: vehicle.x,
        z: vehicle.z,
        ground: Math.max(0, vehicle.y - 0.82),
        kind: step.markerKind || 'objective',
      };
    }

    if (!step.target) return null;
    return {
      x: step.target.x,
      z: step.target.z,
      ground: step.target.ground ?? 0,
      kind: step.markerKind || 'objective',
    };
  }

  _refresh(context) {
    if (!context || this.state !== 'active') return;
    const step = this.step;
    const mission = this.mission;
    if (!step || !mission) return;

    const target = this._resolveTarget(step, context);
    if (!target) return;
    this.currentTarget = target;
    this.marker.show(target.x, target.z, target.ground, target.kind);

    const reference = context.isDriving ? context.vehiclePosition : context.playerPosition;
    this.currentDistance = distance2D(reference, target);

    this.hud.setMission({
      title: mission.title,
      objective: step.label,
      distance: this.currentDistance,
      reward: mission.reward,
    });
  }

  getBlips() {
    if (this.state !== 'active' || !this.currentTarget) return [];
    return [
      {
        x: this.currentTarget.x,
        z: this.currentTarget.z,
        kind: this.currentTarget.kind,
      },
    ];
  }

  getState() {
    return {
      state: this.state,
      mission: this.mission ? this.mission.id : null,
      title: this.mission ? this.mission.title : null,
      step: this.step ? this.step.type : null,
      objective: this.step ? this.step.label : null,
      stepIndex: this.stepIndex,
      distance: this.currentDistance === null ? null : Math.round(this.currentDistance * 10) / 10,
      reward: this.mission ? this.mission.reward : 0,
    };
  }

  dispose() {
    this.marker.dispose();
  }
}

