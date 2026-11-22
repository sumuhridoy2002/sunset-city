/**
 * Central tuning values. Gameplay systems never hard-code magic numbers when a
 * shared value makes sense here.
 */
export const CONFIG = Object.freeze({
  loop: {
    fixedDt: 1 / 60,
    maxSubSteps: 5,
    maxFrameDt: 0.1,
  },

  renderer: {
    pixelRatioCap: 1.75,
    shadowMapSize: 2048,
    exposure: 1.03,
  },

  camera: {
    fov: 60,
    near: 0.12,
    far: 650,
    footDistance: 6.2,
    carDistance: 8.3,
    minDistance: 3.4,
    maxDistance: 12.5,
    sensitivity: 0.00215,
    minPitch: -0.08,
    maxPitch: 1.05,
    collisionPadding: 0.28,
    vehicleLookAssistDelay: 1.15,
  },

  player: {
    // Body origin = centre of the capsule. Next to the car on the southern road.
    spawn: { x: -8.7, y: 1.08, z: 20.7, yaw: 0 },
    radius: 0.34,
    height: 1.8,
    walkSpeed: 3.6,
    runSpeed: 6.9,
    groundAcceleration: 15,
    airAcceleration: 3.2,
    jumpSpeed: 7.3,
    gravity: -24,
    rotationSpeed: 13,
    maxHealth: 100,
    fallDamageSpeed: 15,
    fallDamageScale: 4.2,
    regenDelay: 7,
    regenRate: 5,
  },

  vehicle: {
    // Parked in the southern lane of the central block.
    spawn: { x: -5.2, y: 0.95, z: 21.1, yaw: Math.PI / 2 },
    mass: 1180,
    chassis: { hx: 0.92, hy: 0.3, hz: 2.03 },
    wheel: {
      radius: 0.34,
      width: 0.28,
      x: 0.85,
      z: 1.38,
      connectionY: -0.1,
      suspensionRestLength: 0.34,
      maxSuspensionTravel: 0.22,
      stiffness: 30,
      compression: 2.1,
      relaxation: 2.7,
      maxSuspensionForce: 14000,
      frictionSlip: 2.2,
      sideFriction: 1.0,
    },
    engineForce: 3200,
    reverseForce: 2200,
    brakeForce: 42,
    handbrakeForce: 90,
    rollingBrake: 2.4,
    maxSteer: 0.6,
    steerSpeed: 7,
    highSpeedSteerFactor: 0.38,
    maxForwardSpeed: 33,
    maxReverseSpeed: 8,
    exitMaxSpeed: 5.5,
    enterPadding: 1.7,
    exitOffsetX: 1.75,
    exitOffsetZ: -0.15,
  },

  game: {
    startingMoney: 500,
    respawnDelay: 2.6,
  },

  world: {
    asphaltExtent: 168,
    outerSidewalkWidth: 6,
    groundSize: 620,
  },
});

export const PALETTE = Object.freeze({
  skyTop: 0x2f6c9f,
  skyHorizon: 0xffc289,
  sun: 0xffd7a3,
  fog: 0xdfc1a0,
  asphalt: 0x2c2d31,
  roadMarking: 0xe8dfc7,
  laneMarking: 0xd9b55a,
  sidewalk: 0x9d998f,
  curb: 0x77746c,
  grass: 0x536b3f,
  path: 0xb9ad97,
  roof: 0x3a3b3e,
});
