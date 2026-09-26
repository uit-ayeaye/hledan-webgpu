import "./style.css";
import * as THREE from "three/webgpu";
import {
  pass,
  vec4,
  vec3,
  float,
  uniform,
  uv,
  mix,
  mrt,
  output,
  normalView,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { StreetProps, loadVehicleGeometry } from "./legacy/props.js";
import { MapColliders } from "./legacy/collision.js";
import { Soundscape } from "./legacy/audio.js";
import { Atmosphere, Rain } from "./environment.js";
import { Explorer } from "./controller.js";
import { Traffic } from "./traffic.js";
import {
  loadSettings,
  saveSettings,
  DEFAULTS,
  PRESETS,
  clockLabel,
} from "./settings.js";

const $ = (id) => document.getElementById(id),
  settings = loadSettings();
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) {
  settings.traffic = false;
  settings.daycycle = false;
}
const base = import.meta.env.BASE_URL;
let renderer,
  scene,
  camera,
  controls,
  atmosphere,
  props,
  rain,
  explorer,
  traffic,
  pipeline,
  occlusion,
  bloomPass,
  scenePass;
let running = true,
  touring = false,
  photo = false,
  scale = 1,
  elapsed = 0,
  last = 0,
  frames = 0,
  frameMs = 16.7,
  measure = 0,
  cooldown = 0;
let flyTo = null,
  screenShotPending = false,
  ready = false;
const sound = new Soundscape("hi");
const PLACES = {
  junction: { position: [188, 214, 486], target: [-24, 58, 300] },
  flyover: { position: [46, 86, 58], target: [-6, 64, 262] },
  tea: { position: [130.5, 47.3, -269.5], target: [122, 45.3, -278] },
  centre: { position: [-46, 52, 262], target: [-50, 58, 360] },
};
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function progress(value, text) {
  $("progress").style.width = value + "%";
  $("load-message").textContent = text;
}
function fail(error) {
  console.error(error);
  running = false;
  $("loading").hidden = false;
  $("loading").removeAttribute("aria-hidden");
  $("loading").classList.remove("done");
  $("load-message").textContent =
    "The 3D world could not start. " + error.message;
  const link = document.createElement("a");
  link.textContent = "Open the original Hledan experience ↗";
  link.href = "https://thomasdlynn.dev/showcase/hledan/";
  link.className = "primary";
  $("loading").append(link);
}
function resize() {
  if (!renderer) return;
  const cap =
    settings.quality === "ultra" ? 2 : settings.quality === "high" ? 1.5 : 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, cap) * scale);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
function syncUI() {
  for (const id of ["quality", "rain", "haze", "exposure"])
    $(id).value = settings[id];
  $("time").value = settings.hour;
  for (const id of ["bloom", "ao", "traffic", "adaptive", "daycycle"])
    $(id).checked = settings[id];
  $("time-value").value = clockLabel(settings.hour);
  $("clock").textContent = clockLabel(settings.hour);
  $("rain-value").value = Math.round(settings.rain * 100) + "%";
  $("weather-label").textContent =
    PRESETS[settings.preset]?.label ?? "YOUR MOMENT";
  document.querySelectorAll("[data-weather]").forEach((b) => {
    b.classList.toggle("active", b.dataset.weather === settings.preset);
    b.setAttribute(
      "aria-pressed",
      String(b.dataset.weather === settings.preset),
    );
  });
}
function graphics() {
  const size =
    settings.quality === "balanced"
      ? 1024
      : settings.quality === "high"
        ? 2048
        : 4096;
  atmosphere.sun.shadow.mapSize.set(size, size);
  atmosphere.sun.shadow.map?.dispose();
  atmosphere.sun.shadow.map = null;
  scale = 1;
  resize();
  buildPipeline();
  saveSettings(settings);
}
function buildPipeline() {
  pipeline?.dispose();
  occlusion?.dispose();
  bloomPass?.dispose();
  scenePass?.dispose();
  occlusion = null;
  bloomPass = null;
  pipeline = new THREE.RenderPipeline(renderer);
  scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, normal: normalView }));
  const color = scenePass.getTextureNode("output");
  let result = color;
  if (settings.ao) {
    occlusion = ao(
      scenePass.getTextureNode("depth"),
      scenePass.getTextureNode("normal"),
      camera,
    );
    occlusion.resolutionScale = settings.quality === "ultra" ? 0.75 : 0.5;
    occlusion.radius.value = 3;
    occlusion.thickness.value = 2;
    result = result.mul(
      vec4(vec3(occlusion.getTextureNode().r.mul(0.6).add(0.4)), 1),
    );
  }
  if (settings.bloom) {
    bloomPass = bloom(color, 0.16, 0.45, 1.2);
    result = result.add(bloomPass);
  }
  const vignette = float(1).sub(uv().sub(0.5).length().pow(2).mul(0.38));
  pipeline.outputNode = fxaa(result.mul(vec4(vec3(vignette), 1)));
}
function setMode(mode, spawn = true) {
  touring = false;
  $("tour").textContent = "Take the slow way ▶";
  flyTo = null;
  explorer.setMode(mode, spawn);
  controls.enabled = mode === "orbit";
  controls.autoRotate = false;
  if (mode === "orbit") {
    controls.target
      .copy(camera.position)
      .add(
        new THREE.Vector3(0, -20, -80).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          explorer.yaw,
        ),
      );
    controls.update();
  }
  document.body.classList.toggle("immersed", mode !== "orbit");
  $("walk-hint").hidden = mode === "orbit";
  document.querySelector(".walk-caption").textContent =
    mode === "fly"
      ? "W A S D  move · Mouse / drag  look · Space  up · C  down · Shift  boost · Esc  release mouse"
      : "W A S D  move · Mouse / drag  look · Shift  run · Space  jump · Esc  release mouse";
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
  $("hint").textContent =
    mode === "orbit"
      ? "DRAG TO EXPLORE · SCROLL TO GET CLOSER"
      : mode === "walk"
        ? "WASD MOVE · SPACE JUMP · SHIFT RUN"
        : "WASD FLY · SPACE UP · C DOWN · SHIFT BOOST";
  if (mode !== "orbit") explorer.capture();
}
function visit(key) {
  setMode("orbit");
  const place = PLACES[key];
  flyTo = {
    from: camera.position.clone(),
    fromTarget: controls.target.clone(),
    to: new THREE.Vector3(...place.position),
    target: new THREE.Vector3(...place.target),
    t: 0,
  };
  document
    .querySelectorAll("[data-place]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.place === key));
}
function preset(key) {
  Object.assign(settings, PRESETS[key], { preset: key });
  syncUI();
  saveSettings(settings);
}
function toggleSettings() {
  const open = $("settings").hidden;
  $("settings").hidden = !open;
  $("settings-button").setAttribute("aria-expanded", String(open));
  if (open && document.pointerLockElement) document.exitPointerLock();
}
function togglePhoto() {
  photo = !photo;
  document.body.classList.toggle("photo", photo);
  $("photo-ui").hidden = !photo;
  if (photo) {
    if (document.pointerLockElement) document.exitPointerLock();
    touring = false;
    controls.autoRotate = false;
  }
}
function toggleSound() {
  const on = sound.toggle();
  $("sound").textContent = on ? "◖ Sound on" : "◖ Sound off";
  $("sound").setAttribute("aria-pressed", String(on));
}
function bindUI() {
  document
    .querySelectorAll("[data-weather]")
    .forEach((b) => (b.onclick = () => preset(b.dataset.weather)));
  document
    .querySelectorAll("[data-place]")
    .forEach((b) => (b.onclick = () => visit(b.dataset.place)));
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $("enter").onclick = () => setMode("walk");
  $("resume").onclick = () => explorer.capture();
  $("settings-button").onclick = toggleSettings;
  $("close-settings").onclick = toggleSettings;
  $("sound").onclick = toggleSound;
  $("fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser window.");
    }
  };
  $("tour").onclick = () => {
    if (touring) {
      touring = false;
      controls.autoRotate = false;
      $("tour").textContent = "Take the slow way ▶";
      return;
    }
    visit("junction");
    touring = true;
    $("tour").textContent = "Pause the journey Ⅱ";
  };
  $("photo").onclick = togglePhoto;
  $("exit-photo").onclick = togglePhoto;
  $("save-photo").onclick = () => {
    screenShotPending = true;
  };
  $("about-button").onclick = () => {
    $("about").showModal();
  };
  $("close-about").onclick = () => $("about").close();
  $("reset-settings").onclick = () => {
    Object.assign(settings, DEFAULTS);
    syncUI();
    graphics();
  };
  for (const id of ["time", "rain", "haze", "exposure"])
    $(id).oninput = (e) => {
      settings[id === "time" ? "hour" : id] = Number(e.target.value);
      if (id === "rain" || id === "time") settings.preset = "custom";
      syncUI();
      saveSettings(settings);
    };
  for (const id of ["bloom", "ao", "traffic", "adaptive", "daycycle"])
    $(id).onchange = (e) => {
      settings[id] = e.target.checked;
      if (id === "bloom" || id === "ao") buildPipeline();
      if (id === "adaptive" && !settings.adaptive) {
        scale = 1;
        resize();
      }
      saveSettings(settings);
    };
  $("quality").onchange = (e) => {
    settings.quality = e.target.value;
    graphics();
  };
  document.addEventListener("keydown", (e) => {
    if (
      e.repeat ||
      /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) ||
      $("about").open
    )
      return;
    if (e.code === "KeyH") toggleSettings();
    if (e.code === "KeyP") togglePhoto();
    if (e.code === "KeyM") toggleSound();
    if (e.code === "Escape" && photo) togglePhoto();
  });
  document.addEventListener("visibilitychange", () => {
    last = 0;
    if (sound.ctx) {
      if (document.hidden) sound.ctx.suspend();
      else if (sound.enabled) sound.ctx.resume();
    }
  });
  addEventListener("resize", resize);
  addEventListener("pagehide", () => sound.dispose(), { once: true });
}

async function start() {
  progress(5, "Waking up the graphics engine…");
  renderer = new THREE.WebGPURenderer({
    canvas: $("world"),
    antialias: true,
    powerPreference: "high-performance",
    forceWebGL: new URLSearchParams(location.search).has("compat"),
  });
  await renderer.init();
  const gpu = renderer.backend.isWebGPUBackend;
  $("backend").innerHTML = `<i></i>${gpu ? "WEBGPU" : "WEBGL2 COMPATIBILITY"}`;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.onDeviceLost = (info) =>
    fail(
      new Error(
        "Graphics device lost. Reload to reconnect. " + (info?.message ?? ""),
      ),
    );
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.25, 8000);
  camera.position.set(...PLACES.junction.position);
  controls = new OrbitControls(camera, $("world"));
  controls.target.set(...PLACES.junction.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 5;
  controls.maxDistance = 1300;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotateSpeed = 0.3;
  controls.update();
  atmosphere = new Atmosphere(scene, renderer, camera);
  atmosphere.update(1, settings, 0);
  resize();
  progress(15, "Returning to the junction…");
  const gltf = await new GLTFLoader().loadAsync(
    base + "models/hledan.glb",
    (ev) => {
      if (ev.total)
        progress(
          15 + Math.min(30, (ev.loaded / ev.total) * 30),
          "Unfolding the familiar streets…",
        );
    },
  );
  const textureLoader = new THREE.TextureLoader();
  const recipes = {
    Building: ["hi/building_basecolor.webp", "building_roughness.webp"],
    Environment: ["hi/environment_basecolor.webp"],
    Hledan_Center: ["hi/hledan_basecolor.webp", "hledan_roughness.webp"],
    "Road texture": ["road_basecolor.webp"],
  };
  const materials = {};
  await Promise.all(
    Object.entries(recipes).map(async ([name, files]) => {
      const maps = await Promise.all(
        files.map((f) => textureLoader.loadAsync(base + "textures/" + f)),
      );
      maps.forEach((t, i) => {
        t.flipY = false;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (i === 0) t.colorSpace = THREE.SRGBColorSpace;
      });
      materials[name] = atmosphere.material(name, maps[0], maps[1]);
    }),
  );
  const solidMeshes = [],
    buildings = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name;
    o.material =
      materials[name] ??
      new THREE.MeshStandardNodeMaterial({ color: 0xaaaa99 });
    o.receiveShadow = true;
    o.castShadow = name === "Building" || name === "Hledan_Center";
    if (!/^Tree\(/.test(o.name)) solidMeshes.push(o);
    if (
      (name === "Building" || name === "Hledan_Center") &&
      !/^Tree\(/.test(o.name)
    )
      buildings.push(o);
  });
  scene.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  progress(52, "Opening tea stalls and waking the streetlights…");
  props = new StreetProps({ scene, tier: "hi" });
  props.buildWindows(buildings, 40, "hi");
  props.buildNeon(buildings, 40, "hi");
  // Local lights stay in the shader layout throughout the day. Only intensity changes.
  props.setGlow(atmosphere.night, atmosphere.night);
  const solids = new MapColliders(solidMeshes, THREE, {
    cell: 8,
    yLo: 0,
    yHi: 250,
  });
  explorer = new Explorer(camera, $("world"), solids, props, sound);
  traffic = new Traffic(scene);
  explorer.traffic = traffic;
  progress(63, "Preparing the sky and reflections…");
  await atmosphere.environment();
  if (gpu) rain = new Rain(scene, renderer, solids);
  else
    toast(
      "Compatibility rendering: GPU rain is unavailable. Try a WebGPU-capable desktop browser.",
    );
  progress(74, "The buses are finding their way…");
  await Promise.all(
    [
      {
        file: "car-quaternius.glb",
        kind: "taxi",
        bodyMat: "LightBlue",
        size: [1.78, 1.52, 4.4],
      },
      {
        file: "bus-poly.glb",
        kind: "bus",
        bodyMat: "Mat",
        size: [2.5, 3.2, 11.5],
      },
    ].map(async (v) => {
      try {
        const loaded = await loadVehicleGeometry(
          base + "models/vehicles/" + v.file,
          { bodyMat: v.bodyMat, size: v.size, tier: "hi" },
        );
        props.replaceVehicle(
          v.kind,
          loaded,
          v.kind === "bus"
            ? [0x1f5fa8, 0x2f8f4e, 0xd8482c, 0xe0a52a]
            : undefined,
        );
        traffic.add(loaded, v.kind === "taxi" ? "car" : "bus");
      } catch (e) {
        console.warn(
          "Vehicle model unavailable; keeping procedural vehicle",
          e,
        );
      }
    }),
  );
  traffic.update(0.01, true);
  syncUI();
  bindUI();
  graphics();
  progress(88, "Catching the light — compiling shaders…");
  await renderer.compileAsync(scene, camera);
  pipeline.render();
  progress(100, "You are here.");
  ready = true;
  $("loading").classList.add("done");
  $("loading").setAttribute("aria-hidden", "true");
  setTimeout(() => ($("loading").hidden = true), 800);
  // Read-only diagnostics intentionally exported for reproducible browser QA.
  window.__HLEDAN__ = {
    get state() {
      return {
        ready,
        backend: gpu ? "webgpu" : "webgl2",
        mode: explorer.mode,
        position: camera.position.toArray(),
        settings: { ...settings },
        fps: Math.round(1000 / frameMs),
        scale,
        rainParticles: rain?.count ?? 0,
        triangles: renderer.info.render.triangles,
        drawCalls: renderer.info.render.drawCalls,
        traffic: traffic.cars.length,
        collisionTriangles: solids.tris.length / 9,
      };
    },
  };
  renderer.setAnimationLoop(frame);
}
function frame(now) {
  if (!running || document.hidden) {
    last = 0;
    return;
  }
  const raw = last ? (now - last) / 1000 : 1 / 60,
    dt = Math.min(raw, 0.05);
  last = now;
  elapsed += dt;
  if (settings.daycycle) {
    settings.hour = (settings.hour + dt / 25) % 24;
    $("time").value = settings.hour;
    $("time-value").value = clockLabel(settings.hour);
    $("clock").textContent = clockLabel(settings.hour);
  }
  const night = atmosphere.update(dt, settings, elapsed);
  if (flyTo) {
    flyTo.t = Math.min(1, flyTo.t + dt / (reduced ? 0.01 : 2.7));
    const a = flyTo.t * flyTo.t * (3 - 2 * flyTo.t);
    camera.position.lerpVectors(flyTo.from, flyTo.to, a);
    controls.target.lerpVectors(flyTo.fromTarget, flyTo.target, a);
    if (flyTo.t === 1) flyTo = null;
  }
  controls.autoRotate = touring && !flyTo;
  if (explorer.mode === "orbit") controls.update(dt);
  explorer.update(dt);
  traffic.update(
    dt,
    settings.traffic && !photo,
    explorer.mode === "walk" ? camera.position : null,
  );
  rain?.update(photo ? 0 : dt, settings.rain, elapsed);
  // Quantize lighting updates to avoid rewriting instancing and light uniforms every frame.
  if (Math.abs((frame.glow ?? -1) - night) > 0.015) {
    props.setGlow(night, Math.max(0.03, night));
    frame.glow = night;
  }
  props.update(camera);
  sound.update(dt, camera.position, {
    rain: settings.rain,
    traffic: 1 - night * 0.6,
  });
  try {
    pipeline.render();
  } catch (e) {
    fail(e);
    return;
  }
  if (screenShotPending) {
    screenShotPending = false;
    try {
      renderer.domElement.toBlob((blob) => {
        if (!blob) return toast("Photo capture is unavailable.");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `hledan-${clockLabel(settings.hour).replace(":", "-")}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("A little piece of Hledan, saved.");
      });
    } catch {
      toast("This browser could not save the photo.");
    }
  }
  frames++;
  measure += raw;
  frameMs = frameMs * 0.97 + raw * 1000 * 0.03;
  if (measure >= 1) {
    const fps = frames / measure;
    $("performance").textContent =
      `${Math.round(fps)} FPS · ${renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2"}\n${Math.round(scale * 100)}% render scale · ${settings.quality}\n${rain?.count ?? 0} GPU rain particles · ${traffic.cars.length} moving vehicles`;
    cooldown = Math.max(0, cooldown - 1);
    if (settings.adaptive && cooldown === 0) {
      const next =
        fps < 42
          ? Math.max(0.6, scale - 0.08)
          : fps > 57
            ? Math.min(1, scale + 0.03)
            : scale;
      if (next !== scale) {
        scale = next;
        resize();
        cooldown = 3;
      }
    }
    frames = 0;
    measure = 0;
  }
}
start().catch(fail);
