import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { readFileSync, existsSync } from "node:fs";
import { MapColliders } from "../src/legacy/collision.js";
import { ObstacleField } from "../src/legacy/obstacles.js";
import { sanitizeSettings, clockLabel } from "../src/settings.js";
function box(w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
  m.position.set(x, y, z);
  m.updateMatrixWorld(true);
  return m;
}
test("flyover preserves a separate ground floor, deck and overhead clearance", () => {
  const colliders = new MapColliders(
    [box(40, 1, 40, 0, -0.5, 0), box(20, 1, 40, 0, 17.5, 0)],
    THREE,
    { cell: 4 },
  );
  assert.equal(colliders.floorUnder(0, 0, 2), 0);
  assert.equal(colliders.floorUnder(0, 0, 19), 18);
  assert.equal(colliders.ceilingOver(0, 0, 2), 17);
  assert.equal(colliders.blocked(0, 0, 0.5, 0.5, 3), false);
});
test("vertical map walls block a player but allow passage beside them", () => {
  const c = new MapColliders([box(1, 10, 20, 0, 5, 0)], THREE, { cell: 4 });
  assert.equal(c.blocked(0.4, 0, 0.5, 1, 3), true);
  assert.equal(c.blocked(3, 0, 0.5, 1, 3), false);
});
test("street props block the road without blocking people on the flyover", () => {
  const o = new ObstacleField();
  o.add([[0, 0, 0, 0]], 3, 10, 4);
  o.build();
  assert.equal(o.blocked(0, 0, 0.5, 0, 2.55), true);
  assert.equal(o.blocked(0, 0, 0.5, 18, 2.55), false);
});
test("invalid saved graphics settings recover safely", () => {
  const s = sanitizeSettings({
    hour: 999,
    rain: -5,
    quality: "broken",
    exposure: NaN,
    ao: "yes",
  });
  assert.equal(s.hour, 24);
  assert.equal(s.rain, 0);
  assert.equal(s.quality, "high");
  assert.equal(s.exposure, 1);
  assert.equal(s.ao, true);
  assert.equal(clockLabel(24), "00:00");
  assert.equal(clockLabel(17.25), "17:15");
});
test("Hledan GLB and all required high-resolution textures ship locally", () => {
  const b = readFileSync(
    new URL("../public/models/hledan.glb", import.meta.url),
  );
  assert.equal(b.readUInt32LE(0), 0x46546c67);
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  const names = json.materials.map((x) => x.name);
  for (const name of [
    "Building",
    "Hledan_Center",
    "Environment",
    "Road texture",
  ])
    assert.ok(names.includes(name));
  for (const file of [
    "hi/building_basecolor.webp",
    "hi/hledan_basecolor.webp",
    "hi/environment_basecolor.webp",
    "road_basecolor.webp",
  ])
    assert.ok(
      existsSync(new URL("../public/textures/" + file, import.meta.url)),
    );
});

const { Traffic } = await import("../src/traffic.js");
test("moving traffic retains lane spacing and stops for a pedestrian ahead", () => {
  const scene = new THREE.Scene(),
    t = new Traffic(scene);
  const loaded = {
    geometry: new THREE.BoxGeometry(2, 2, 4),
    material: new THREE.MeshStandardMaterial(),
  };
  t.add(loaded, "car");
  t.add(loaded, "bus");
  t.update(0, true);
  const car = t.cars[0],
    before = car.u,
    p = car.mesh.position.clone();
  p.x += Math.sin(car.mesh.rotation.y) * 10;
  p.z += Math.cos(car.mesh.rotation.y) * 10;
  p.y += 2;
  t.update(1 / 60, true, p);
  assert.equal(car.u, before);
  for (let i = 0; i < 3600; i++) t.update(1 / 60, true);
  for (const a of t.cars)
    for (const b of t.cars)
      if (a !== b && a.dir === b.dir)
        assert.ok((((b.u - a.u) * a.dir + 1) % 1) * t.length > 24);
  assert.ok(
    t.blocked(
      car.mesh.position.x,
      car.mesh.position.z,
      0.5,
      car.mesh.position.y,
    ),
  );
});

const { Explorer } = await import("../src/controller.js");
test("walking gravity settles on the road, jumps and lands without changing floor levels", () => {
  const savedDocument = globalThis.document,
    savedWindow = globalThis.window;
  const canvas = {
    addEventListener() {},
    focus() {
      document.activeElement = this;
    },
  };
  globalThis.document = {
    addEventListener() {},
    pointerLockElement: null,
    activeElement: canvas,
  };
  globalThis.window = { addEventListener() {} };
  try {
    const floor = box(1000, 1, 1000, 0, 42.5, 250),
      solids = new MapColliders([floor], THREE, { cell: 8 });
    const camera = new THREE.PerspectiveCamera(),
      player = new Explorer(
        camera,
        canvas,
        solids,
        { obstacles: new ObstacleField() },
        { player() {} },
      );
    player.setMode("walk");
    for (let i = 0; i < 120; i++) player.update(1 / 60);
    assert.ok(player.grounded);
    assert.ok(Math.abs(camera.position.y - 45.55) < 0.001);
    player.keys.add("Space");
    player.update(1 / 60);
    assert.ok(camera.position.y > 45.55);
    assert.equal(player.grounded, false);
    for (let i = 0; i < 120; i++) player.update(1 / 60);
    assert.ok(player.grounded);
    assert.ok(Math.abs(camera.position.y - 45.55) < 0.001);
    const before = camera.position.clone();
    player.keys.add("KeyW");
    for (let i = 0; i < 60; i++) player.update(1 / 60);
    assert.ok(camera.position.distanceTo(before) > 4);
  } finally {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  }
});

test("weather boundaries select daylight, storm and night skies consistently", async () => {
  const { skyForHour, PRESETS } = await import("../src/settings.js");
  for (const [key, preset] of Object.entries(PRESETS)) {
    assert.equal(skyForHour(preset.hour, preset.rain), key);
  }
  assert.equal(
    skyForHour(23, 1),
    "night",
    "rain must not make a midnight sky daylight",
  );
  assert.equal(skyForHour(12, 1), "monsoon");
  assert.equal(skyForHour(24, 0), "night");
  assert.equal(sanitizeSettings({ reflections: false }).reflections, false);
});

test("all six HDR skies and restored 4K material maps are shipped", () => {
  for (const name of [
    "qwantani_sunrise_puresky",
    "qwantani_sunset_puresky",
    "qwantani_noon_puresky",
    "qwantani_dusk_2_puresky",
    "qwantani_night_puresky",
    "kloofendal_overcast_puresky",
  ]) {
    const b = readFileSync(
      new URL(`../public/skies/${name}.hdr`, import.meta.url),
    );
    assert.match(b.subarray(0, 500).toString(), /FORMAT=32-bit_rle_rgbe/);
    assert.match(b.subarray(0, 500).toString(), /-Y 1024 \+X 2048/);
  }
  for (const name of [
    "building_roughness",
    "environment_roughness",
    "hledan_roughness",
  ]) {
    const b = readFileSync(
      new URL(`../public/textures/hi/${name}.webp`, import.meta.url),
    );
    assert.equal(b.subarray(8, 12).toString(), "WEBP");
  }
});
