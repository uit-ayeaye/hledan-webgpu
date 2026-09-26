import * as THREE from "three/webgpu";
import {
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  Fn,
  If,
  hash,
  instanceIndex,
  instancedArray,
  positionLocal,
  positionWorld,
  normalWorld,
  normalLocal,
  texture,
  mx_noise_float,
  sin,
  cos,
  time,
  mix,
  smoothstep,
  uv,
  bumpMap,
  instancedBufferAttribute,
} from "three/tsl";
import { SkyMesh } from "three/addons/objects/SkyMesh.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { skyForHour } from "./settings.js";

// A GPU particle integrator with gravity, wind, terminal speed, and collision
// against a height field baked from the actual roofs / flyover / road meshes.
export class Rain {
  constructor(scene, renderer, solids, camera) {
    this.camera = camera;
    this.center = uniform(camera.position.clone());
    this.renderer = renderer;
    this.count = 18000;
    this.amount = uniform(0);
    this.dt = uniform(0);
    this.clock = uniform(0);
    const n = 128,
      data = new Float32Array(n * n * 4);
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = (z * n + x) * 4;
        data[i] =
          solids.topAt(
            ((x + 0.5) / n) * 900 - 450,
            ((z + 0.5) / n) * 1300 - 450,
          ) ?? 40;
        data[i + 3] = 1;
      }
    const height = new THREE.DataTexture(
      data,
      n,
      n,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    height.minFilter = height.magFilter = THREE.NearestFilter;
    height.needsUpdate = true;
    const positions = instancedArray(this.count, "vec3"),
      speeds = instancedArray(this.count, "float");
    this.init = Fn(() => {
      const p = positions.element(instanceIndex);
      p.assign(
        vec3(
          hash(instanceIndex).mul(220).sub(110).add(this.center.x),
          hash(instanceIndex.add(37)).mul(150).add(this.center.y),
          hash(instanceIndex.add(71)).mul(220).sub(110).add(this.center.z),
        ),
      );
      speeds
        .element(instanceIndex)
        .assign(hash(instanceIndex.add(17)).mul(35).add(30));
    })().compute(this.count);
    this.compute = Fn(() => {
      const p = positions.element(instanceIndex),
        speed = speeds.element(instanceIndex);
      speed.assign(speed.add(this.dt.mul(32)).min(85));
      p.y.subAssign(speed.mul(this.dt));
      p.x.addAssign(this.dt.mul(8));
      p.z.addAssign(this.dt.mul(3));
      const ground = texture(
        height,
        vec2(p.x.add(450).div(900), p.z.add(450).div(1300)),
      ).level(0).r;
      If(
        p.y
          .lessThan(ground.add(0.3))
          .or(p.x.sub(this.center.x).abs().greaterThan(110))
          .or(p.z.sub(this.center.z).abs().greaterThan(110)),
        () => {
          p.x.assign(
            hash(instanceIndex.add(this.clock.mul(17).floor()))
              .mul(220)
              .sub(110)
              .add(this.center.x),
          );
          p.z.assign(
            hash(instanceIndex.add(this.clock.mul(13).floor()).add(11))
              .mul(220)
              .sub(110)
              .add(this.center.z),
          );
          p.y.assign(this.center.y.add(85).add(hash(instanceIndex).mul(65)));
          speed.assign(35);
        },
      );
    })().compute(this.count);
    const mat = new THREE.SpriteNodeMaterial({
      color: 0xc8dee1,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mat.positionNode = positions.toAttribute();
    mat.scaleNode = vec2(0.07, 2.8);
    mat.opacityNode = this.amount
      .mul(0.34)
      .mul(float(1).sub(uv().y.sub(0.5).abs().mul(2)))
      .mul(float(1).sub(uv().x.sub(0.5).abs().mul(2)));
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.count = this.count;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    renderer.compute(this.init);
    const splashPositions = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const x = ((i * 137.508) % 900) - 450,
        z = ((i * 293.317) % 1300) - 450;
      splashPositions.set([x, (solids.topAt(x, z) ?? 40) + 0.06, z], i * 3);
    }
    const splashMat = new THREE.MeshBasicNodeMaterial({
      color: 0xb9d0cb,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const phase = this.clock.mul(1.7).add(hash(instanceIndex)).fract();
    splashMat.positionNode = positionLocal
      .mul(phase.mul(2).add(0.2))
      .add(
        instancedBufferAttribute(
          new THREE.InstancedBufferAttribute(splashPositions, 3),
        ),
      );
    const radius = uv().sub(0.5).length();
    splashMat.opacityNode = smoothstep(0.32, 0.4, radius)
      .mul(float(1).sub(smoothstep(0.42, 0.49, radius)))
      .mul(float(1).sub(phase))
      .mul(this.amount)
      .mul(0.55);
    this.splashes = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      splashMat,
    );
    this.splashes.count = 900;
    this.splashes.frustumCulled = false;
    scene.add(this.splashes);
  }
  update(dt, amount, elapsed) {
    this.center.value.copy(this.camera.position);
    this.amount.value = amount;
    this.mesh.visible = amount > 0.025;
    this.splashes.visible = this.mesh.visible;
    if (!this.mesh.visible) return;
    this.dt.value = dt;
    this.clock.value = elapsed;
    this.renderer.compute(this.compute);
  }
}

// Captured, unclipped HDR radiance drives both the sky and the material lighting.
// A procedural sky remains available if a sky download fails.
const SKY_FILES = {
  dawn: "qwantani_sunrise_puresky",
  golden: "qwantani_sunset_puresky",
  clear: "qwantani_noon_puresky",
  monsoon: "kloofendal_overcast_puresky",
  blue: "qwantani_dusk_2_puresky",
  night: "qwantani_night_puresky",
};
export class Atmosphere {
  constructor(scene, renderer, camera) {
    Object.assign(this, { scene, renderer, camera });
    this.wet = uniform(0);
    this.windowLight = uniform(0);
    this.t = uniform(0);
    this.materials = [];
    this.skies = new Map();
    this.pending = new Map();
    this.failedSkies = new Set();
    this.wind = uniform(0.3);
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(7000);
    this.sky.rayleigh.value = 2;
    this.sky.turbidity.value = 3;
    scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xffdfaa, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -260,
      right: 260,
      top: 260,
      bottom: -260,
      near: 1,
      far: 1600,
    });
    this.sun.shadow.bias = -0.0001;
    this.sun.shadow.normalBias = 0.12;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.target.position.set(0, 45, 230);
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xc6ddff, 0x574c3e, 0.24);
    this.fill = new THREE.AmbientLight(0xdce8ff, 0.025);
    scene.add(this.hemi, this.fill);
    scene.fog = new THREE.FogExp2(0xafc5cf, 0.0005);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4500, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardNodeMaterial({ color: 0x414a3d, roughness: 1 }),
    );
    scene.add(floor);
    this.envGenerator = new THREE.PMREMGenerator(renderer);
  }
  async loadSurfaces(base) {
    const loader = new THREE.TextureLoader();
    this.surfaces = await Promise.all(
      ["color", "height", "roughness"].map(async (name) => {
        const t = await loader.loadAsync(
          base + "textures/pbr/asphalt-" + name + ".jpg",
        );
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 16;
        if (name === "color") t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }),
    );
  }
  async loadSky(key) {
    if (this.skies.has(key)) return this.skies.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = (async () => {
      const hdr = await new HDRLoader().loadAsync(
        import.meta.env.BASE_URL + "skies/" + SKY_FILES[key] + ".hdr",
      );
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const env = this.envGenerator.fromEquirectangular(hdr);
      const value = { hdr, env };
      this.skies.set(key, value);
      return value;
    })();
    this.pending.set(key, pending);
    try {
      return await pending;
    } finally {
      this.pending.delete(key);
    }
  }
  async environment() {
    await this.loadSky(this.desiredSky ?? "golden");
    this.applySky();
  }
  applySky() {
    const value = this.skies.get(this.desiredSky);
    if (!value || this.currentSky === this.desiredSky) return;
    this.currentSky = this.desiredSky;
    this.scene.background = value.hdr;
    this.scene.environment = value.env.texture;
    this.scene.backgroundBlurriness = 0;
    this.sky.visible = false;
  }
  foliage(source) {
    const m = source.clone();
    m.name = "Foliage";
    m.emissiveNode = null;
    m.roughnessNode = float(0.94);
    m.clearcoatNode = float(0);
    m.normalNode = null;
    const crown = smoothstep(45, 76, positionLocal.y);
    const sway = sin(this.t.mul(1.1).add(positionLocal.z.mul(0.12)))
      .mul(0.22)
      .add(sin(this.t.mul(2.8).add(positionLocal.x.mul(0.5))).mul(0.055));
    m.positionNode = positionLocal.add(
      vec3(
        sway.mul(crown).mul(this.wind),
        0,
        sway.mul(crown).mul(0.4).mul(this.wind),
      ),
    );
    return m;
  }
  material(name, map, roughnessMap) {
    const road = name === "Road texture";
    const m = new THREE.MeshPhysicalNodeMaterial({
      map,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
      alphaTest: road ? 0 : 0.5,
      clearcoat: 0,
    });
    m.name = name;
    const base = texture(map);
    const horizontal = smoothstep(0.78, 0.98, normalWorld.y);
    // Shallow, irregular pools; sharp highlights sit on a nearly flat water film.
    const patch = smoothstep(
      0.14,
      0.48,
      mx_noise_float(positionWorld.xz.mul(0.09))
        .mul(0.7)
        .add(mx_noise_float(positionWorld.xz.mul(0.41)).mul(0.3)),
    );
    const wet = this.wet.mul(horizontal).mul(patch);
    const dryRough = roughnessMap
      ? texture(roughnessMap).g.mul(0.75).add(0.18)
      : float(0.9);
    m.roughnessNode = mix(dryRough, float(0.18), wet);
    m.clearcoatNode = wet.mul(0.38);
    m.clearcoatRoughnessNode = float(0.06);
    m.opacityNode = base.a;
    if (roughnessMap && name !== "Environment") {
      const glass = float(1).sub(
        smoothstep(0.07, 0.24, texture(roughnessMap).g),
      );
      m.emissiveNode = base.rgb
        .mul(vec3(0.8, 0.62, 0.38))
        .mul(glass)
        .mul(this.windowLight);
    }
    m.colorNode = base.rgb.mul(float(1).sub(wet.mul(0.4)));
    if (road && this.surfaces) {
      const tiled = positionWorld.xz.mul(0.22);
      const grain = texture(this.surfaces[0], tiled).rgb;
      // Keep the authored lane paint and geography, add real aggregate at foot scale.
      m.colorNode = base.rgb
        .mul(grain.mul(2.5).add(0.48))
        .mul(float(1).sub(wet.mul(0.38)));
      m.roughnessNode = mix(
        texture(this.surfaces[2], tiled).r.mul(0.25).add(0.7),
        float(0.13),
        wet,
      );
      m.normalNode = bumpMap(
        texture(this.surfaces[1], tiled)
          .r.mul(float(1).sub(wet.mul(0.96)))
          .mul(0.065),
      );
    } else {
      // Very fine masonry relief: deliberately below the scale of facade graphics.
      m.normalNode = bumpMap(mx_noise_float(positionWorld.mul(5)).mul(0.009));
    }
    this.materials.push(m);
    return m;
  }
  update(dt, s, elapsed) {
    this.t.value = elapsed;
    this.wind.value = (this.motion ?? 1) * (0.6 + s.rain * 2);
    this.wet.value = THREE.MathUtils.damp(this.wet.value, s.rain, 0.65, dt);
    this.desiredSky = skyForHour(s.hour, s.rain);
    if (
      !this.skies.has(this.desiredSky) &&
      !this.pending.has(this.desiredSky) &&
      !this.failedSkies.has(this.desiredSky) &&
      this.currentSky
    ) {
      this.loadSky(this.desiredSky)
        .then(() => this.applySky())
        .catch((error) => {
          this.failedSkies.add(this.desiredSky);
          console.warn(
            "Sky unavailable; retaining current lighting",
            error.message,
          );
        });
    }
    this.applySky();
    const theta = ((s.hour - 6) / 12) * Math.PI;
    const alt = Math.sin(theta);
    const day = THREE.MathUtils.smoothstep(alt, -0.18, 0.15);
    const warm = 1 - THREE.MathUtils.smoothstep(alt, 0.05, 0.55);
    const night = 1 - day;
    // Match the azimuth of the captured sun to the actual directional light.
    const azimuth = 0.6289;
    const dir = new THREE.Vector3(
      Math.cos(azimuth),
      Math.max(0.06, alt),
      Math.sin(azimuth),
    ).normalize();
    this.sky.sunPosition.value.copy(dir).multiplyScalar(4000);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 700);
    this.sun.intensity = day * (3.2 - warm * 0.8) * (1 - s.rain * 0.96);
    this.sun.color.set(0xfff5e3).lerp(new THREE.Color(0xffb363), warm * 0.8);
    this.hemi.intensity = 0.06 + day * 0.23;
    this.fill.intensity = 0.012 + night * 0.008;
    this.scene.environmentIntensity =
      (0.5 - s.rain * 0.22) * day + night * 0.12;
    // Night HDRs are exposed photographs: keep their radiance below the streetlights.
    this.scene.backgroundIntensity =
      this.desiredSky === "night"
        ? 0.008
        : this.desiredSky === "blue"
          ? 0.2
          : 0.8;
    const fog = new THREE.Color(0xb2c6d5)
      .lerp(new THREE.Color(0xd3ad86), warm * 0.65)
      .lerp(new THREE.Color(0x778d9f), s.rain)
      .lerp(new THREE.Color(0x101d32), night);
    this.scene.fog.color.copy(fog);
    this.scene.fog.density = 0.00013 + s.haze * 0.00048 + s.rain * 0.00065;
    this.renderer.toneMappingExposure = s.exposure * (1.03 + night * 0.17);
    this.windowLight.value = night * 0.7;
    this.night = night;
    return night;
  }
}
