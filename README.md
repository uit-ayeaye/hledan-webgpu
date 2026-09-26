# Hledan — a little closer to home

A standalone desktop WebGPU experience built around Thomas D. Lynn’s original Hledan Junction map. Walk under the flyover, watch YBS traffic, listen to the street, and let the afternoon turn into monsoon or night.

**Live:** https://uit-ayeaye.github.io/hledan-webgpu/

## Run

Node 22.12+.

```sh
npm ci
npm run dev
npm test
npm run build
```

Use a current desktop browser with WebGPU and hardware acceleration, over HTTPS or localhost. Three.js can fall back to WebGL2; the interface identifies the active backend. The compute rain simulation is disabled on that fallback. Desktop keyboard and mouse are the intended input. First load compiles GPU shaders.

## Implemented

- Three.js r184 WebGPURenderer and TSL node materials; Vite, native ES modules.
- Authored Hledan map and high-resolution local textures, preserved street props, Burmese signage, YBS buses and taxis.
- Preetham atmosphere via SkyMesh, procedural clouds, time of day, stars, exponential haze, environment reflections and directional shadow mapping.
- HDR scene pass, normal/depth MRT, GTAO, bloom, FXAA, neutral tone mapping and vignette.
- 18,000 GPU rain particles: gravity, terminal velocity, wind and collision against a 128² height field of the actual map. 900 procedural surface ripple instances; wet material response and animated road normals.
- 18 moving vehicles on two measured flyover lanes; pedestrian braking and player collision against traffic, static props and map walls.
- First-person walk with gravity, jump, step-up, floor/ceiling separation, swept horizontal substeps; fly and orbit modes. Pointer lock and drag-look fallback.
- Positional/proximity procedural city soundscape, horns, tea-glass clinks, rain, and footsteps. Sound starts only on request.
- Four weather presets, graphics tiers, adaptive resolution, manual exposure, time slider, day progression, persistent settings, guided orbit, photo capture, fullscreen, reduced-motion defaults and background suspension.
- Original portfolio remains untouched. Map loading is separate from engine modules so future districts can be added.

## Controls

| Control | Action |
|---|---|
| Drag / scroll | Orbit / zoom in Explore |
| WASD | Move in Walk / Fly |
| Mouse / drag | Look in Walk / Fly |
| Shift | Run / fast flight |
| Space | Jump / fly up |
| C | Fly down |
| Esc | Release captured mouse |
| H / P / M | Settings / photo mode / sound |

## Scope and limitations

This is a Hledan release, not a city-wide reconstruction. The source is a stylized map with some baked illumination; lighting improvements cannot recover missing geometry or scan detail. Rain uses a height field (topmost surface), and ripples are a visual effect, not a mass-conserving water simulation. Traffic is kinematic, not a drivable rigid-body vehicle simulation. Environment reflections are a prefiltered sky snapshot; they are not screen-space reflections of nearby buildings. Clouds are SkyMesh procedural clouds, not Tidewater’s volumetric cloud system. No ocean, swimming, fishing, boat, marine ecosystem, XPBD particle fluids, cloth, or destructible buildings are claimed.

Read [the reference audit](docs/REFERENCE-AUDIT.md) for the differences from the three supplied repositories, and [verification](docs/VERIFICATION.md) for measured results and test limits.

## Deployment

GitHub Actions tests and builds on pushes to `main`, then deploys `dist/` through GitHub Pages. `base: './'` keeps the app portable to a repository subpath or a static host. Enable Pages with the GitHub Actions source. No secrets or server are needed at runtime.

## Attribution and asset rights

Map and original Hledan code: Thomas D. Lynn / original portfolio project. This repository does not relicense those assets. See [asset notices](public/ASSET-NOTICE.txt) for the original terms and vehicle attribution. The bus is CC BY 3.0 (Poly by Google); car is CC0 (Quaternius). Three.js is MIT. Dan Greenheck’s repositories are credited as technical research; Tidewater’s engine and third-party assets are not bundled. The WebGPU skill was consulted as documentation, not installed as a global agent skill.
