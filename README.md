# Hledan — a little closer to home

A standalone desktop WebGPU experience built around Thomas D. Lynn’s original Hledan Junction map. Walk under the flyover, watch YBS traffic, listen to the street, and let the afternoon turn into monsoon or night.

**Live:** https://thomasdlynn.dev/hledan-webgpu/

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
- Authored Hledan map, original 4K facade and roughness textures recovered from the Unity source package, real asphalt aggregate/height/roughness, preserved Burmese signage, YBS buses and taxis. Glass lighting follows the original texture masks; floating facade light rectangles are removed. Foliage sways in wind.
- Six captured 2K HDR skies with corresponding prefiltered environment lighting, time of day, exponential haze and directional shadows from buildings, flyover and foliage. Sky files load on demand and cache during the visit.
- HDR scene pass with packed normal/roughness and motion-vector buffers, GTAO, roughness-aware screen-space reflections, bloom and AgX tone mapping. High adds temporal anti-aliasing; Ultra adds half-resolution screen-space global illumination with temporal accumulation. Balanced keeps FXAA and GTAO.
- 18,000 camera-local GPU rain particles: gravity, terminal velocity, wind and collision against a 128² height field of the actual map. 900 procedural surface ripple instances; restrained puddle coverage, wet material response, and stationary asphalt relief.
- 18 moving vehicles on two measured flyover lanes; pedestrian braking and player collision against traffic, static props and map walls.
- Rebuilt tea-shop geometry: sagging woven tarps, open stool legs and braces, serving benches, saucers, tea cups, milk tins and reflective kettles. Small crockery is culled beyond 100 map units (~67 m); furniture casts shadows.
- Radially masked lamp halos replace square night-light sprites. Camera-following, texel-snapped directional shadows, refreshed at a bounded 12/20/30 Hz for Balanced/High/Ultra while the main scene continues rendering. Ultra filters both bounced light and occlusion with depth/normal rejection.
- First-person movement simulated at 90 Hz with interpolated camera position, smooth step-up, gravity, jump, floor/ceiling separation and swept horizontal substeps. Walk/fly/orbit preserve position and viewing direction where a safe walking surface exists. Pointer lock and drag-look fallback; gravity continues when UI has focus.
- A live neighbourhood map generated from the actual road/building mesh, with camera heading, nearest-landmark distance and walking waypoints. Press N to open it. `?place=tea&moment=golden` opens a shareable landmark view.
- Positional/proximity procedural city soundscape, horns, tea-glass clinks, rain, and footsteps. Sound starts only on request.
- Six weather presets (dawn, clear skies, golden hour, monsoon, blue hour, after dark), graphics tiers, adaptive resolution, manual exposure, time slider, day progression, persistent settings, guided orbit, photo capture, fullscreen, reduced-motion defaults and background suspension.
- Original portfolio remains untouched. Map loading is separate from engine modules so future districts can be added.

## Controls

| Control       | Action                        |
| ------------- | ----------------------------- |
| Drag / scroll | Orbit / zoom in Explore       |
| WASD          | Move in Walk / Fly            |
| Mouse / drag  | Look in Walk / Fly            |
| Shift         | Run / fast flight             |
| Space         | Jump / fly up                 |
| C             | Fly down                      |
| Esc           | Release captured mouse        |
| H / P / M / N | Settings / photo / sound / neighbourhood |

## Scope and limitations

This is a Hledan release, not a city-wide reconstruction. The source is a stylized map with some baked illumination; lighting improvements cannot recover missing geometry or scan detail. Rain uses a height field (topmost surface), and ripples are a visual effect, not a mass-conserving water simulation. Traffic is kinematic, not a drivable rigid-body vehicle simulation. Screen-space reflections and bounced light can only see geometry present in the current view; reflections use the HDR environment when geometry is unavailable. Temporal reconstruction can show ghosting, especially on rain. Clouds are captured HDR panoramas, not Tidewater’s volumetric cloud system. Ultra costs more GPU time and is optional; adaptive resolution can trade sharpness for frame rate. No ocean, swimming, fishing, boat, marine ecosystem, XPBD particle fluids, cloth, or destructible buildings are claimed.

Read [the reference audit](docs/REFERENCE-AUDIT.md) for the differences from the three supplied repositories, and [verification](docs/VERIFICATION.md) for measured results and test limits.

## Deployment

GitHub Actions tests and builds on pushes to `main`, then deploys `dist/` through GitHub Pages. `base: './'` keeps the app portable to a repository subpath or a static host. Enable Pages with the GitHub Actions source. No secrets or server are needed at runtime.

## Attribution and asset rights

Map and original Hledan code: Thomas D. Lynn / original portfolio project. This repository does not relicense those assets. See [asset notices](public/ASSET-NOTICE.txt) for the original terms and vehicle attribution. HDR skies and asphalt are CC0 from Poly Haven (Greg Zaal, Jarod Guest and the asphalt asset authors; linked in the asset notices). The bus is CC BY 3.0 (Poly by Google); car is CC0 (Quaternius). Three.js is MIT. Dan Greenheck’s repositories are credited as technical research; Tidewater’s engine and third-party assets are not bundled. The WebGPU skill was consulted as documentation, not installed as a global agent skill.
