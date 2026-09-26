# Verification — September 26, 2026

## Automated checks

`npm test`: seven passing regression tests, covering floor/deck separation and overhead clearance, wall collisions, height-banded street props, persisted-setting sanitization, local GLB/texture integrity, traffic lane spacing/pedestrian stopping, and player gravity/jump/landing/movement.

`npm run build`: production build succeeds with Vite 6.4.3 and Three.js 0.184.0. Approximately 1.18 MB of JavaScript (335 KB gzip); static distribution approximately 9.4 MB, including local map and textures. First shader compilation is separate from download time.

GitHub Actions independently runs `npm ci`, tests, production build and Pages deployment. Initial deployment run: https://github.com/uit-ayeaye/hledan-webgpu/actions/runs/36222586802 (successful).

## Browser checks

Tested in the Codex desktop application's Chromium browser, at desktop sizes including 1440 × 900. This is one local GPU/browser environment, not a hardware compatibility survey.

- Real `webgpu` backend reported by the renderer, not inferred from the browser's API presence.
- Authored map, cutout trees, local textures, traffic, street lighting and new UI rendered and visually inspected.
- Golden hour, monsoon and after-dark presets exercised. GPU rain and wet surface response render without new shader errors after fixes.
- Initial ambient-occlusion compiler error was corrected by supplying a normal MRT alongside depth. Final tested builds have no new console errors.
- Initial legacy point-halo incompatibility corrected with instanced SpriteNodeMaterial quads.
- Walking spawn visually checked at road level facing Hledan Centre; keyboard input changed the position. Controller regression test additionally verifies sustained movement, gravity, jump and landing.
- Pointer-lock is not granted by this embedded browser. Drag-look plus focused-canvas keyboard input is provided and the fallback was exercised. Native pointer capture in other browsers remains a device-specific check.
- Hosted HTTPS build opened and visually verified on the actual WebGPU backend; sound activation and Fly mode exercised without console errors.
- Graphics quality selection, bloom/AO switches, settings reset, and preference persistence exercised.
- `?compat=1` forced WebGL2: the scene rendered, the backend badge correctly changed, and compute rain was explicitly disabled. No errors were recorded in that compatibility session.
- Photo mode hides the interface. Save photograph produced a valid 2116 × 1323 PNG, opened and visually verified. The unmodified export is `docs/hledan-monsoon.png`.
- Frame-rate samples varied with view, shader compilation and browser interaction, roughly 45–60 fps in normal sampled views; adaptive resolution reduced scale under load. These are observations, not a 60-fps guarantee or isolated GPU benchmarks.

## Hosting

The project is a separate public repository: https://github.com/uit-ayeaye/hledan-webgpu.

GitHub Pages inherits the account's existing custom domain, so the canonical URL is **https://thomasdlynn.dev/hledan-webgpu/**. The `uit-ayeaye.github.io/hledan-webgpu/` URL redirects there. HTTPS enforcement is enabled. HTTP checks returned 200 for the canonical page. Original `/showcase/hledan/` source files were not edited.

## Limits

No physical mobile-device testing or broad GPU/driver testing. No field-recording accuracy claim. No complete traversal of every map collision, no raw Tidewater engine equivalence, no full Yangon map. See the reference audit and README for explicit rendering/physics limitations.
