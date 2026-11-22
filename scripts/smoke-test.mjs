import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

const EXECUTABLE_PATH = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
if (!EXECUTABLE_PATH) {
  throw new Error(
    'No Chrome/Edge executable found. Set BROWSER_PATH to a Chromium-based browser executable.',
  );
}

const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const OUT_DIR = path.resolve('screenshots');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logs = [];
const pageErrors = [];
const failedRequests = [];
const checks = {};
const result = { passed: false, checks, logs, pageErrors, failedRequests };
let browser;

function check(name, condition, details = '') {
  checks[name] = { passed: Boolean(condition), details };
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${details ? ` — ${details}` : ''}`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=1280,720',
    ],
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  page.on('console', (message) => {
    const location = message.location?.();
    const entry = {
      type: message.type(),
      text: message.text(),
      url: location?.url || '',
    };
    logs.push(entry);
    if (entry.type === 'error') console.log('[console.error]', entry.text, entry.url);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    console.log('[pageerror]', error.message);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForFunction(
    () => window.__game && (window.__game.ready || window.__game.fatal),
    { timeout: 90000 },
  );

  const boot = await page.evaluate(() => window.__game.getDebugState());
  check('boot completed', boot.ready && !boot.fatal, JSON.stringify(boot.city));
  check(
    'city populated',
    boot.city.buildings >= 20 && boot.city.streetLights >= 30,
    JSON.stringify(boot.city),
  );
  await page.screenshot({ path: path.join(OUT_DIR, '01-menu.png') });
  if (boot.fatal) throw new Error('Game reported a fatal boot error.');

  await page.click('#start-button');
  await page.waitForFunction(() => window.__game.started, { timeout: 15000 });
  await page.waitForFunction(() => window.__game.player.grounded, { timeout: 12000 });
  await wait(500);

  const state = await page.evaluate(() => window.__game.getDebugState());
  check('game started', state.started && !state.paused && !state.fatal);
  check('player grounded at spawn', state.player.grounded, `body y=${state.player.y}`);
  check('car spawned near player', state.vehicle && Math.abs(state.vehicle.x - state.player.x) < 6);

  const pointerState = await page.evaluate(() => ({
    locked: Boolean(document.pointerLockElement),
    prompt: document.getElementById('prompt').classList.contains('is-hidden')
      ? null
      : document.getElementById('prompt').textContent.trim().replace(/\s+/g, ' '),
    minimapPixels: (() => {
      const canvas = document.getElementById('minimap');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
      return count;
    })(),
  }));
  check(
    'enter prompt visible at spawn',
    Boolean(pointerState.prompt && /enter vehicle/i.test(pointerState.prompt)),
    pointerState.prompt || 'none',
  );
  check('minimap rendered', pointerState.minimapPixels > 50000, `${pointerState.minimapPixels} opaque pixels`);

  const yawBefore = await page.evaluate(() => window.__game.cameraRig.yaw);
  await page.evaluate(() => {
    window.__game.input.mouseDelta.x = 120;
    window.__game.input.mouseDelta.y = 24;
  });
  let mouseLookWorked = true;
  try {
    await page.waitForFunction(
      (before) => Math.abs(window.__game.cameraRig.yaw - before) > 0.05,
      { timeout: 8000 },
      yawBefore,
    );
  } catch {
    mouseLookWorked = false;
  }
  const yawAfter = await page.evaluate(() => window.__game.cameraRig.yaw);
  check('mouse look updates camera yaw', mouseLookWorked, `${yawBefore} -> ${yawAfter}`);
  check('pointer lock acquired', pointerState.locked, pointerState.locked ? 'yes' : 'no (drag fallback available)');

  await page.screenshot({ path: path.join(OUT_DIR, '02-spawn.png') });

  // Pause the render-loop simulation; fixed updates are driven explicitly below.
  await page.evaluate(() => {
    const g = window.__game;
    g.loop.setPaused(true);
    g.input.clearTransient();
    g.input.keys.clear();
  });

  const walk = await page.evaluate(() => {
    const g = window.__game;
    const start = g.player.getFootPosition();
    g.input.keys.add('KeyW');
    for (let i = 0; i < 60; i += 1) g._fixedUpdate(1 / 60);
    g.input.keys.delete('KeyW');
    for (let i = 0; i < 10; i += 1) g._fixedUpdate(1 / 60);
    const end = g.player.getFootPosition();
    return { start, end, state: g.getDebugState() };
  });
  const walked = Math.hypot(walk.end.x - walk.start.x, walk.end.z - walk.start.z);
  check('WASD walking moves player', walked > 1.5, `${walked.toFixed(2)} m`);
  check('player stable after walk', walk.state.player.grounded, 'grounded after walk');

  const sprint = await page.evaluate(() => {
    const g = window.__game;
    g.player.teleport(-8.7, 1.08, 20.7, 0);
    g.cameraRig.yaw = 0;
    for (let i = 0; i < 20; i += 1) g._fixedUpdate(1 / 60);
    const start = g.player.getFootPosition();
    g.input.keys.add('KeyW');
    g.input.keys.add('ShiftLeft');
    for (let i = 0; i < 60; i += 1) g._fixedUpdate(1 / 60);
    g.input.keys.delete('ShiftLeft');
    g.input.keys.delete('KeyW');
    for (let i = 0; i < 15; i += 1) g._fixedUpdate(1 / 60);
    const end = g.player.getFootPosition();
    return { distance: Math.hypot(end.x - start.x, end.z - start.z), state: g.getDebugState() };
  });
  check(
    'Shift sprint covers more ground than walking',
    sprint.distance > walked * 1.15,
    `walk ${walked.toFixed(2)} m vs sprint ${sprint.distance.toFixed(2)} m`,
  );

  const jump = await page.evaluate(() => {
    const g = window.__game;
    const start = g.player.getFootPosition();
    g.input.pressedKeys.add('Space');
    g._fixedUpdate(1 / 60);
    for (let i = 0; i < 9; i += 1) g._fixedUpdate(1 / 60);
    const airborne = g.player.getFootPosition();
    for (let i = 0; i < 100; i += 1) g._fixedUpdate(1 / 60);
    return { start, airborne, landedState: g.getDebugState() };
  });
  check(
    'jump leaves the ground',
    jump.airborne.y - jump.start.y > 0.25,
    `${jump.start.y.toFixed(2)} -> ${jump.airborne.y.toFixed(2)}`,
  );
  check('player lands again', jump.landedState.player.grounded, `y=${jump.landedState.player.y}`);

  // Wall collision: walk into the south face of the southernmost building in Garment.
  const wall = await page.evaluate(() => {
    const g = window.__game;
    const block = g.layout.blocks.find((b) => b.gx === 0 && b.gz === 1);
    const building = block.buildings.reduce((best, cur) =>
      cur.z + cur.depth / 2 > best.z + best.depth / 2 ? cur : best,
    );
    const faceZ = building.z + building.depth / 2;
    const startZ = faceZ + 2.6;
    g.player.teleport(building.x, 1.2, startZ, 0);
    g.cameraRig.yaw = 0;
    for (let i = 0; i < 20; i += 1) g._fixedUpdate(1 / 60);
    const start = g.player.getFootPosition();
    g.input.keys.add('KeyW');
    for (let i = 0; i < 100; i += 1) g._fixedUpdate(1 / 60);
    g.input.keys.delete('KeyW');
    for (let i = 0; i < 10; i += 1) g._fixedUpdate(1 / 60);
    const end = g.player.getFootPosition();
    return {
      faceZ,
      start,
      end,
      building: { x: building.x, z: building.z, width: building.width, depth: building.depth },
      state: g.getDebugState(),
    };
  });
  check(
    'solid building blocks the player',
    wall.end.z > wall.faceZ - 0.05 && wall.end.z < wall.faceZ + 1.2,
    `wall z=${wall.faceZ.toFixed(2)}, player z=${wall.end.z.toFixed(2)}, start=${wall.start.z.toFixed(2)}`,
  );
  check(
    'player stays on the block during collision test',
    Math.abs(wall.end.x - wall.start.x) < 1,
    `dx=${(wall.end.x - wall.start.x).toFixed(2)}`,
  );

  // Stand beside the car's driver door and enter with E.
  const enter = await page.evaluate(() => {
    const g = window.__game;
    const door = g.vehicle.getExitCandidates()[0].world;
    g.player.teleport(door.x, 1.15, door.z, 0);
    g.cameraRig.yaw = 0;
    for (let i = 0; i < 20; i += 1) g._fixedUpdate(1 / 60);
    g.input.pressedKeys.add('KeyE');
    g._fixedUpdate(1 / 60);
    for (let i = 0; i < 15; i += 1) g._fixedUpdate(1 / 60);
    const state = g.getDebugState();
    return { ...state, playerVisible: g.player.model.visible, playerActive: g.player.active };
  });
  check('E enters the vehicle', enter.driving, `door distance test, car occupied=${enter.vehicle.occupied}`);
  check('player is hidden while driving', enter.playerVisible === false && enter.playerActive === false);

  const drive = await page.evaluate(() => {
    const g = window.__game;
    const start = g.vehicle.getPosition();
    const startHeading = g.vehicle.getHeading();
    g.input.keys.add('KeyW');
    for (let i = 0; i < 120; i += 1) g._fixedUpdate(1 / 60);
    g.input.keys.delete('KeyW');
    const afterThrottle = g.getDebugState();
    const throttlePosition = g.vehicle.getPosition();

    // Turn left while rolling.
    g.input.keys.add('KeyW');
    g.input.keys.add('KeyA');
    for (let i = 0; i < 45; i += 1) g._fixedUpdate(1 / 60);
    g.input.keys.delete('KeyA');
    g.input.keys.delete('KeyW');
    const afterSteer = g.getDebugState();
    const steerHeading = g.vehicle.getHeading();

    // Brake until nearly stopped.
    g.input.keys.add('KeyS');
    let brakeSteps = 0;
    while (Math.abs(g.vehicle.getForwardSpeed()) > 0.8 && brakeSteps < 260) {
      g._fixedUpdate(1 / 60);
      brakeSteps += 1;
    }
    g.input.keys.delete('KeyS');
    for (let i = 0; i < 10; i += 1) g._fixedUpdate(1 / 60);
    const afterBrake = g.getDebugState();

    return {
      start,
      startHeading,
      throttlePosition,
      afterThrottle,
      afterSteer,
      steerHeading,
      afterBrake,
      brakeSteps,
    };
  });

  const driveDistance = Math.hypot(
    drive.throttlePosition.x - drive.start.x,
    drive.throttlePosition.z - drive.start.z,
  );
  check('engine accelerates the car', drive.afterThrottle.vehicle.speed > 8, `${drive.afterThrottle.vehicle.speed} m/s`);
  check('car travels under throttle', driveDistance > 5, `${driveDistance.toFixed(1)} m`);
  const headingDelta = Math.atan2(
    Math.sin(drive.steerHeading - drive.startHeading),
    Math.cos(drive.steerHeading - drive.startHeading),
  );
  check('steering changes heading', Math.abs(headingDelta) > 0.12, `Δheading=${headingDelta.toFixed(2)} rad`);
  check('A steers left', headingDelta > 0.12, `Δheading=${headingDelta.toFixed(2)} rad`);
  check(
    'brakes bring the car under control',
    Math.abs(drive.afterBrake.vehicle.speed) < 1.5,
    `speed=${drive.afterBrake.vehicle.speed} m/s after ${drive.brakeSteps} steps`,
  );
  check('speedometer data is populated', drive.afterThrottle.vehicle.speedKmh > 25, `${drive.afterThrottle.vehicle.speedKmh} km/h`);

  const exit = await page.evaluate(() => {
    const g = window.__game;
    g.input.pressedKeys.add('KeyE');
    g._fixedUpdate(1 / 60);
    for (let i = 0; i < 40; i += 1) g._fixedUpdate(1 / 60);
    return g.getDebugState();
  });
  check('E exits the vehicle', !exit.driving && !exit.vehicle.occupied);
  check(
    'exit places the player on solid ground',
    Number.isFinite(exit.player.y) && exit.player.y > -1 && exit.player.grounded,
    `player y=${exit.player.y}, grounded=${exit.player.grounded}`,
  );
  const exitDistance = Math.hypot(exit.player.x - exit.vehicle.x, exit.player.z - exit.vehicle.z);
  check('player exits beside the car', exitDistance > 0.8 && exitDistance < 4.5, `${exitDistance.toFixed(2)} m`);

  // Mission: walk into the contact marker, then steal the car and deliver it.
  const contact = await page.evaluate(() => {
    const g = window.__game;
    const c = g.layout.mission.contact;
    g.player.teleport(c.x, 1.2, c.z + 1.2, 0);
    g.cameraRig.yaw = 0;
    for (let i = 0; i < 30; i += 1) g._fixedUpdate(1 / 60);
    return g.getDebugState();
  });
  check(
    'mission contact advances objective',
    contact.mission.state === 'active' && contact.mission.stepIndex === 1,
    JSON.stringify(contact.mission),
  );

  const steal = await page.evaluate(() => {
    const g = window.__game;
    const body = g.vehicle.body;
    const yaw = Math.PI / 2;
    body.setTranslation({ x: -5.2, y: 0.95, z: 21.1 }, true);
    body.setRotation(
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      true,
    );
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const door = g.vehicle.getExitCandidates()[0].world;
    g.player.teleport(door.x, 1.15, door.z, 0);
    g.cameraRig.yaw = 0;
    for (let i = 0; i < 25; i += 1) g._fixedUpdate(1 / 60);
    g.input.pressedKeys.add('KeyE');
    g._fixedUpdate(1 / 60);
    for (let i = 0; i < 20; i += 1) g._fixedUpdate(1 / 60);
    return g.getDebugState();
  });
  check('mission accepts vehicle entry', steal.driving && steal.mission.stepIndex === 2, JSON.stringify(steal.mission));

  const delivery = await page.evaluate(() => {
    const g = window.__game;
    const dropoff = g.layout.mission.dropoff;
    const body = g.vehicle.body;
    body.setTranslation({ x: dropoff.x, y: 1.1, z: dropoff.z }, true);
    body.setRotation({ x: 0, y: Math.sin(Math.PI / 2), z: 0, w: Math.cos(Math.PI / 2) }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 75; i += 1) g._fixedUpdate(1 / 60);
    return g.getDebugState();
  });
  check(
    'delivery completes the mission',
    delivery.mission.state === 'intermission' || delivery.mission.state === 'finished',
    JSON.stringify(delivery.mission),
  );
  check('mission pays the reward', delivery.money >= 2000, `$${delivery.money}`);

  const intermissionHud = await page.evaluate(() => ({
    objective: document.getElementById('mission-objective').textContent.trim(),
    distance: document.getElementById('mission-distance').textContent.trim(),
    markerVisible: window.__game.missionSystem.marker.group.visible,
  }));
  check('HUD marks the mission as passed', /mission passed/i.test(intermissionHud.objective), intermissionHud.objective);
  check('objective marker clears between missions', intermissionHud.markerVisible === false);

  // Stage a readable screenshot of the success banner and HUD.
  await page.evaluate(() => {
    const g = window.__game;
    g.cameraRig.setMode('vehicle', { vehicleHeading: g.vehicle.getHeading() });
    g.cameraRig.snap(g.vehicle.getCameraTarget());
    g.hud.update(1);
    g.hud.setHealth(g.player.health);
    g.hud.setVehicleStats(g.vehicle.getSpeedKmh(), g.vehicle.getForwardSpeed());
    g.hud.showMissionBanner('Repo Run', 1500, 30000);
  });
  const bannerVisible = await page.evaluate(
    () => !document.getElementById('mission-banner').classList.contains('is-hidden'),
  );
  check('mission passed banner visible', bannerVisible);
  await wait(900);
  await page.screenshot({ path: path.join(OUT_DIR, '03-mission-passed.png') });

  const second = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 330; i += 1) g._fixedUpdate(1 / 60);
    return g.getDebugState();
  });
  check(
    'mission chain starts the second job',
    second.mission.mission === 'line-runner' && second.mission.state === 'active',
    `${second.mission.title} step ${second.mission.stepIndex}`,
  );
  check(
    'mission chain advances past the enter-car step while driving',
    second.mission.stepIndex >= 1,
    JSON.stringify(second.mission),
  );

  const hudState = await page.evaluate(() => ({
    missionTitle: document.getElementById('mission-title').textContent.trim(),
    missionObjective: document.getElementById('mission-objective').textContent.trim(),
    money: document.getElementById('money-value').textContent.trim(),
    speedoVisible: !document.getElementById('speedo').classList.contains('is-hidden'),
    health: document.getElementById('health-value').textContent.trim(),
  }));
  check('HUD shows the mission', hudState.missionTitle.length > 0 && hudState.missionObjective.length > 0, JSON.stringify(hudState));
  check('HUD shows money', hudState.money === '2,000', hudState.money);
  check('HUD speedometer active while driving', hudState.speedoVisible, hudState.speedoVisible ? 'visible' : 'hidden');
  check('HUD health populated', Number(hudState.health) > 0, hudState.health);

  await page.evaluate(() => {
    const g = window.__game;
    g.cameraRig.setMode('vehicle', { vehicleHeading: g.vehicle.getHeading() });
    g.cameraRig.snap(g.vehicle.getCameraTarget());
  });
  await wait(700);
  await page.screenshot({ path: path.join(OUT_DIR, '04-second-job.png') });

  const final = await page.evaluate(() => window.__game.getDebugState());
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  check(
    'no failed network requests',
    failedRequests.length === 0,
    failedRequests.join(' | '),
  );
  check(
    'no console errors',
    logs.filter((entry) => entry.type === 'error').length === 0,
    logs.filter((entry) => entry.type === 'error').map((entry) => entry.text).join(' | '),
  );
  check('no fatal flag', final.fatal === false);
  check(
    'render budget is sane',
    final.render && final.render.calls < 1400 && final.render.triangles < 250000,
    JSON.stringify(final.render),
  );

  result.finalState = final;
  result.passed = Object.values(checks).every((entry) => entry.passed);
  await fs.writeFile(path.join(OUT_DIR, 'smoke-report.json'), JSON.stringify(result, null, 2));
  console.log(result.passed ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED');
  if (!result.passed) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error('SMOKE TEST ERROR:', error);
  result.crash = error.stack || String(error);
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUT_DIR, 'smoke-report.json'), JSON.stringify(result, null, 2));
  } catch {
    // Ignore report write failures.
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
}



