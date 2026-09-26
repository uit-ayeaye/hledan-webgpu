import SSGINode from "three/addons/tsl/display/SSGINode.js";

// SSGINode exposes setSize but does not have a resolutionScale setting in r184.
// Trace at half resolution; TRAA accumulates the jittered samples at output size.
export class HalfResolutionSSGI extends SSGINode {
  setSize(width, height) {
    super.setSize(
      Math.max(1, Math.floor(width / 2)),
      Math.max(1, Math.floor(height / 2)),
    );
  }
}

import {
  Fn,
  vec2,
  vec4,
  float,
  uv,
  textureSize,
  perspectiveDepthToViewZ,
} from "three/tsl";

// Filter both radiance (RGB) and occlusion (alpha); a color-only blur leaves AO grain.
// Depth and normals reject neighbours across silhouettes, preserving kerbs and thin poles.
export function bilateralGI(input, depth, normal, camera) {
  return Fn(() => {
    const coord = uv();
    const texel = vec2(1).div(textureSize(input));
    const centerZ = perspectiveDepthToViewZ(
      depth.sample(coord).r,
      camera.near,
      camera.far,
    );
    const centerNormal = normal.sample(coord).xyz.normalize();
    const sum = vec4(0).toVar(),
      total = float(0).toVar();
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const at = coord.add(texel.mul(vec2(x, y)));
        const z = perspectiveDepthToViewZ(
          depth.sample(at).r,
          camera.near,
          camera.far,
        );
        const n = normal.sample(at).xyz.normalize();
        const w = z
          .sub(centerZ)
          .abs()
          .mul(-2)
          .exp()
          .mul(n.dot(centerNormal).max(0).pow(16))
          .mul(x === 0 && y === 0 ? 1 : 0.65)
          .toVar();
        sum.addAssign(input.sample(at).mul(w));
        total.addAssign(w);
      }
    return sum.div(total.max(0.001));
  })();
}
