import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Model in metres, then use the source map's 1.5 units/metre scale.
function finish(parts) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.scale(1.5, 1.5, 1.5);
  g.computeBoundingSphere();
  return g;
}
function paint(g, hex, x = 0, y = 0, z = 0) {
  g.translate(x, y, z);
  const c = new THREE.Color(hex),
    colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}
function tube(a, b, r, color) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, start.distanceTo(end), 8);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.clone().sub(start).normalize(),
    ),
  );
  const mid = start.add(end).multiplyScalar(0.5);
  return paint(g, color, ...mid.toArray());
}
export function teaCanopy() {
  const g = new THREE.PlaneGeometry(3.2, 3.2, 24, 24).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    // Raised ridge, sag between corner ties, and shallow longitudinal folds.
    p.setY(
      i,
      2.25 +
        0.24 * (1 - Math.abs(x) / 1.6) -
        0.11 * Math.sin(((z + 1.6) / 3.2) * Math.PI) +
        0.018 * Math.sin(z * 22) * (1 - Math.abs(x) / 1.6),
    );
  }
  g.computeVertexNormals();
  return finish([paint(g, 0xffffff)]);
}
export function teaFurniture() {
  const parts = [];
  for (const x of [-1.45, 1.45])
    for (const z of [-1.45, 1.45]) {
      parts.push(tube([x, 0, z], [x, 2.25, z], 0.035, 0x807567));
      parts.push(tube([x, 2.22, z], [0, 2.48, z], 0.022, 0x716b61));
    }
  parts.push(
    paint(
      new THREE.CylinderGeometry(0.52, 0.52, 0.035, 40),
      0xb6ac91,
      0,
      0.46,
      0,
    ),
  );
  parts.push(
    paint(
      new THREE.TorusGeometry(0.51, 0.018, 6, 40).rotateX(Math.PI / 2),
      0x7d8583,
      0,
      0.468,
      0,
    ),
  );
  for (const x of [-0.3, 0.3])
    for (const z of [-0.3, 0.3])
      parts.push(tube([x, 0, z], [x * 0.75, 0.44, z * 0.75], 0.018, 0x656f6c));
  const stools = [
    [-0.85, 0.15],
    [0.85, -0.15],
    [0.1, 0.85],
    [-0.15, -0.85],
  ];
  stools.forEach(([x, z], i) => {
    const c = [0xbd3025, 0x21619d, 0x287447, 0xc19329][i];
    parts.push(
      paint(new THREE.CylinderGeometry(0.17, 0.18, 0.035, 24), c, x, 0.31, z),
    );
    // Open underneath: splayed legs and stretchers instead of solid cylinders.
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        parts.push(
          tube(
            [x + a * 0.15, 0.02, z + b * 0.15],
            [x + a * 0.105, 0.3, z + b * 0.105],
            0.017,
            c,
          ),
        );
    for (const a of [-1, 1]) {
      parts.push(
        tube(
          [x - 0.13, 0.12, z + a * 0.13],
          [x + 0.13, 0.12, z + a * 0.13],
          0.012,
          c,
        ),
      );
      parts.push(
        tube(
          [x + a * 0.13, 0.12, z - 0.13],
          [x + a * 0.13, 0.12, z + 0.13],
          0.012,
          c,
        ),
      );
    }
  });
  // Wood slats of the serving bench, its legs and cross braces.
  for (let i = 0; i < 5; i++)
    parts.push(
      paint(
        new THREE.BoxGeometry(0.095, 0.04, 1.45),
        i % 2 ? 0x776047 : 0x927454,
        -1.06 + i * 0.1,
        0.78,
        0,
      ),
    );
  for (const x of [-1.06, -0.66])
    for (const z of [-0.63, 0.63])
      parts.push(tube([x, 0, z], [x, 0.77, z], 0.025, 0x514b41));
  return finish(parts);
}
export function teaCrockery() {
  const parts = [];
  for (const [x, z] of [
    [-0.28, 0],
    [0.22, 0.13],
    [0.14, -0.27],
  ]) {
    parts.push(
      paint(
        new THREE.CylinderGeometry(0.08, 0.06, 0.009, 24),
        0xe3dfd0,
        x,
        0.485,
        z,
      ),
    );
    const points = [
      [0.025, 0],
      [0.039, 0.007],
      [0.044, 0.063],
      [0.039, 0.067],
      [0.032, 0.009],
    ].map((p) => new THREE.Vector2(...p));
    parts.push(
      paint(new THREE.LatheGeometry(points, 24), 0xece7d8, x, 0.491, z),
    );
    parts.push(
      paint(
        new THREE.CylinderGeometry(0.037, 0.037, 0.002, 24),
        0x864922,
        x,
        0.545,
        z,
      ),
    );
    parts.push(
      paint(
        new THREE.TorusGeometry(0.024, 0.005, 6, 16),
        0xece7d8,
        x + 0.044,
        0.526,
        z,
      ),
    );
  }
  // A stack of saucers and condensed-milk tins on the counter.
  for (let i = 0; i < 5; i++)
    parts.push(
      paint(
        new THREE.CylinderGeometry(0.082, 0.065, 0.009, 24),
        0xe3dfd0,
        -0.86,
        0.814 + i * 0.013,
        0.4,
      ),
    );
  for (const z of [-0.45, -0.26]) {
    parts.push(
      paint(
        new THREE.CylinderGeometry(0.055, 0.055, 0.11, 20),
        0xbda777,
        -0.86,
        0.85,
        z,
      ),
    );
    parts.push(
      paint(
        new THREE.CylinderGeometry(0.056, 0.056, 0.005, 20),
        0xa7aba6,
        -0.86,
        0.907,
        z,
      ),
    );
  }
  return finish(parts);
}
export function teaKettle() {
  const parts = [];
  const profile = [
    [0, 0],
    [0.09, 0],
    [0.13, 0.035],
    [0.135, 0.12],
    [0.09, 0.19],
    [0.07, 0.2],
  ].map((p) => new THREE.Vector2(...p));
  parts.push(
    paint(new THREE.LatheGeometry(profile, 32), 0xb2b6b0, -0.86, 0.805, 0.04),
  );
  parts.push(
    paint(
      new THREE.CylinderGeometry(0.09, 0.09, 0.012, 24),
      0xd1d3c9,
      -0.86,
      1.01,
      0.04,
    ),
  );
  parts.push(
    paint(new THREE.SphereGeometry(0.018, 12, 8), 0x343734, -0.86, 1.03, 0.04),
  );
  const handle = new THREE.TorusGeometry(0.12, 0.013, 8, 24, Math.PI).rotateY(
    Math.PI / 2,
  );
  parts.push(paint(handle, 0x3d413c, -0.86, 0.99, 0.04));
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.75, 0.85, 0.04),
    new THREE.Vector3(-0.67, 0.9, 0.04),
    new THREE.Vector3(-0.63, 1.0, 0.04),
  ]);
  parts.push(
    paint(new THREE.TubeGeometry(path, 12, 0.022, 8, false), 0xbfc3bc),
  );
  return finish(parts);
}

// Small, deterministic woven-fabric map; shared by every canopy and mipmapped at distance.
export function canopyFabric() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d"),
    data = ctx.createImageData(512, 512);
  let seed = 1984;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const noise = (seed >>> 0) / 4294967296;
      const weave = x % 4 === 0 || y % 4 === 0 ? -12 : 0;
      const seam = x < 5 || x > 506 || y < 5 || y > 506 ? -18 : 0;
      const dirt = 6 * Math.sin(x * 0.025) * Math.sin(y * 0.018);
      const value = 239 + weave + seam + dirt + noise * 6;
      const i = (y * 512 + x) * 4;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
      data.data[i + 3] = 255;
    }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
