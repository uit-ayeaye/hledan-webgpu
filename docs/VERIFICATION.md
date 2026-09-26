# Rendering rebuild verification — 26 September 2026

## Version 2

- `npm test`: 9 passing tests, including weather boundary selection, six valid 2K HDR assets, restored material maps, flyover collision, player gravity/jump and vehicle spacing.
- `npm run build`: production Vite build passes. Approximately 43 MB in `dist`; the six HDR files are loaded on demand rather than all at startup. JS about 343 KB gzipped.
- Browser: actual WebGPU backend in the Codex in-app browser. Clean final Ultra startup produced no warning/error logs. All six weather presets were activated and visually inspected. Native screenshots appear in the implementation task.
- High: GTAO, SSR and TRAA observed running; roughly 39–44 FPS at adaptive 60% in the tested street view. Ultra after half-resolution GI: roughly 47–60 FPS at adaptive 67–84% in the tested views. These observations used different views/window sizes and are not a controlled cross-tier benchmark or a hardware guarantee.
- Ultra's initial five-attachment configuration exceeded the device's baseline attachment budget. Fixed by packing roughness with encoded normals, retaining at most four attachments. Retested cleanly after fixing.
- Tested desktop HUD, settings, six themes, keyboard activation, orbit, walk/jump, and photo mode. Save photograph reached successful canvas conversion and the download action; a new downloaded file was not independently located during this pass, so end-to-end file delivery is not claimed here.
- The previous version's walk/collision tests remain passing. Compatibility rendering was tested in version 1; version 2's new HDR/material fallback needs a separate WebGL2 browser check if used as a deployment target.

## Visual corrections made during browser review

Reduced giant reflective puddles, removed animated asphalt-wave normals, removed floating random facade light rectangles, used authored roughness masks for glass, restored original 4K textures, shadowed the flyover and foliage, reduced ambient fill, corrected night sky exposure, widened the orbit pitch range for looking up at the skyline, and concentrated rain near the camera. Intro text dismisses when the user starts manipulating the scene.

## Practical limits

Original merged map geometry, cutout trees, low-detail vehicles and baked lighting remain visible, especially close up. Captured sky panoramas are not a volumetric weather simulation. SSR and SSGI cannot recover off-screen geometry; temporal reconstruction can ghost on rain. Adaptive resolution may soften the picture. Rain uses topmost-surface height-field collision; puddle rings are visual effects. Street sounds remain synthesized. This is a graphics rebuild of the Hledan map, not a new photogrammetry survey.
