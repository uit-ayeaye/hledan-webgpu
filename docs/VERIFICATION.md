# Rendering rebuild verification — 26 September 2026

## Version 2.1 — street detail and exploration

- `npm test`: 13 passing tests. Added checks for finite/complete detail geometry, physical proportions, real-map waypoint clearance, consistent walking across 30/60/144 Hz render rates, mode-switch position preservation, gravity while UI is focused, and bounded shadow scheduling.
- `npm run build`: passes; JavaScript approximately 346 KB gzip. A generated 60 KB SVG map and procedural geometry replace the need for additional model downloads. `npm run map:build` regenerates the schematic from the original GLB.
- WebGPU: visually checked close tea-shop geometry in golden hour, monsoon walking and night. High SSR/TRAA and Ultra GI compiled and rendered without warning/error logs. The GI filter processes RGB and occlusion alpha with depth/normal edge rejection. Native screenshots are in the implementation task.
- UI: tested entering Walk at the current tea-shop location, N map shortcut, landmark travel retaining Walk, live map heading/distance, and URL landmark selection. Both desktop and narrow layouts were inspected.
- Performance observations: High golden-hour walking was approximately 44 FPS at 92% adaptive scale; monsoon approximately 44 FPS at 60%. Ultra was roughly 37–43 FPS as adaptive scale moved between 76% and 60%. These are observations from changing views in the desktop test browser, not a controlled before/after speed claim. Ultra remains more expensive and optional.
- Forced WebGL2 fallback rendered the new geometry and monsoon materials with no warning/error logs; observed about 41 FPS at 84% adaptive scale in the tested view. GPU rain/SSR/GI/TRAA correctly disabled.
- Shadow work is scheduled at 12/20/30 Hz by tier, with immediate refresh for lighting/coverage changes. Night and photo mode reuse the cache. The world image continues rendering independently. Moving shadows can therefore update less frequently than the display.
- Night review found the custom halo color node bypassed the texture alpha mask. Added an explicit radial opacity node to remove square light sprites.
- Geometry improvements focus on all 29 tea shops. The original buildings, cutout trees and vehicle meshes still have limited close-up detail; this update does not claim full photorealism or a surveyed reconstruction.

## Version 2

- `npm test`: 9 passing tests, including weather boundary selection, six valid 2K HDR assets, restored material maps, flyover collision, player gravity/jump and vehicle spacing.
- `npm run build`: production Vite build passes. Approximately 43 MB in `dist`; the six HDR files are loaded on demand rather than all at startup. JS about 343 KB gzipped.
- Browser: actual WebGPU backend in the Codex in-app browser. Clean final Ultra startup produced no warning/error logs. All six weather presets were activated and visually inspected. Native screenshots appear in the implementation task.
- High: GTAO, SSR and TRAA observed running; roughly 39–44 FPS at adaptive 60% in the tested street view. Ultra after half-resolution GI: roughly 47–60 FPS at adaptive 67–84% in the tested views. These observations used different views/window sizes and are not a controlled cross-tier benchmark or a hardware guarantee.
- Ultra's initial five-attachment configuration exceeded the device's baseline attachment budget. Fixed by packing roughness with encoded normals, retaining at most four attachments. Retested cleanly after fixing.
- Tested desktop HUD, settings, six themes, keyboard activation, orbit, walk/jump, and photo mode. Save photograph reached successful canvas conversion and the download action; a new downloaded file was not independently located during this pass, so end-to-end file delivery is not claimed here.
- Forced WebGL2 compatibility (`?compat&moment=monsoon`) rendered the new HDR sky and materials without warning/error logs. Observed approximately 40 FPS at full render scale in the tested view. GPU rain, SSR, SSGI and TRAA correctly report disabled; GTAO/FXAA remain active. The previous version's walk/collision tests remain passing.

## Visual corrections made during browser review

Reduced giant reflective puddles, removed animated asphalt-wave normals, removed floating random facade light rectangles, used authored roughness masks for glass, restored original 4K textures, shadowed the flyover and foliage, reduced ambient fill, corrected night sky exposure, widened the orbit pitch range for looking up at the skyline, and concentrated rain near the camera. Intro text dismisses when the user starts manipulating the scene.

## Practical limits

Original merged map geometry, cutout trees, low-detail vehicles and baked lighting remain visible, especially close up. Captured sky panoramas are not a volumetric weather simulation. SSR and SSGI cannot recover off-screen geometry; temporal reconstruction can ghost on rain. Adaptive resolution may soften the picture. Rain uses topmost-surface height-field collision; puddle rings are visual effects. Street sounds remain synthesized. This is a graphics rebuild of the Hledan map, not a new photogrammetry survey.
