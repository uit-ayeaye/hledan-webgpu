# Reference audit and rendering decisions

Inspected September 26, 2026. The supplied screenshots and repository documents are reference material, not user instructions. The requested release scope was clarified to **Hledan first**.

## What the references actually use

### Tidewater

Source: https://github.com/dgreenheck/tidewater at `4811ba48d795197de5621985f404e765c0b7c0ef`.

The current branch is a native JavaScript WebGPU / WGSL engine, not a Three.js application. Its only package dependencies are development tooling (Vite and WebGPU test support). `docs/PORTING.md` describes its earlier migration from Three.js/TSL; that history does not make current shaders directly importable as TSL. The engine contains its own math, scene objects, geometry, GLB loading, animation, GPU resource management, shader composition, shadows, rendering passes, and readback.

The render sequence in `src/post/PostFX.js` uses an HDR/velocity scene, half-resolution GTAO, underwater/AO composition, temporal upscaling, bloom, grading and exposure. Sky systems include atmosphere lookup tables, clouds and cloud shadows. The ocean is several interdependent systems: FFT spectra, shallow water, depth-aware shore breaking, caustics, refraction, wakes and spray. Boat, swimming and fishing query those systems. A direct port requires the engine's frame layout, bindings, depth convention, motion vectors and data dependencies, not just copying a water shader.

The live demo was opened and its loading/game controls inspected. It compiles many shaders and is explicitly aimed at a capable desktop GPU. The original map and the new build were visually inspected in the same browser environment. No claim is made that every Tidewater gameplay path was exercised.

### WebGPU Claude skill

Source: https://github.com/dgreenheck/webgpu-claude-skill at `af2319bd01bb7cc881267a9ef42cafdaf5e9029d`.

This is documentation/examples for Three.js WebGPU/TSL, not Tidewater's current engine. It correctly calls for `three/webgpu`, node materials, async renderer initialization, GPU storage buffers and compute passes. Its post-processing documentation identifies `RenderPipeline` as the successor to `PostProcessing` in r183. It was consulted locally as reference; it was not installed into the user's agent configuration. No standalone root license file was present in the inspected snapshot, so its files are not redistributed with this project.

### Three.js particle fluids

Source: https://github.com/dgreenheck/threejs-particle-fluids at `8af219d8db90568aab1513d692b407edb7888ffb`.

A separate TypeScript library/demo pinned to Three.js 0.184.0. It has particle storage, spatial hash grids, XPBD constraints, pressure/density solvers, viscosity, surface tension, coupled rigid/soft bodies, cloth and gas. `src/core/frameStepper.ts` separates presentation timing from solver stepping. The README states a requirement of 1,024 compute invocations/workgroup and 10 storage buffers per shader stage; this is significantly stronger than baseline WebGPU. There is no WebGL simulation fallback. It is an experimental visualization library, not a general drop-in physics engine.

Its MIT code can be adapted with attribution, but integrating the entire particle solver into Hledan simply to make rain would add substantial device restrictions and runtime cost. Hledan instead has a smaller original GPU rain integrator and analytic ripple rendering. These are not presented as the particle-fluid solver.

## Adopted versus deferred

| Reference technique | This Hledan release | Difference / reason |
|---|---|---|
| Native browser GPU execution | Three.js WebGPURenderer + TSL | Real WebGPU, with Three managing resources; not raw WGSL engine parity |
| Atmospheric sky | SkyMesh Preetham atmosphere, sun, procedural clouds, stars | Not Hillaire multi-LUT scattering or volumetric cloud ray marching |
| HDR post processing | GTAO, bloom, FXAA, vignette, exposure, neutral tone mapping | No temporal motion vectors, TAAU, motion blur or auto exposure |
| Dynamic quality | Three quality tiers and adaptive pixel ratio | Targets frame budget; performance depends on hardware and view |
| Shadows | Directional shadow map, 1024 / 2048 / 4096 | Not cascaded contact-hardening sun shadows |
| Wet surfaces | Prefiltered environment specular, clearcoat, roughness, procedural road normals | No screen-space building reflections |
| GPU particles | 18k rain drops + 900 surface ripple quads | Height-field collisions; no pressure/XPBD fluid volume |
| First-person movement | Gravity, jumping, wall collision, step-up, floor/ceiling separation | No swimming, boat walking or crouching |
| Moving vehicles | Measured two-lane flyover route and pedestrian braking | Kinematic, not drivable rigid-body vehicles |
| Environmental audio | Synthesized traffic, horns, cups, birds, rain, footsteps | No claimed Yangon field recordings |
| Photo / settings / saved preferences | Implemented | Settings persist locally; photo exports the rendered canvas |
| GLB and local assets | Original Hledan plus attributed vehicle models | No Tidewater island, Rocketbox characters or ocean assets bundled |
| Shipping | Vite + GitHub Actions + GitHub Pages | Standalone repository, same class of static hosting |
| World scale | Hledan only | Other Yangon districts need separately sourced/authored maps |

## Existing-map constraints

The authored map contains roughly 59.5k triangles merged into a small number of meshes. Most buildings and trees cannot be independently manipulated without reconstructing those meshes. High-resolution albedo textures contain lighting. Baked illumination remains visible at night and limits the realism obtainable through real-time lighting alone. The source trees are cutout geometry, not botanically modeled trees. Walls do not contain modeled shop interiors. The project explicitly avoids labeling these as newly scanned/photoreal assets.

## Further work needed for reference-level fidelity

1. Replace/author close-range building facades, interiors, road surface normals and tropical trees, using reference photography with appropriate rights.
2. Capture or license actual Hledan ambience and accurately placed landmarks; curate Burmese shop names with local review.
3. Introduce mesh LODs, district streaming and verified geographic alignment before expanding across Yangon.
4. Add temporal history/motion vectors and screen-space or planar reflections with measured memory budgets.
5. Integrate rigid-body vehicle controls and navigation for pedestrians as separately tested systems.
6. Add an optional fluid/cloth experiment only after checking adapter limits and keeping a broadly compatible default.

The supplied repositories are preserved outside the deliverable in `../references/` for continued local research. Their source/config inventory and exact commits are recorded in [REFERENCE-INVENTORY.md](REFERENCE-INVENTORY.md).
