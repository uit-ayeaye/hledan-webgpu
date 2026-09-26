import fs from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const b = fs.readFileSync("public/models/hledan.glb");
const { scene } = await new GLTFLoader().parseAsync(
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  "",
);
let roads = "",
  buildings = "";
scene.traverse((m) => {
  if (!m.isMesh || /^Tree/.test(m.name)) return;
  const g = m.geometry,
    p = g.attributes.position,
    idx = g.index;
  for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) => (idx ? idx.getX(i + j) : i + j));
    const xyz = v.map((j) => [p.getX(j), p.getY(j), p.getZ(j)]);
    const area = Math.abs(
      (xyz[1][0] - xyz[0][0]) * (xyz[2][2] - xyz[0][2]) -
        (xyz[2][0] - xyz[0][0]) * (xyz[1][2] - xyz[0][2]),
    );
    if (area < 5) continue;
    const path =
      "M" +
      xyz.map((a) => `${a[0].toFixed(1)},${a[2].toFixed(1)}`).join("L") +
      "Z";
    if (m.name === "Road_final") roads += path;
    else if (
      /Buildings|Hledan_centre/.test(m.name) &&
      xyz.every((a) => a[1] > 55)
    )
      buildings += path;
  }
});
fs.writeFileSync(
  "public/neighbourhood.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-450 -920 900 1840"><path fill="#56645b" opacity=".65" d="${buildings}"/><path fill="#aeaf91" opacity=".6" d="${roads}"/><path d="M105 -150 C42 80 42 140 -17 320 S-24 405 18 610" fill="none" stroke="#e0c88d" stroke-width="13" opacity=".7"/></svg>`,
);
