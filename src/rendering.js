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
