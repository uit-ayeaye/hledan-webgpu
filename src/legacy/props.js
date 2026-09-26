import { teaCanopy, teaFurniture, teaCrockery, teaKettle, canopyFabric } from "../street-detail.js";
/**
 * Street furniture for the junction.
 *
 * The authored map is merged into eight meshes — every building,
 * vehicle and kerb is welded into one of them, so nothing in it can be moved or
 * rescaled individually. What it lacks is the layer of small stuff that actually
 * makes a Yangon street read as Yangon: the plastic-stool tea shops on the
 * pavement, the vendor umbrellas, the roadside water-pot stands, the YBS buses
 * nosed into the traffic. That layer is added here instead, procedurally.
 *
 * Everything is authored in **metres** and multiplied into map units by
 * WORLD_SCALE at build time, so these are the only objects on the map whose
 * real-world proportions are correct by construction rather than by measurement.
 *
 * Placement is baked, not random. The anchors below were derived offline from
 * the map itself: the road surface (`Road_final`) and the building footprints
 * were rasterised into occupancy grids, then vehicles were placed on road cells
 * with a long enough straight run to hold them, and pavement props on cells that
 * are next to a building but not on the carriageway. Baking keeps load cost at
 * zero and — more importantly — keeps the layout identical every visit, so it
 * can be art-directed and tested rather than re-rolled on each load.
 *
 * Props share instanced geometry. Near tea-shop crockery is distance culled;
 * canopies and furniture cast contact shadows.
 */
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, texture, materialOpacity } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_SCALE as S } from './character.js';
import { ObstacleField } from './obstacles.js';

/* ---------------------------------------------------------------- anchors */
/* [x, y, z] for pavement props; [x, y, z, yaw] for vehicles, where yaw is the
   road's own direction at that point so traffic lines up with the tarmac. */

/* Twenty-seven of these vehicles used to stand in the dark.
 *
 * The occupancy grid that placed them was rasterised from above, so it could
 * not tell a stretch of open carriageway from the same stretch with a flyover
 * eighteen units over the top of it. Five buses and twenty-two taxis landed in
 * the underpass — a fifth of the fleet, in the one part of the map no light
 * reaches and no viewpoint looks at — while the deck itself, seven hundred
 * units of four-lane road, carried no traffic at all.
 *
 * They now stand on the deck. Each y is the deck surface measured by casting
 * down onto it at that exact x/z, and each yaw is the deck's own heading there,
 * sampled twenty units either side; the anchors sit eight units off the crown,
 * which is a lane either side with six units of deck still outboard of the
 * body. Which vehicle got which slot is not arbitrary either: the low tier
 * keeps every second taxi and the first eleven buses, so the seven that survive
 * that thinning were spread along the deck first and the rest filled in between
 * them — otherwise a phone showed a queue at the south end and an empty bridge.
 *
 * Six more had only part of a body in the deck's shadow — a bus beside a pier,
 * a taxi at the mouth of the ramp with six units of headroom. Those went
 * sideways instead, to the nearest stretch of Road_final with no deck within
 * three units of the bodywork and no other vehicle within a bus length.
 *
 * ObstacleField already banded its boxes by height for exactly this map, so the
 * collision moved with them: the underpass is walkable again.
 */

const BUS = [[158,43.6,-278,0],[118,43.5,-230,1.571],[155,43.24,-185,1.571],[47,61.73,32,-0.328],[122,43.2,-98,1.571],[-32,61.73,336,-0.07],[102,43.2,-30,1.571],[-146,43.4,2,1.571],[-25,61.73,438,0.168],[82,43.2,46,1.571],[-142,43.5,58,1.571],[27,61.71,158,-0.264],[-102,43.24,114,1.571],[-58,43.08,194,1.571],[50,43.2,162,1.571],[-82,43.2,170,0.785],[-18,43.2,198,0],[-98,43.4,226,1.571],[46,43.2,230,1.571],[-30,43.19,250,0],[38,43.2,286,1.571],[-86,43.4,294,1.571],[-4,61.71,463,0.228],[66,43.2,342,0.785],[-150,40,350,0],[-78,43.5,354,0],[138,43.2,354,0],[214,43.2,358,0],[6,43.2,366,0],[-50,43.2,402,0.785]].filter(row => row[1] < 50);

const TAXI = [[134,43.7,-278,1.571],[182,43.3,-278,1.571],[154,43.6,-258,1.571],[126,43.6,-250,1.571],[138,43.5,-226,1.571],[110,43.4,-210,1.571],[151,43.42,-215,1.571],[98,43.3,-186,1.571],[79,61.01,-70,-0.291],[86,43.2,-162,1.571],[142,43.2,-154,1.571],[88,62.01,-45,-0.303],[134,43.2,-126,1.571],[74,43.2,-122,1.571],[19,61.73,133,-0.298],[66,43.2,-94,1.571],[-9,61.73,235,-0.303],[118,43.2,-78,1.571],[58,43.2,-54,1.571],[63,61.88,-19,-0.312],[114,43.2,-50,1.571],[71,61.76,6,-0.291],[-158,43.5,-18,0],[46,43.2,-18,1.571],[-126,43.2,-14,1.571],[90,43.2,-10,1.571],[-3,61.65,539,0.24],[-158,43.6,22,1.571],[34,43.2,22,1.571],[94,43.2,22,1.571],[-110,43.1,26,1.571],[56,61.71,57,-0.212],[-134,43.4,38,1.571],[26,43.2,50,1.571],[-110,43.2,62,1.571],[35,61.73,82,-0.264],[78,43.2,66,1.571],[-138,43.5,78,1.571],[18,43.2,78,1.571],[-98,43.1,86,1.571],[70,43.19,90,1.571],[-126,43.5,102,1.571],[10,43.2,106,1.571],[43,61.71,108,-0.296],[70,43.2,114,1.571],[6,61.73,184,-0.25],[14,61.71,209,-0.291],[-2,61.71,260,-0.268],[54,43.2,138,1.571],[-78,43.1,150,0.785],[-2,43.2,150,1.571],[-23,61.73,285,-0.197],[-62,43.1,174,0.785],[-106,43.4,178,1.571],[-6,43.2,178,0],[42,43.2,182,1.571],[-38,43.2,190,0],[-12,61.71,311,-0.193],[-78,43.2,198,0.785],[-106,43.5,206,1.571],[42,43.2,210,1.571],[-16,61.71,362,0.03],[-46,43.1,218,0],[-70,43.2,230,0.785],[22,43.2,230,1.571],[-22,43.2,234,0],[-31,61.73,387,0.05],[42,43.2,250,1.571],[-58,43.2,254,0],[22,43.2,270,1.571],[-78,43.5,274,1.571],[-13,61.71,412,0.105],[-46,43.2,278,0],[10,43.2,294,0.785],[-14,61.72,488,0.245],[-54,43.3,306,0.785],[34,43.2,306,1.571],[-82,43.6,314,1.571],[10,43.2,322,0.785],[8,61.66,514,0.197],[46,43.2,330,0.785],[-62,43.5,334,1.571],[-94,43.6,338,2.356],[-2,43.2,346,0],[-126,41.2,350,0],[26,43.2,350,0],[86,43.2,350,0],[-42,43.3,354,0],[114,43.2,354,0],[162,43.2,354,0],[190,43.2,358,0],[50,43.2,362,0],[234,43.2,362,0],[-98,43.2,366,0],[-146,40,370,0],[20,59.66,565,0.221],[74,43.2,374,0],[134,43.2,374,0],[-74,43.3,378,0],[26,43.2,378,0],[102,43.2,378,0],[210,43.2,378,0],[-46,43.2,382,0],[162,43.2,382,0],[246,43.2,386,0],[50,43.2,390,2.356],[10,57.91,590,0.245],[14,43.2,402,1.571]].filter(row => row[1] < 50);

const TEA = [[122,43.3,-278],[198,43.6,-278],[70,43.3,-202],[50,43.3,-142],[146,43.6,-142],[42,43.3,-70],[-138,43.1,-50],[-194,42.9,-30],[10,43.4,-2],[-102,43.4,2],[102,43.6,18],[-186,43.2,30],[-74,43.4,54],[6,43.4,58],[86,43.6,74],[-146,43.6,98],[70,43.6,134],[66,43.6,206],[-110,44,218],[70,43.6,266],[-90,43.5,298],[50,43.6,322],[118,43.6,330],[194,43.6,334],[250,43.6,358],[82,43.6,390],[158,43.6,394],[218,43.6,414],[26,43.6,418]];

const STALL = [[222,43.6,-278],[186,43.6,-246],[106,43.4,-234],[94,43.3,-202],[162,43.6,-126],[54,43.3,-122],[46,43.3,-90],[-102,43.4,-50],[38,43.4,-50],[-162,43.4,-46],[-134,43.2,-30],[-98,43.4,-18],[30,43.4,-18],[-178,43.6,-14],[-166,44,14],[26,43.4,14],[-86,43.4,18],[122,43.6,22],[2,43.4,38],[94,43.6,42],[-158,44,46],[-98,43.4,46],[106,43.6,70],[-158,43.5,78],[-86,43.1,78],[10,43.4,78],[82,43.6,94],[-14,43.4,98],[-66,43.4,102],[94,43.6,122],[82,43.6,154],[70,43.6,186],[-106,44,238],[54,43.6,250],[-106,44,274],[50,43.6,282],[70,43.6,306],[-90,44,322],[98,43.6,322],[138,43.6,334],[170,43.6,334],[70,43.6,338],[214,43.6,338],[246,43.6,338],[106,43.6,390],[138,43.6,390],[182,43.6,394],[214,43.6,394],[54,43.6,398],[246,43.6,398],[82,43.6,414]];

const POT = [[214,43.6,-278],[86,43.3,-202],[54,43.3,-130],[142,43.6,-130],[38,43.4,-58],[-182,43.7,-42],[-98,43.4,-38],[118,43.6,18],[-166,43.9,30],[26,43.4,30],[-86,43.4,34],[82,43.6,86],[-14,43.4,90],[66,43.6,158],[-106,44,234],[50,43.6,262],[-90,44,314],[90,43.6,322],[162,43.6,334],[234,43.6,338],[66,43.6,394],[138,43.6,406],[210,43.6,410]];

const POLE = [[210,43.6,-278],[198,43.6,-246],[82,43.3,-202],[58,43.3,-134],[146,43.6,-130],[46,43.3,-102],[50,43.3,-62],[-150,43.3,-46],[-182,43.6,-34],[-98,43.4,-34],[34,43.4,-30],[-170,43.8,-2],[-86,43.4,-2],[22,43.4,2],[114,43.6,18],[-86,43.4,38],[14,43.4,38],[-162,43.9,42],[94,43.6,54],[-150,43.6,74],[-90,43.4,74],[6,43.4,74],[106,43.6,86],[-70,43.4,102],[78,43.6,106],[2,43.4,110],[90,43.6,138],[78,43.6,170],[78,43.6,206],[62,43.6,258],[-94,43.5,286],[54,43.6,294],[82,43.6,318],[-106,41.4,326],[114,43.6,330],[150,43.6,334],[186,43.6,334],[226,43.6,338],[94,43.6,390],[130,43.6,390],[170,43.6,394],[206,43.6,394],[242,43.6,398],[42,43.6,402]];

/**
 * The lamp posts the MAP already carries.
 *
 * The photogrammetry mesh has real posts baked into it — the tall highway
 * lamps down the flyover deck, and a scatter of masts along the western
 * avenue — and they never lit, because the merged mesh has no per-object
 * anything. Erecting new procedural stands beside them doubled every pole, so
 * only the LIGHT is added: a lens where the fixture is, a pool on the surface
 * beneath it, and a halo. Rows are the LUMINAIRE — [x, y, z, groundY] — not
 * the post, because a highway lamp's fixture hangs off an arm five units to
 * one side and a bulb drawn at the pole top glows in mid-air beside the dark
 * fixture it is meant to be lighting.
 *
 * **Every row here was measured against the geometry, one at a time.** Both
 * halves of the list needed it:
 *
 *  - The flyover's fourteen are one repeated model carrying exactly 96
 *    triangles, so clustering the deck's lamp-head band and keeping the
 *    96-triangle blobs finds all of them and nothing else. Within each blob
 *    the post is a 5-triangle column at one end and 53 of the 96 triangles
 *    sit in the outer fifth of the arm — that dense far cluster IS the
 *    luminaire, and its underside is at y 72.53. The previous rows sat ~0.7 u
 *    short of it, on the bare arm, which is why the bridge read as balls
 *    floating beside their lamps.
 *
 *  - The street-level rows came from scanning the baked height field for thin
 *    spikes, and that method cannot tell a lamp from a fence post, a sign or
 *    a bump in the terrain. Tested against the mesh, **28 of the original 40
 *    had no usable vertical structure under them** — six had nothing whatever
 *    within three units, in any direction, at any height. They were bulbs hung
 *    on nothing. Those are gone. The twelve that survive each stand on a
 *    column of at least ten triangles running unbroken from the ground, and
 *    sit on that column's own axis and top rather than at a guessed height.
 *
 * Street lighting is not thinner for it: the 44 procedural poles in POLE carry
 * their own lamps and cover the same avenues.
 */
const BAKED_LAMPS = [
  /* the flyover's own fourteen, in pairs down the deck, at the measured
     luminaire underside */
  [-1.9,72.53,278.5,61.7],[-23,72.53,272.5,61.7],[16.6,72.53,213.2,61.7],[-4.5,72.53,207.2,61.7],
  [35.6,72.53,144.8,61.7],[14.5,72.53,138.7,61.7],[-14.9,72.53,342.8,61.7],[-36.8,72.53,341.2,61.7],
  [1.9,72.53,474.3,61.7],[-19.5,72.53,478.9,61.7],[-10.8,72.53,407,61.7],[-32.3,72.53,411.6,61.7],
  [53.2,72.53,82.2,61.7],[32,72.53,76.4,61.7],
  /* street level: the twelve that stand on something real, each at the top of
     its own measured column and centred on that column rather than on the
     scanned guess — the head is the centroid of the top two units of geometry,
     which is the post's own axis */
  [-108.98,53.45,-9.86,43.4],[-88.83,53.45,69.42,43.4],[-196.26,55.35,72.97,41.3],[-81.01,57.49,71.57,43.4],
  [-123.98,50.93,191.96,43.4],[-55.78,53.45,221.39,43.1],[-106.4,53.41,255.87,43.7],[-39.14,49.06,261.29,43.2],
  [-94.13,58.05,306.31,43.5],[-76.04,49.59,340.8,43.6],[29.26,49.2,343.44,43.2],[30.1,50.86,421.44,43.6],
];

/** The luminaire, and the patch of ground under it. */
const lampHead = (r) => ({ x: r[0], y: r[1], z: r[2] });
const lampFoot = (r) => ({ x: r[0], y: r[3] + m(0.06), z: r[2] });
/** The flyover's lamps are the tall ones; they get the wider halo and pool. */
const isDeckLamp = (r) => r[3] > 50;

/* The soundscape needs to know what you are standing next to — a tea shop
   sounds different from four lanes of traffic — so the same anchors drive it. */
export const ANCHORS = { BUS, TAXI, TEA, STALL, POT, POLE };

/* ------------------------------------------------------------- palettes */
/* YBS repainted its fleet into flat single colours, which is why a Yangon bus
   reads as a slab of one strong hue rather than the striped liveries elsewhere
   in the region. Taxis are mostly white or silver hatchbacks with a scatter of
   older blue and maroon saloons. The stools are the giveaway detail: moulded
   plastic in primary colours, on every pavement in the city. */
const BUS_COLOURS   = [0x1f5fa8, 0x2f8f4e, 0xd8482c, 0xe0a52a, 0x2b6fb5];
const TAXI_COLOURS  = [0xdcdcdc, 0xe8e8e8, 0x9aa3ad, 0x2f4c7a, 0x6d2b2b, 0xf0f0f0];
const STOOL_COLOURS = [0xd23b2e, 0x1f6fc4, 0x2f9c4a, 0xe0a92a];
const TARP_COLOURS  = [0x2f7fbf, 0x3f9a5c, 0xc85a3c, 0xd8b23e];

/* --------------------------------------------------------------- helpers */

const m = (x) => x * S;                       // metres -> map units

/**
 * Merge sub-parts into one geometry.
 *
 * mergeGeometries returns **null**, not an error, when the inputs disagree on
 * whether they are indexed — and BoxGeometry and CylinderGeometry are indexed
 * while ExtrudeGeometry is not. A null geometry then reaches the renderer and
 * throws once per frame, from a stack that says nothing about geometry. So:
 * flatten everything to non-indexed first, and refuse loudly if it still fails.
 */
function merge(parts, what) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(flat, false);
  if (!out) throw new Error(`props: could not merge geometry for ${what}`);
  return out;
}

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(m(w), m(h), m(d));
  g.translate(m(x), m(y), m(z));
  return g;
}
function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0, rotX = 0) {
  const g = new THREE.CylinderGeometry(m(rt), m(rb), m(h), seg);
  if (rotX) g.rotateX(rotX);
  g.translate(m(x), m(y), m(z));
  return g;
}

/* Paint a sub-geometry by baking vertex colours, so one prop can carry several
   colours inside a single instanced draw. The per-instance colour multiplies
   this, which is what lets 30 buses share one mesh and still differ. */
function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* ---------------------------------------------------------------- shapes */

/** YBS bus: 11.5 x 2.5 x 3.2 m, the real thing. Body colour is left white so
    the per-instance colour supplies it; glass and wheels are baked dark. */
/* A rounded slab, extruded along its length. This is what stops the vehicles
   reading as boxes: a real bus is a rounded-corner extrusion with a strong
   horizontal glass band, and the bevel doing the corner work is what the eye
   reads first — long before it counts polygons. Bevelled extrusion buys that
   silhouette for a couple of hundred triangles. */
function shellGeo(w, h, len, radius, bevel = 0.06) {
  const hw = w / 2, r = Math.min(radius, hw - 0.001, h / 2 - 0.001);
  const sh = new THREE.Shape();
  sh.moveTo(-hw + r, -h / 2);
  sh.lineTo(hw - r, -h / 2);
  sh.quadraticCurveTo(hw, -h / 2, hw, -h / 2 + r);
  sh.lineTo(hw, h / 2 - r);
  sh.quadraticCurveTo(hw, h / 2, hw - r, h / 2);
  sh.lineTo(-hw + r, h / 2);
  sh.quadraticCurveTo(-hw, h / 2, -hw, h / 2 - r);
  sh.lineTo(-hw, -h / 2 + r);
  sh.quadraticCurveTo(-hw, -h / 2, -hw + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: len - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 1, curveSegments: 3, steps: 1,
  });
  g.translate(0, 0, -(len - bevel * 2) / 2);
  g.scale(S, S, S);
  return g;
}

/**
 * A road wheel: tyre plus a paler hub.
 *
 * Rotated about **Z**, not X. A cylinder's axis starts along Y, so rotateX
 * swings it to Z — pointing the axle down the length of the vehicle, which
 * mounts every wheel like a barrel facing forward and throws its diameter out
 * sideways. That alone made the bus measure 3.35 m across instead of 2.50.
 * The axle has to run along X, which is a Z rotation.
 */
function wheelGeo(x, y, z, r = 0.32, width = 0.20) {
  const tyre = new THREE.CylinderGeometry(m(r), m(r), m(width), 10);
  tyre.rotateZ(Math.PI / 2); tyre.translate(m(x), m(y), m(z));
  const hub = new THREE.CylinderGeometry(m(r * 0.46), m(r * 0.46), m(width * 1.10), 8);
  hub.rotateZ(Math.PI / 2); hub.translate(m(x), m(y), m(z));
  return [paint(tyre, 0x141416), paint(hub, 0x6a6f77)];
}

/**
 * YBS bus: 11.5 x 2.5 x 3.2 m.
 *
 * The body is left white so the per-instance colour supplies the livery — YBS
 * runs flat single colours, which is why a Yangon bus reads as one strong slab
 * of hue. Everything that must stay dark whatever colour the bus is (glass,
 * tyres, grille) is painted here and comes through tinted only slightly, which
 * is what happens to real glass on a coloured bus anyway.
 */
function busGeo() {
  /* bevelSize offsets the shape outline *outward*, so a 2.50 m body drawn with
     a 0.10 bevel is really 2.70 m across. Any band meant to sit proud of it has
     to clear that, or it is swallowed and the bus goes back to being a slab.
     These widths are all derived from BODY_W rather than guessed. */
  const BODY_W = 2.30, BODY_BEVEL = 0.10;
  const OUTER = BODY_W + BODY_BEVEL * 2;              // 2.50, the real width
  const body = paint(shellGeo(BODY_W, 2.55, 11.5, 0.34, BODY_BEVEL), 0xffffff);
  body.translate(0, m(1.62), 0);

  const roof = paint(shellGeo(BODY_W - 0.24, 0.34, 11.1, 0.14, 0.04), 0xf4f4f2);
  roof.translate(0, m(2.86), 0);

  // glass band: proud of OUTER, and up where a bus's windows actually are
  const glass = paint(shellGeo(OUTER + 0.02, 1.05, 9.70, 0.18, 0.02), 0x222833);
  glass.translate(0, m(1.98), m(-0.30));

  const parts = [body, roof, glass,
    paint(box(OUTER + 0.06, 0.10, 9.72, 0, 1.98, -0.30), 0x2f3742),   // window divider
    paint(box(2.10, 0.94, 0.14, 0, 1.98, 5.76), 0x1d222c),            // windscreen
    paint(box(2.16, 0.30, 0.12, 0, 2.62, 5.75), 0xf0efe8),            // destination board
    paint(box(2.46, 0.26, 0.14, 0, 0.66, 5.76), 0x3a3f47),            // bumpers
    paint(box(2.46, 0.26, 0.14, 0, 0.66, -5.76), 0x3a3f47),
    paint(box(0.36, 0.20, 0.10, -0.80, 0.98, 5.80), 0xfff3d0),        // head lamps
    paint(box(0.36, 0.20, 0.10,  0.80, 0.98, 5.80), 0xfff3d0),
    paint(box(0.30, 0.18, 0.10, -0.80, 1.02, -5.80), 0x8e2b22),       // tail lamps
    paint(box(0.30, 0.18, 0.10,  0.80, 1.02, -5.80), 0x8e2b22),
    ...wheelGeo(-1.06, 0.52, 3.65, 0.52, 0.26), ...wheelGeo(1.06, 0.52, 3.65, 0.52, 0.26),
    ...wheelGeo(-1.06, 0.52, -3.60, 0.52, 0.26), ...wheelGeo(1.06, 0.52, -3.60, 0.52, 0.26),
  ];
  return merge(parts, 'bus');
}

/**
 * Taxi: the 4.4 m Probox/Fielder wagon most of Yangon's fleet actually is. Two
 * stacked shells — a lower body, and a narrower greenhouse set back over the
 * rear axle — which is the whole reason it reads as a car and not a brick.
 */
function taxiGeo() {
  const LOWER_W = 1.58, LOWER_BEVEL = 0.07;            // outer 1.72, the real width
  const CABIN_W = 1.42, CABIN_BEVEL = 0.07;
  const CABIN_OUTER = CABIN_W + CABIN_BEVEL * 2;      // 1.56 — narrower than the body

  const lower = paint(shellGeo(LOWER_W, 0.86, 4.40, 0.26, LOWER_BEVEL), 0xffffff);
  lower.translate(0, m(0.70), 0);
  const cabin = paint(shellGeo(CABIN_W, 0.78, 2.60, 0.30, CABIN_BEVEL), 0xffffff);
  cabin.translate(0, m(1.48), m(-0.22));
  const glass = paint(shellGeo(CABIN_OUTER + 0.02, 0.44, 2.42, 0.16, 0.02), 0x232a35);
  glass.translate(0, m(1.54), m(-0.22));

  const parts = [lower, cabin, glass,
    paint(box(1.70, 0.16, 0.10, 0, 0.44, 2.24), 0x3c414a),           // bumpers
    paint(box(1.70, 0.16, 0.10, 0, 0.44, -2.24), 0x3c414a),
    paint(box(0.30, 0.14, 0.08, -0.62, 0.76, 2.26), 0xfff3d0),       // head lamps
    paint(box(0.30, 0.14, 0.08,  0.62, 0.76, 2.26), 0xfff3d0),
    paint(box(0.24, 0.18, 0.08, -0.64, 0.88, -2.26), 0x8e2b22),      // tail lamps
    paint(box(0.24, 0.18, 0.08,  0.64, 0.88, -2.26), 0x8e2b22),
    paint(box(0.16, 0.10, 0.14, -0.86, 1.38, 1.02), 0x2b2f36),       // mirrors
    paint(box(0.16, 0.10, 0.14,  0.86, 1.38, 1.02), 0x2b2f36),
    ...wheelGeo(-0.76, 0.33, 1.42, 0.33, 0.20), ...wheelGeo(0.76, 0.33, 1.42, 0.33, 0.20),
    ...wheelGeo(-0.76, 0.33, -1.44, 0.33, 0.20), ...wheelGeo(0.76, 0.33, -1.44, 0.33, 0.20),
  ];
  return merge(parts, 'taxi');
}

/** Tea shop: a tarpaulin on four poles over a low table and four stools.
    Stool seats sit at 0.30 m — knee height, which is the whole character of
    the thing; putting them at chair height would read as a European cafe. */
function teaTarpGeo() { return teaCanopy(); }
function teaFrameGeo() { return teaFurniture(); }

/** Vendor stall: a big umbrella over a crate table. */
function stallCanopyGeo() {
  return paint(cyl(0.02, 1.35, 0.42, 10, 0, 2.12, 0), 0xffffff);
}

function stallFrameGeo() {
  const parts = [
    paint(cyl(0.035, 0.035, 2.10, 6, 0, 1.05, 0), 0x8d8378),
    paint(box(1.10, 0.62, 0.66, 0, 0.31, 0), 0xb99c74),       // crate
    paint(box(1.16, 0.06, 0.72, 0, 0.65, 0), 0xd8c9a8),
  ];
  return merge(parts, 'stall frame');
}

/** Roadside water-pot stand — the ye-o-sin. Two glazed pots on a timber frame,
    left out for anyone walking past. Nothing says a Myanmar street faster. */
function potStandGeo() {
  const parts = [
    paint(cyl(0.05, 0.05, 1.15, 5, -0.42, 0.57, 0), 0x7d6a52),
    paint(cyl(0.05, 0.05, 1.15, 5,  0.42, 0.57, 0), 0x7d6a52),
    paint(box(1.05, 0.07, 0.34, 0, 1.12, 0), 0x8d7a5e),
    paint(box(1.05, 0.05, 0.30, 0, 0.42, 0), 0x8d7a5e),
    paint(cyl(0.13, 0.19, 0.34, 9, -0.26, 1.32, 0), 0x6b4b34), // pots
    paint(cyl(0.13, 0.19, 0.34, 9,  0.26, 1.32, 0), 0x6b4b34),
    paint(cyl(0.10, 0.10, 0.03, 9, -0.26, 1.50, 0), 0x3f2e22), // lids
    paint(cyl(0.10, 0.10, 0.03, 9,  0.26, 1.50, 0), 0x3f2e22),
  ];
  return merge(parts, 'pot stand');
}

/** Utility pole with crossarms and a lamp on an outstretched arm. The cables
    between poles are drawn separately, as line segments, because catenaries do
    not instance. */
function poleGeo() {
  const parts = [
    paint(cyl(0.09, 0.13, 8.0, 6, 0, 4.0, 0), 0x9a938a),
    paint(box(1.70, 0.09, 0.09, 0, 7.25, 0), 0x8a8178),
    paint(box(1.30, 0.08, 0.08, 0, 6.70, 0), 0x8a8178),
    paint(box(0.34, 0.44, 0.30, 0.34, 5.55, 0), 0x6f6a63),     // transformer box
    paint(box(1.25, 0.07, 0.07, 0.62, 6.15, 0), 0x8a8178),     // lamp arm
    paint(box(0.46, 0.14, 0.22, 1.20, 6.05, 0), 0x6f6a63),     // lamp housing
  ];
  return merge(parts, 'pole');
}

/**
 * The lamps a vehicle carries, as their own geometry so they can be driven to
 * full brightness at night without the bodywork coming with them. They ride the
 * vehicle's own transform list — the SAME array object, not a replayed PRNG —
 * so they cannot drift off the bodywork. See `layout()`.
 *
 * **Both models already say where their lamps go, and these are those places.**
 * The car is untextured, so `loadVehicleGeometry` baked its material colours
 * into vertex colours: filtering for the amber (163,77,26) and the red
 * (163,19,15) picks the headlight and tail-light panels straight out of the
 * mesh. The bus keeps its palette texture instead, so the same question is
 * asked of the UVs — the triangles whose UV lands on the palette's orange
 * (255,153,21) are its headlight cluster. Each patch is then split by the sign
 * of x to give a per-side centre.
 *
 * That is a world away from the figures this replaces, which were reasoned
 * from nominal dimensions and were wrong in both directions at once: the bus's
 * headlight panel sits at z 5.648 where the old 5.58 buried the lens 7 cm
 * INSIDE the bodywork — and a depth-tested additive lens inside a solid draws
 * nothing, so the entire fleet ran with no headlights at all — while the car's
 * are at 1.986 where the old 2.06 hung both of them clear of the bumper with
 * the road showing through the gap.
 *
 * `hs`/`ts` are the slope of the panel across the lens, dz/dx, taken from the
 * same patch. A stock low-poly car noses in fast — the headlight panel loses
 * 73 cm of z per metre of x — so a flat lens wide enough to read as a
 * headlight cannot lie flush on it. Shearing by that slope lets the lens keep
 * a believable width and still follow the panel it is set into.
 *
 * The bus has no tail lamp modelled anywhere, in texture or geometry, so those
 * two are placed by measurement instead: its rear panel is flat at z -5.646
 * right across the width at that height.
 *
 * This is most of what makes the road read as alive after dark: 84 vehicles is
 * 84 pairs of headlights and 84 pairs of tail lights, and at a junction this
 * size that is the whole picture.
 */
/* `hw`/`hh` and `tw`/`th` are sized to sit just INSIDE the panel each lens
   belongs to, because the fit below follows whatever surface it finds. The
   bus's headlight is a pod standing 5 cm proud of the front panel: a lens even
   slightly wider than the pod drops its outer ring onto the panel behind, and
   the pod's own shoulders then occlude the lens into an hourglass. */
const BUS_LAMPS  = { hx: 0.526, hy: 0.844, hz: 5.71, hs: -0.50, hw: 0.09, hh: 0.21,
                     tx: 0.840, ty: 0.900, tz: -5.68, ts: 0,     tw: 0.24, th: 0.17 };
const TAXI_LAMPS = { hx: 0.553, hy: 0.626, hz: 2.05, hs: -0.73, hw: 0.25, hh: 0.17,
                     tx: 0.571, ty: 0.882, tz: -1.92, ts: 0.93,  tw: 0.14, th: 0.24 };

/**
 * A mirrored pair of lenses, sheared to sit flush on curved bodywork.
 *
 * Flat quads, not boxes: a lens is a light, so the only face that matters is
 * the one pointing out of the vehicle, and dropping the other five takes the
 * whole map's lamp layer from 12 triangles a lamp to 2 — 84 vehicles times
 * four lamps, so it is worth having. It also makes them trivial to fit to the
 * real bodywork later, since every vertex lies on one surface.
 *
 * Each quad's z is swept by `slope * (|x| - hx)`, so the outboard edge falls
 * back roughly as the panel does. Keying on |x| means one expression shears
 * both sides outward, which is why the pair is built as two quads rather than
 * one mirrored copy — scaling by -1 would reverse the winding and cull the far
 * lens away entirely. `slope` is signed in the vehicle's own frame, which is
 * why the tail's is positive: at the back z is negative, and the body narrowing
 * toward its corners moves that z toward zero.
 */
function lampPair(w, h, hx, y, z, slope, hex) {
  return [hx, -hx].map((side) => {
    /* Two segments each way, not one. Four corners can only describe a plane,
       and a nose is convex: fit a flat quad to it and the middle of the lens
       sinks behind the panel while its corners sit on it, which draws a lit
       rectangle with a dark bite out of the centre. A 3x3 grid of vertices
       bends with the panel for eight triangles a lens — fewer than the box
       this replaced spent on faces that never showed. */
    const g = new THREE.PlaneGeometry(m(w), m(h), 2, 2);
    if (z < 0) g.rotateY(Math.PI);                 // a tail lamp faces astern
    g.translate(m(side), m(y), m(z));
    if (slope) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, pos.getZ(i) + slope * (Math.abs(pos.getX(i)) - m(hx)));
      }
      pos.needsUpdate = true;
    }
    return paint(g, hex);
  });
}

function busLightsGeo() {
  const L = BUS_LAMPS;
  return merge([
    ...lampPair(L.hw, L.hh, L.hx, L.hy, L.hz, L.hs, 0xfff0c8),
    ...lampPair(L.tw, L.th, L.tx, L.ty, L.tz, L.ts, 0xff5a3c),
  ], 'bus lights');
}

function taxiLightsGeo() {
  const L = TAXI_LAMPS;
  return merge([
    ...lampPair(L.hw, L.hh, L.hx, L.hy, L.hz, L.hs, 0xfff0c8),
    ...lampPair(L.tw, L.th, L.tx, L.ty, L.tz, L.ts, 0xff5a3c),
  ], 'taxi lights');
}

/**
 * Push every lens vertex onto the bodywork it is set into.
 *
 * A shear is a straight line and a car's nose is not, so once the downloaded
 * model is in hand the shape is asked of it directly: rasterise the body along
 * Z at each lens vertex's (x, y) and put that vertex on the surface which
 * comes back, three centimetres proud so the additive lens is never
 * depth-rejected by the panel it sits on.
 *
 * Vertices that fall outside the body's silhouette get no answer and keep
 * their sheared position, which is the right fallback: it is what the lens
 * would have been anyway.
 *
 * 36 vertices against ~3k triangles, once, when the model lands.
 */
function fitLensesToBody(lensGeo, bodyGeo, margin = 0.03) {
  const lp = lensGeo.attributes.position;
  const bp = bodyGeo.attributes.position;
  const idx = bodyGeo.index;
  const n = idx ? idx.count : bp.count;
  const mg = m(margin);
  for (let v = 0; v < lp.count; v++) {
    const px = lp.getX(v), py = lp.getY(v), pz = lp.getZ(v);
    const front = pz > 0;
    let best = null;
    for (let i = 0; i < n; i += 3) {
      const j0 = idx ? idx.getX(i) : i, j1 = idx ? idx.getX(i + 1) : i + 1, j2 = idx ? idx.getX(i + 2) : i + 2;
      const ax = bp.getX(j0), ay = bp.getY(j0);
      const bx = bp.getX(j1), by = bp.getY(j1);
      const cx = bp.getX(j2), cy = bp.getY(j2);
      // barycentric containment in XY, then interpolate the depth
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (d > -1e-9 && d < 1e-9) continue;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
      if (l1 < 0) continue;
      const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
      if (l2 < 0) continue;
      const l3 = 1 - l1 - l2;
      if (l3 < 0) continue;
      const z = l1 * bp.getZ(j0) + l2 * bp.getZ(j1) + l3 * bp.getZ(j2);
      if (best === null || (front ? z > best : z < best)) best = z;
    }
    if (best !== null) lp.setZ(v, best + (front ? mg : -mg));
  }
  lp.needsUpdate = true;
  lensGeo.computeBoundingSphere();
}

/**
 * The pool of light a vehicle throws onto the tarmac in front of it.
 *
 * A quad lying flat on the road, widening away from the nose, with the falloff
 * baked into its vertex colours — bright at the bumper, nothing at the far end,
 * and tapering at the sides so it reads as a beam and not as a painted
 * rectangle. Additive, so the dark end genuinely adds nothing.
 *
 * @param len   how far the beam reaches, metres
 * @param w0/w1 width at the bumper and at the far end
 * @param z0    where the bumper is
 */
function beamGeo(len, w0, w1, z0, tail = false) {
  /* Five columns across, not three. The outer pair sit at zero so the beam
     fades into the tarmac instead of ending on a hard line — with only an edge
     and a centre the interpolation leaves a visible boundary, and the whole
     thing reads as a triangle painted on the road rather than as light. */
  const SEG = 6;
  const ACROSS = [-1, -0.55, 0, 0.55, 1];
  const BRIGHT = [0, 0.62, 1, 0.62, 0];
  /* The beam has to climb as it goes.
     Vehicle anchors were baked at each vehicle's own spot, but the road has
     camber and gradient, so ten metres ahead the tarmac can sit a third of a
     unit ABOVE the anchor — and a beam laid flat at anchor height is buried
     under it and never draws a pixel. Lifting the far end clear costs nothing
     visually (an additive wash a few centimetres off the road reads exactly
     the same) and guarantees the whole length stays above the surface. */
  const Y0 = 0.10, Y1 = 0.62;
  const pos = [], col = [], idx = [];
  const push = (x, y, z, v) => { pos.push(m(x), m(y), m(z)); col.push(v, v, v); };
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const z = z0 + len * t;
    const y = Y0 + (Y1 - Y0) * t;
    const hw = (w0 + (w1 - w0) * t) / 2;
    const v = Math.pow(1 - t, 2.0);          // falls off with the square of range
    for (let k = 0; k < ACROSS.length; k++) push(ACROSS[k] * hw, y, z, v * BRIGHT[k]);
  }
  const N = ACROSS.length;
  for (let i = 0; i < SEG; i++) {
    for (let k = 0; k < N - 1; k++) {
      const a = i * N + k, b = a + N;
      idx.push(a, a + 1, b,  a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  if (tail) geo.scale(1, 1, -1);             // the red wash behind the vehicle
  return geo.toNonIndexed();
}

/**
 * The bare bulb a tea shop runs off a length of flex, and the patch of
 * pavement it lights. Same trick as the street lamp's pool — the falloff is
 * baked into the vertex colours, because black adds nothing under additive
 * blending and a flat disc would read as paint on the ground.
 */
function shopBulbGeo() {
  const bulb = new THREE.SphereGeometry(m(0.10), 7, 5);
  bulb.translate(0, m(2.05), 0);
  paint(bulb, 0xffffff);

  const pool = new THREE.CircleGeometry(m(1.35), 12);
  pool.rotateX(-Math.PI / 2);
  const pos = pool.attributes.position;
  const col = new Float32Array(pos.count * 3);
  let rMax = 0;
  for (let i = 0; i < pos.count; i++) rMax = Math.max(rMax, Math.hypot(pos.getX(i), pos.getZ(i)));
  for (let i = 0; i < pos.count; i++) {
    const v = Math.pow(1 - Math.hypot(pos.getX(i), pos.getZ(i)) / (rMax || 1), 1.6);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  pool.setAttribute('color', new THREE.BufferAttribute(col, 3));
  pool.translate(0, m(0.05), 0);
  return merge([bulb, pool], 'shop bulb');
}

/** The lit parts, kept apart so they can be driven to full brightness without
    the pole going with them. Sodium-orange: Yangon's street lighting is still
    mostly warm, and it is half of why the city reads the way it does at dusk. */
function lampLensGeo() {
  return paint(box(0.40, 0.05, 0.18, 1.20, 5.96, 0), 0xffffff);
}

/**
 * The shaft of light under a lamp.
 *
 * This is the thing that makes a street at night feel like somewhere rather
 * than like geometry with bright dots on it: humid air under a sodium lamp
 * scatters, so the light is visible in the air between the fixture and the
 * road, not only where it lands. A hollow cone hanging from the luminaire,
 * additive, with the falloff baked into its vertex colours — bright where it
 * leaves the lamp and gone before it reaches the ground, because the pool disc
 * already does the ground contact.
 *
 * Built longer than any lamp is tall and simply allowed to run into the road:
 * it is depth-tested, so the tarmac clips whatever hangs below it, and one
 * geometry then serves posts of every height.
 */
function lampShaftGeo(topR, botR, height, seg = 9) {
  const g = new THREE.CylinderGeometry(m(topR), m(botR), m(height), seg, 1, true);
  g.translate(0, -m(height) / 2, 0);          // apex at the origin, hanging down
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, -pos.getY(i) / m(height)));
    const v = Math.pow(1 - t, 1.9);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A standalone pool for the baked posts — same vertex-colour falloff as the
    street-lamp pool, centred on the origin so it can sit under any post. */
function bakedPoolGeo(radius = 3.8) {
  const disc = new THREE.CircleGeometry(m(radius), 16);
  disc.rotateX(-Math.PI / 2);
  const pos = disc.attributes.position;
  const col = new Float32Array(pos.count * 3);
  let rMax = 0;
  for (let i = 0; i < pos.count; i++) rMax = Math.max(rMax, Math.hypot(pos.getX(i), pos.getZ(i)));
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / (rMax || 1);
    const v = Math.pow(1 - r, 1.7);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  disc.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return disc;
}

/** A cheap stand-in for a light cone: a pool on the pavement under the lamp and
    a small bloom at the bulb. Additive, unlit, depth-write off — two instanced
    draws and no shadow work at all.

    The pool's softness is baked into its vertex colours rather than painted
    into a texture or faded with alpha: under additive blending black adds
    nothing, so a disc that runs from white at the hub to black at the rim has
    no edge to give itself away. A flat-coloured disc reads as a circle of paint
    on the road, which is exactly what it looked like before. */
function lampGlowGeo(radius = 3.4) {
  const disc = new THREE.CircleGeometry(m(radius), 14);
  disc.rotateX(-Math.PI / 2);
  {
    const pos = disc.attributes.position;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    let rMax = 0;
    for (let i = 0; i < n; i++) rMax = Math.max(rMax, Math.hypot(pos.getX(i), pos.getZ(i)));
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i)) / (rMax || 1);
      const v = Math.pow(1 - r, 1.7);          // bright hub, long soft tail
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    disc.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  disc.translate(m(1.20), m(0.05), 0);

  const bulb = new THREE.SphereGeometry(m(0.34), 8, 6);
  bulb.translate(m(1.20), m(5.96), 0);
  paint(bulb, 0xffffff);

  return merge([disc, bulb], 'lamp glow');
}

/* ------------------------------------------------------- downloaded models */

/**
 * Flatten a downloaded GLB into one instanceable geometry.
 *
 * InstancedMesh needs a single geometry and a single material, and these models
 * arrive as several meshes with a material each. Since they are untextured flat
 * colours, every primitive's base colour is baked into vertex colours and the
 * lot merged — which also lets the body keep taking a per-instance tint, the
 * same trick the procedural props use.
 *
 * @param bodyMat name of the material that is the paintwork. It is baked white
 *                so `instanceColor` supplies the colour; everything else keeps
 *                its own, so glass and tyres do not go blue with the bodywork.
 * @param length  real length in metres, scaled uniformly.
 * @param size    [width, height, length] in metres — corrects all three axes
 *                independently, for a model whose proportions are wrong.
 */
/**
 * Cheap stand-ins for a model's wheel meshes, measured from the meshes
 * themselves.
 *
 * The axle runs along X on every vehicle here, so a wheel is fully described
 * by its centre, its radius and its width — and one sub-mesh often holds BOTH
 * wheels of an axle (this car's rear pair is a single 564-triangle object 1.47
 * wide), which is why anything wider than it is round gets split down the
 * middle and rebuilt as two. Each proxy keeps the colour of the mesh it
 * replaces, so a black tyre stays a tyre and the grey rim inside it stays a
 * rim: the pair of sub-meshes reproduces the pair of cylinders for free.
 */
function wheelProxies(geo, hex) {
  const pos = geo.attributes.position;
  const box = (from, to) => {
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x < from || x > to) continue;
      const y = pos.getY(i), z = pos.getZ(i);
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
      n++;
    }
    return n ? { mnx, mxx, mny, mxy, mnz, mxz } : null;
  };
  const whole = box(-Infinity, Infinity);
  if (!whole) return [];
  const dia = Math.max(whole.mxy - whole.mny, whole.mxz - whole.mnz);
  const wide = whole.mxx - whole.mnx;
  const mid = (whole.mnx + whole.mxx) / 2;
  const halves = wide > dia * 1.6
    ? [box(-Infinity, mid), box(mid, Infinity)]
    : [whole];

  const out = [];
  for (const b of halves) {
    if (!b) continue;
    const r = Math.max(b.mxy - b.mny, b.mxz - b.mnz) / 2;
    const w = Math.max(b.mxx - b.mnx, r * 0.35);
    const c = new THREE.CylinderGeometry(r, r, w, 10);
    c.rotateZ(Math.PI / 2);                      // axle along X, as wheelGeo does
    c.translate((b.mnx + b.mxx) / 2, (b.mny + b.mxy) / 2, (b.mnz + b.mxz) / 2);
    out.push(paint(c.toNonIndexed(), hex));
  }
  return out;
}

export async function loadVehicleGeometry(url, { bodyMat, length, size, tier = 'hi' }) {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateWorldMatrix(true, true);

  const parts = [];
  let textured = null;          // a model that carries its own map keeps it
  let wheelTris = 0, proxyTris = 0;
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;

    /* Wheels get thrown away and rebuilt.
       Stock low-poly cars spend their whole budget on them: this one is 3124
       triangles and 1680 of those — 54% — are four wheels, drawn as 32-segment
       cylinders on a 0.33 m tyre. Nothing on a parked car twenty metres away
       can tell those from ten segments, and the fleet is the single heaviest
       thing in the scene, so the wheel meshes are replaced in place by the
       same primitive the procedural vehicles use, sized and positioned from
       the bounding box of the mesh being dropped. No authored numbers, so it
       works on whatever model is dropped in next. */
    if (/wheel/i.test(o.name)) {
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      wheelTris += tris;
      const hex = mat && mat.color ? mat.color.getHex() : 0x141416;
      for (const cyl of wheelProxies(g, hex)) {
        proxyTris += cyl.attributes.position.count / 3;
        parts.push(cyl);
      }
      g.dispose();
      return;
    }

    if (mat && mat.map) {
      /* Baking vertex colours would throw the texture away, and a textured
         vehicle cannot be recoloured per instance anyway — which is fine for a
         fleet that runs one livery. Keep the material and skip the paint. */
      textured = mat;
    } else {
      const isBody = mat && mat.name === bodyMat;
      const hex = isBody || !mat || !mat.color ? 0xffffff : mat.color.getHex();
      paint(g, hex);
    }
    parts.push(g.index ? g.toNonIndexed() : g);
  });
  if (!parts.length) throw new Error(`no meshes in ${url}`);
  if (wheelTris) {
    console.info(`hledan: ${url.split('/').pop()} wheels ${wheelTris} -> ${proxyTris} tris`);
  }

  /* mergeGeometries refuses a set whose attributes disagree, and a downloaded
     model is under no obligation to be consistent: this car carries no UVs at
     all (it is flat-coloured), while the cylinders standing in for its wheels
     come out of CylinderGeometry with UVs as a matter of course. Keep only the
     attributes every part has — nothing downstream reads anything but position,
     normal and colour. */
  const common = Object.keys(parts[0].attributes)
    .filter((name) => parts.every((g) => g.attributes[name]));
  for (const g of parts) {
    for (const name of Object.keys(g.attributes)) {
      if (!common.includes(name)) g.deleteAttribute(name);
    }
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`could not merge ${url}`);

  /* Normalise. The model arrives at whatever scale and proportion its author
     chose, and stock low-poly vehicles are drawn stubby: this bus is natively
     3.66 m across where a real one is 2.50, which would make it the widest
     thing on a map whose entire scale was derived from bus dimensions.

     So `size` corrects all three axes independently rather than scaling
     uniformly. The distortion that costs is small and lands where it does not
     show: the wheels' axles run along X, so narrowing X only makes the tyres
     thinner, and the 0.9 on height is too slight to read. */
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  const nat = new THREE.Vector3(); bb.getSize(nat);
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);

  const longAxis = nat.x > nat.z ? 'x' : 'z';
  if (size) {
    const [w, hgt, len] = size;
    const sx = ((longAxis === 'x' ? len : w) * S) / nat.x;
    const sy = (hgt * S) / nat.y;
    const sz = ((longAxis === 'x' ? w : len) * S) / nat.z;
    merged.scale(sx, sy, sz);
  } else {
    const k = (length * S) / Math.max(nat.x, nat.z);
    merged.scale(k, k, k);
  }
  // length must run along Z, the axis the road yaw is applied about
  if (longAxis === 'x') merged.rotateY(Math.PI / 2);
  merged.computeVertexNormals();

  /* A downloaded model brings whatever material its author exported, and glTF
     exports PBR. That is fine on the high tier, but on the low tier the map
     itself is Lambert — so the heaviest instanced thing in the scene was the
     ONLY object still running a full GGX BRDF on the phone that can least
     afford it (measured at street level: the bus fleet is ~20k of the frame's
     130k triangles). Carry the texture over to Lambert and keep the look;
     these are flat-painted panels with a 256px palette map, and there is no
     metalness, roughness map or normal map to lose. */
  if (textured && tier !== 'hi' && textured.isMeshStandardMaterial) {
    const src = {
      map: textured.map, color: textured.color, side: textured.side,
      transparent: textured.transparent, alphaTest: textured.alphaTest,
      vertexColors: textured.vertexColors, name: textured.name,
    };
    for (const k of Object.keys(src)) if (src[k] === undefined) delete src[k];
    const lam = new THREE.MeshLambertMaterial(src);
    textured.dispose();
    textured = lam;
  }
  return { geometry: merged, material: textured };
}

/**
 * Repaint a palette-atlas model into a YBS livery.
 *
 * The downloaded bus does not carry a livery — its 256x256 map is a five-colour
 * palette (window blue, body, indicator orange, tyre grey, tail red) that each
 * UV island samples as a flat patch. The body patch is `#e0e0e0`, which is why
 * a fleet of them reads as white blocks.
 *
 * So the body patch is found by value rather than by position — it is the one
 * bright, near-neutral colour in the palette — and repainted. Everything
 * saturated is left alone, so the glass stays glass and the indicators stay
 * orange instead of being dragged along by a per-instance tint.
 */
function makeLivery(srcTex, bodyHex) {
  const img = srcTex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  /* Unpack the hex by hand. THREE.Color applies colour management and stores
     linear values, so `col.r * 255` writes a linear number into an sRGB canvas
     and the livery comes out far darker than asked for — 0x1f5fa8 landed near
     #001060. The canvas wants the sRGB bytes, which is what the literal is. */
  const R = (bodyHex >> 16) & 255, G = (bodyHex >> 8) & 255, B = bodyHex & 255;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 190 && mx - mn < 26) { px[i] = R; px[i + 1] = G; px[i + 2] = B; }
  }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  /* Match the source exactly. A GLTF texture is flipY:false; CanvasTexture
     defaults to true, and getting that wrong turns the bus inside out. */
  t.colorSpace = srcTex.colorSpace;
  t.flipY = srcTex.flipY;
  t.wrapS = srcTex.wrapS; t.wrapT = srcTex.wrapT;
  t.needsUpdate = true;
  return t;
}

/* ----------------------------------------------------------------- build */

/**
 * Resolve a set of anchor rows into concrete transforms, ONCE.
 *
 * Everything that has to sit on a prop — its bodywork, its lamps, its halo
 * sprites, its light beam — is then built from this same array, so nothing can
 * drift off anything else. Replaying a seeded PRNG per layer used to do the
 * same job and mostly worked, until the bus fleet was split across four livery
 * meshes: each slice re-seeded the generator from zero, so the bodies took
 * yaws that the lamp layer (still running the original unbroken sequence) knew
 * nothing about, and every headlight on the map ended up on a different bus
 * from the one it belonged to. A resolved list has no sequence to get out of
 * step with.
 */
function layout(rows, seed, jitterYaw = 0) {
  const rng = mulberry32(seed);
  return rows.map((r) => {
    let yaw = r.length > 3 ? r[3] + (rng() < 0.5 ? 0 : Math.PI) : rng() * Math.PI * 2;
    if (jitterYaw) yaw += (rng() - 0.5) * jitterYaw;
    const s = 0.94 + rng() * 0.12;
    return { x: r[0], y: r[1], z: r[2], yaw, s };
  });
}

/** Build an InstancedMesh from a resolved layout. */
function instancedFrom(geo, mat, place, colours, keys) {
  const mesh = new THREE.InstancedMesh(geo, mat, place.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  place.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(p.s, p.s, p.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    /* `keys` carries each instance's index in the UNSPLIT layout, so a prop
       keeps the colour it would have had whether or not the layer ends up
       tiled. Without it, tiling reshuffles every palette on the map. */
    const k = keys ? keys[i] : i;
    if (colours) mesh.setColorAt(i, col.set(colours[(k * 7 + 3) % colours.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.place = place;
  return mesh;
}

/* ----------------------------------------------------------- frustum culling */

/**
 * How much of the map's street furniture is on screen at once: **9%.**
 *
 * That was measured over 96 street-level stances — 124,750 prop triangles
 * submitted every frame, 11,789 of them inside the frustum. One InstancedMesh
 * per prop type spans the whole junction, so its bounding sphere always
 * intersects the view and the GPU transforms all 662 instances wherever you
 * stand. On a phone that is the largest avoidable cost in the scene: the props
 * outweigh the map itself.
 *
 * The obvious fix — cut each layout into XZ tiles and let three.js reject whole
 * tiles — was tried and is a bad trade here. It took the draw call count from
 * 21 to 146, because the page opens on a bird's-eye view where every tile is
 * genuinely visible, and a mobile driver would rather transform a hundred
 * thousand vertices than change state a hundred and twenty extra times.
 *
 * So the culling is done per INSTANCE instead, on the CPU, by compacting the
 * visible ones to the front of the instance buffer and shortening `count`.
 * Draw calls stay flat in every view, the overview still draws everything
 * because everything is genuinely on screen, and at street level nine tenths
 * of the work disappears. A sphere-vs-frustum test is six dot products, so the
 * whole pass is a few tens of microseconds.
 *
 * Only layers heavy enough to be worth the bookkeeping are registered — a
 * 48-triangle stall stool is cheaper to draw than to think about.
 */
/* Two ways in, because triangles are the wrong measure for half of these
   layers and instance count is the wrong measure for the other half. A lamp
   pool is two dozen triangles and most of a phone's fill rate, so anything
   with sixteen instances qualifies on spread alone; a bus livery slice is
   eight instances of 2226 triangles, so anything heavy qualifies on weight. */
const CULL_MIN = 16, CULL_TRIS = 6000;

function cullable(mesh, place, colours) {
  const geo = mesh.geometry;
  const tri = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  if (place.length < CULL_MIN && place.length * tri < CULL_TRIS) return null;
  return { mesh, place, colours: colours || null, geo: null, oy: 0, r: 0 };
}

/**
 * The test sphere for one instance of a layer, taken from the geometry itself.
 *
 * A guessed radius is how instance culling goes wrong: too small and props
 * blink out at the edge of the screen, too large and it stops culling. The
 * geometry's own bounding sphere gives the exact answer, and the only care
 * needed is that an instance is rotated about Y — so the sphere's height
 * offset carries over as it is, while its horizontal offset has to be folded
 * into the radius, where it covers every yaw at once. A lamp shaft, whose
 * geometry hangs nineteen units BELOW its anchor, is the case that makes this
 * worth doing properly.
 */
function cullSphere(layer) {
  const g = layer.mesh.geometry;
  if (layer.geo === g) return;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const bs = g.boundingSphere;
  layer.geo = g;
  layer.oy = bs.center.y;
  layer.r = (bs.radius + Math.hypot(bs.center.x, bs.center.z)) * 1.08;   // 1.08: scale jitter
}

/** One layer, plus a note to cull it later if it is heavy enough to matter. */
function instancedLayer(geo, mat, place, colours, sink) {
  const mesh = instancedFrom(geo, mat, place, colours);
  if (sink) {
    const c = cullable(mesh, place, colours);
    if (c) sink.push(c);
  }
  return [mesh];
}

/** Convenience for the props that still want anchors-plus-seed at the call site. */
function instanced(geo, mat, rows, colours, seed, jitterYaw, sink) {
  return instancedLayer(geo, mat, layout(rows, seed, jitterYaw), colours, sink);
}

/** A point in a prop's local frame, lifted into world space. */
function localToWorld(p, lx, ly, lz) {
  const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
  const x = lx * p.s, y = ly * p.s, z = lz * p.s;
  return { x: p.x + x * cos + z * sin, y: p.y + y, z: p.z - x * sin + z * cos };
}

/* Deterministic PRNG, so the street looks the same on every visit. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ halos */

/**
 * The warm bloom around every light source after dark. Real bloom is a
 * post-pass this page cannot afford; a camera-facing radial-gradient sprite at
 * each bulb reads the same at a thousandth of the cost, and THREE.Points keeps
 * the whole layer to ONE draw call per group. This—not the lens geometry—is
 * what makes the night look lit rather than merely marked.
 */
function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function haloPoints(entries, map) {
  const n = entries.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const c = new THREE.Color();
  entries.forEach((e, i) => {
    pos[i * 3] = e.x; pos[i * 3 + 1] = e.y; pos[i * 3 + 2] = e.z;
    c.setHex(e.color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = e.size;
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  // Instanced camera-facing quads: WebGPU has no programmable point size.
  const mat = new THREE.SpriteNodeMaterial({
    map, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, opacity: 0,
  });
  mat.positionNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(pos, 3));
  mat.colorNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(col, 3));
  // A custom colorNode bypasses the material map, including its alpha channel.
  // Explicitly retain the radial mask so WebGPU sprites never become luminous squares.
  mat.opacityNode = materialOpacity.mul(texture(map).a);
  mat.scaleNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(size, 1));
  const opacityHandle = {};
  Object.defineProperty(opacityHandle, 'value', {
    get: () => mat.opacity, set: value => { mat.opacity = value; }
  });
  mat.uniforms = { uOpacity: opacityHandle };
  const points = new THREE.Mesh(geo, mat);
  points.count = n;
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 4;
  return { points, mat };
}

export class StreetProps {
  /**
   * @param tier 'hi' | 'lo' — the low tier drops the long tail of vehicles and
   *             skips the overhead cables, which are the only non-instanced draw.
   */
  constructor({ scene, tier = 'hi' }) {
    this.group = new THREE.Group();
    this.group.name = 'street-props';
    const rng = mulberry32(0x484C44);             // "HLD"

    const Mat = tier === 'hi' ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
    const mk = (extra = {}) => new Mat(Object.assign({ vertexColors: true }, extra,
      tier === 'hi' ? { roughness: 0.85, metalness: 0.0 } : {}));

    /* Vehicles are now ~760 triangles each rather than ~170, which is what buys
       the rounded body and the glass band. At that price the full 108-strong
       taxi list is 82k triangles on its own — more than the entire map — so the
       fleet is thinned by taking every Nth anchor. Every Nth rather than the
       first N: slicing the head of the list would empty one end of the junction
       and leave the other bumper to bumper, because the anchors were generated
       in scan order. */
    /* The downloaded models are ~4x the triangles of the procedural ones they
       replace (2.2k and 3.1k against 768 and 756), so the low tier thins the
       fleet much harder than it used to. Fewer real vehicles beats more toy
       ones — a phone still gets a bus that looks like a bus. */
    const cut = tier === 'hi' ? 1 : 0.35;
    const BUS_SEED = 0x425553, TAXI_SEED = 0x545849;   // "BUS", "TXI"
    const every = (arr, n) => arr.filter((_, i) => i % n === 0);
    const take = (arr, n = 1) => {
      const thinned = every(arr, n);
      return thinned.slice(0, Math.max(1, Math.round(thinned.length * cut)));
    };

    /* Layers heavy enough to be worth culling per instance register here; see
       instancedLayer() and update(). */
    const cull = [];
    this._cull = cull;
    /* Squared draw distance for those layers, or 0 for "no limit". See
       _cullPass: the low tier stops submitting street furniture past 180 units
       because at that range it is a pixel or two of a bollard. */
    this._propFar2 = tier === 'hi' ? 0 : 180 * 180;

    /* A prop whose tint must not spread over its whole body is built as two
       meshes sharing one resolved transform list, so the tarp lands on its own
       poles. */
    const pair = (a, b, rows, colours, seed, jitter) => {
      const place = layout(rows, seed, jitter);
      return [...instancedLayer(a, mk(), place, colours, cull), ...instancedLayer(b, mk(), place, null, cull)];
    };

    const teaPlace = layout(TEA, 0x54454, 0);
    const cloth = mk();
    cloth.side = THREE.DoubleSide;
    cloth.map = canopyFabric();
    cloth.bumpMap = cloth.map;
    cloth.bumpScale = .008;
    cloth.roughness = .88;
    const ceramic = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .23, clearcoat: .35 });
    const steel = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .8, roughness: .28 });
    const teaBase = [
      ...instancedLayer(teaTarpGeo(), cloth, teaPlace, TARP_COLOURS, cull),
      ...instancedLayer(teaFrameGeo(), mk(), teaPlace, null, cull),
    ];
    // Contact shadows anchor the open legs, cups and canopy to the street.
    teaBase.forEach(mesh => { mesh.castShadow = mesh.receiveShadow = true; });
    const closeDetails = [
      ...instancedLayer(teaCrockery(), ceramic, teaPlace, null, cull),
      ...instancedLayer(teaKettle(), steel, teaPlace, null, cull),
    ];
    closeDetails.forEach(mesh => { mesh.receiveShadow = true; mesh.userData.detailDistance = 100; });
    const busRows = take(BUS);
    const taxiRows = take(TAXI, 2);
    /* Resolved once, shared by the bodywork, the lamps, the beams and the
       halos — and by replaceVehicle() when the downloaded models land. */
    const busPlace = layout(busRows, BUS_SEED, 0.05);
    const taxiPlace = layout(taxiRows, TAXI_SEED, 0.07);
    const polePlace = layout(POLE, 0x504C45, 0);
    this._busPlace = busPlace;
    this._mk = mk;

    /* The bus is NOT tiled. Its fleet is split by livery instead — one texture
       per colour, one mesh per texture — and cutting that by tile as well would
       multiply the two and hand back the draw calls tiling exists to save. It
       is also the smallest fleet on the map. Everything else tiles. */
    const busBody = instancedFrom(busGeo(), mk(), busPlace, BUS_COLOURS);
    const taxiBodies = instancedLayer(taxiGeo(), mk(), taxiPlace, TAXI_COLOURS, cull);
    this._veh = { bus: [busBody], taxi: taxiBodies };
    this.meshes = [
      busBody,
      ...taxiBodies,
      ...teaBase, ...closeDetails,
      ...pair(stallCanopyGeo(), stallFrameGeo(), STALL, TARP_COLOURS, 0x5741, 0),
      ...instanced(potStandGeo(), mk(), POT,     null, 0x504F54, 0, cull),
      ...instancedLayer(poleGeo(), mk(), polePlace, null, cull),
    ];

    /* Lamps ride the pole transforms, so they are laid out from a PRNG seeded
       exactly as the poles were. Both are unlit materials — a street lamp that
       obeys the scene's own lighting goes out at dusk, which is backwards. */
    const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffe9c9, transparent: true, opacity: 0 });
    const glowMat = new THREE.MeshBasicMaterial({
      vertexColors: true, color: 0xffc98e, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.lampMat = lampMat;
    this.glowMat = glowMat;
    const lamp = instancedLayer(lampLensGeo(), lampMat, polePlace, null, cull);
    this.meshes.push(...lamp);
    /* The pools are big additive discs, and additive discs are fill rate — the
       one thing a phone GPU has least of. They are also the single thing that
       makes a street read as LIT rather than as a row of glowing dots, so the
       low tier gets them too, just smaller: the cost of an additive disc is its
       area, and 0.62 of the radius is 0.38 of the fragments. */
    const glow = instancedLayer(lampGlowGeo(tier === 'hi' ? 3.4 : 2.1), glowMat, polePlace, null, cull);
    glow.forEach((g) => { g.renderOrder = 3; });
    this.meshes.push(...glow);

    /* Vehicle lamps and tea-shop bulbs, on the same transforms as the things
       they belong to. Additive and unlit, like the street lamps, and driven by
       the same preset value — after dark the road is mostly these. */
    const vehMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const bulbMat = new THREE.MeshBasicMaterial({
      vertexColors: true, color: 0xffe3b8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.vehMat = vehMat;
    this.bulbMat = bulbMat;
    const bulbPlace = layout(TEA.concat(STALL), 0x42554C, 0);
    const busLights = [instancedFrom(busLightsGeo(), vehMat, busPlace, null)];
    const taxiLights = instancedLayer(taxiLightsGeo(), vehMat, taxiPlace, null, cull);
    const bulbs = instancedLayer(shopBulbGeo(), bulbMat, bulbPlace, null, cull);
    for (const b of [...busLights, ...taxiLights, ...bulbs]) b.renderOrder = 3;
    this.meshes.push(...busLights, ...taxiLights, ...bulbs);
    /* Kept so replaceVehicle can sit each lens on the downloaded bodywork.
       The taxi's lamp tiles share ONE geometry object with each other, so the
       fit only has to run on the first of them. */
    this._vehLights = { bus: busLights, taxi: taxiLights };

    /* The beam each vehicle throws on the tarmac. Parked traffic with lit
       headlights but no light ON THE ROAD reads as a row of glowing dots; the
       pools are what make the carriageway itself look lit. High tier only —
       they are broad additive quads, and fill rate is what a phone has least
       of. Same transform lists as the bodies, so a beam cannot come adrift. */
    this.beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true, color: 0xfff2dc, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.tailMat = new THREE.MeshBasicMaterial({
      vertexColors: true, color: 0xff4a30, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const beamLen = tier === 'hi' ? 1 : 0.62;
    const beams = [
      ...instancedLayer(beamGeo(15 * beamLen, 2.4, 7.0 * beamLen, BUS_LAMPS.hz), this.beamMat, busPlace, null, cull),
      ...instancedLayer(beamGeo(11 * beamLen, 1.7, 5.0 * beamLen, TAXI_LAMPS.hz), this.beamMat, taxiPlace, null, cull),
      /* The red wash behind a vehicle is a nicety rather than a read, and it is
         the same fill cost as the beam. Desktop only. */
      ...(tier === 'hi' ? [
        ...instancedLayer(beamGeo(5, 2.2, 3.6, -BUS_LAMPS.tz, true), this.tailMat, busPlace, null, cull),
        ...instancedLayer(beamGeo(3.6, 1.6, 2.6, -TAXI_LAMPS.tz, true), this.tailMat, taxiPlace, null, cull),
      ] : []),
    ];
    for (const b of beams) { b.renderOrder = 2; this.meshes.push(b); }

    /* ---- the warm layer: halo sprites on every source, in two draw calls.
       Positions come from the same resolved transform lists the meshes were
       built from, so each halo sits on its own bulb. ---- */
    const tex = haloTexture();
    const gridHalos = [];
    for (const p of polePlace) {
      const at = localToWorld(p, m(1.20), m(5.96), 0);
      gridHalos.push({ x: at.x, y: at.y, z: at.z, size: m(0.85), color: 0xffdcae });
    }
    for (const p of bulbPlace) {
      const at = localToWorld(p, 0, m(2.05), 0);
      gridHalos.push({ x: at.x, y: at.y, z: at.z, size: m(0.55), color: 0xffe3b8 });
    }

    /* Neon. Yangon shopfronts run LED sign strips in saturated colour, and
       they are what separates "a lit street" from "a city at night". One
       instanced bar over every tea shop and half the stalls, each in its own
       hue, each with a matching halo — driven by the same photocell as the
       lamps so the strip wakes with the street. */
    const NEON = [0x39d8ff, 0xff4fa3, 0x51ff8a, 0xffc23e, 0xff5a4a, 0x6a8dff];
    const neonRows = TEA.concat(STALL.filter((_, i) => i % 2 === 0));
    const neonGeo = paint(box(1.7, 0.3, 0.09, 0, 2.95, 0), 0xffffff);
    this.neonMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const neonPlace = layout(neonRows, 0x4E454F, 0);
    const neon = instancedLayer(neonGeo, this.neonMat, neonPlace, NEON, cull);
    for (const n of neon) { n.renderOrder = 3; this.meshes.push(n); }
    neonPlace.forEach((p, i) => {
      const at = localToWorld(p, 0, m(2.95), 0);
      gridHalos.push({ x: at.x, y: at.y, z: at.z, size: m(0.7), color: NEON[(i * 7 + 3) % NEON.length] });
    });
    this._neon = neon;

    /* The map's own posts, lit in place: a glowing head at each detected top,
       a pool on the surface below it, a halo. No new geometry stands anywhere
       — the post itself is already in the photogrammetry. */
    this.bakedMat = new THREE.MeshBasicMaterial({
      vertexColors: true, color: 0xffeed2, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    /* Sized to the fixture it is set into, not to the halo it wants to throw.
       The flyover luminaire is a pan 1.86 x 0.73 units across and only 0.42
       tall; the 0.34 m sphere that used to sit there was two and a half times
       its height, so it read as a glowing ball parked next to a lamp rather
       than as the lamp being lit. A 0.20 m bulb centred on the pan's underside
       is half swallowed by the housing and half hanging below it — which is
       what a lit lens looks like — and the halo does the glowing. */
    const headRows = BAKED_LAMPS.map((r) => { const h = lampHead(r); return [h.x, h.y, h.z]; });
    const heads = instanced(paint(new THREE.SphereGeometry(m(0.20), 8, 6), 0xffffff),
      this.bakedMat, headRows, null, 0x4C414D, 0, cull);
    const poolRows = BAKED_LAMPS.map((r) => { const f = lampFoot(r); return [f.x, f.y, f.z]; });
    const bakedPools = instanced(bakedPoolGeo(tier === 'hi' ? 3.8 : 2.4), this.glowMat, poolRows, null, 0x4C414D, 0, cull);
    for (const b of [...heads, ...bakedPools]) { b.renderOrder = 3; this.meshes.push(b); }
    for (const r of BAKED_LAMPS) {
      const h = lampHead(r);
      /* The halo carries the read now that the bulb is small: a sodium lamp
         seen down a carriageway is a point with a flare around it, and the
         flare is the part that says "lit" from two hundred units away. */
      gridHalos.push({ x: h.x, y: h.y, z: h.z, size: isDeckLamp(r) ? m(1.05) : m(0.9), color: 0xffdcae });
    }
    this._bakedHeads = heads;
    this._bakedPools = bakedPools;
    /* Vehicle lamp halos, off the same resolved transforms as the lamp
       geometry — literally the same numbers, so a halo cannot sit on a
       different bus from its own headlight. */
    const vehHalos = [];
    const B = BUS_LAMPS, T = TAXI_LAMPS;
    const vehLampHalos = (place, L, headSize, tailSize) => {
      for (const p of place) {
        for (const [lx, ly, lz, size, color] of [
          [-L.hx, L.hy, L.hz, headSize, 0xfff0c8], [L.hx, L.hy, L.hz, headSize, 0xfff0c8],
          [-L.tx, L.ty, L.tz, tailSize, 0xff5a3c], [L.tx, L.ty, L.tz, tailSize, 0xff5a3c],
        ]) {
          const at = localToWorld(p, m(lx), m(ly), m(lz));
          vehHalos.push({ x: at.x, y: at.y, z: at.z, size, color });
        }
      }
    };
    vehLampHalos(busPlace, B, m(0.46), m(0.32));
    vehLampHalos(taxiPlace, T, m(0.38), m(0.27));

    /* ---- the city itself. Every wall on the map gets its windows lit; see
       buildWindows(), which app.js calls once the map geometry is in. ---- */
    this._winTex = tex;
    this._haloGrid = haloPoints(gridHalos, tex);
    this._haloVeh = haloPoints(vehHalos, tex);
    this.group.add(this._haloGrid.points, this._haloVeh.points);

    /* Real point lights. These are the only lights on the map that put actual
       shading on the character and the props, so rather than pinning them to
       six fixed poles they MIGRATE: every frame the nearest lamp heads to the
       camera claim them (see update()). Eight lights therefore light the whole
       city instead of one corner of it, at the cost of eight lights. */
    this._lampLights = [];
    this._litCount = tier === 'hi' ? 8 : 3;
    for (let i = 0; i < this._litCount; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, m(36), 2);
      l.visible = false;
      this.group.add(l);
      this._lampLights.push(l);
    }
    /* Where those lights may go: every lamp head on the map, street and deck. */
    this._lampHeads = [];
    for (const p of polePlace) this._lampHeads.push(localToWorld(p, m(1.20), m(5.9), 0));
    for (const r of BAKED_LAMPS) this._lampHeads.push(lampHead(r));

    /* One shaft per lamp head, street and deck alike — the layer that turns a
       lit road into a place. Faint by design: at 0.05 it is air, at 0.2 it is
       a spotlight in a theatre. */
    /* BackSide, not DoubleSide. With both faces drawn you see the near wall of
       the cone AND the far one, which doubles up exactly at the silhouette and
       turns a shaft of light into a solid white cone with a bright rim. Drawing
       only the far wall gives a single smooth gradient — the cheapest honest
       approximation of light scattering through air there is. */
    this.shaftMat = new THREE.MeshBasicMaterial({
      vertexColors: true, color: 0xffd9a2, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    const shafts = instancedLayer(
      lampShaftGeo(0.30, tier === 'hi' ? 2.9 : 2.3, 13),
      this.shaftMat,
      this._lampHeads.map((h) => ({ x: h.x, y: h.y, z: h.z, yaw: 0, s: 1 })),
      null, cull);
    for (const sh of shafts) { sh.renderOrder = 2; this.meshes.push(sh); }
    this._shafts = shafts;

    /* Everything that can be switched off, so setGlow can stop drawing it when
       the preset has it dark. */
    this._lit = [lamp, glow, busLights, taxiLights, bulbs, neon, heads, bakedPools,
                 beams, shafts].flat().filter(Boolean);
    for (const mesh of this.meshes) this.group.add(mesh);

    if (tier === 'hi') this.group.add(this._cables(rng));

    /* Solid footprints, so none of this can be walked through. Vehicles use
       their real dimensions rotated to the road; pavement props get a square
       roughly the size of the thing you would actually bump into — the tea
       shop's tarp is 3.2 m across but its poles and stools are what stop you,
       so it is deliberately smaller than the canopy. */
    this.obstacles = new ObstacleField();
    this.obstacles.add(busRows,  m(2.50), m(11.5), m(3.2));
    this.obstacles.add(taxiRows, m(1.78), m(4.40), m(1.6));
    this.obstacles.add(TEA,   m(2.6), m(2.6), m(2.3));
    this.obstacles.add(STALL, m(1.5), m(1.1), m(2.2));
    this.obstacles.add(POT,   m(1.1), m(0.5), m(1.5));
    this.obstacles.add(POLE, m(0.4), m(0.4), m(8.0), 1);
    this.obstacles.build();

    scene.add(this.group);
  }

  /**
   * Overhead cables. Yangon's poles carry a visible tangle of them, and the sag
   * is most of the read, so each span is a 6-segment catenary rather than a
   * straight line. One LineSegments draw for the lot.
   */
  _cables(rng) {
    const pts = [];
    const sorted = POLE.slice().sort((a, b) => (a[2] - b[2]) || (a[0] - b[0]));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const span = Math.hypot(dx, dz);
      if (span > m(30) || span < m(3)) continue;      // only plausible neighbours
      for (let line = 0; line < 3; line++) {
        const off = (line - 1) * m(0.32);
        const hy = m(7.25) - line * m(0.55);
        const sag = m(0.45 + rng() * 0.5) * (span / m(20));
        const nx = -dz / span, nz = dx / span;
        let prev = null;
        for (let s = 0; s <= 6; s++) {
          const t = s / 6;
          const x = a[0] + dx * t + nx * off;
          const z = a[2] + dz * t + nz * off;
          const y = a[1] + hy + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
          const cur = new THREE.Vector3(x, y, z);
          if (prev) { pts.push(prev, cur); }
          prev = cur;
        }
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x14171c, transparent: true, opacity: 0.75 }));
    mesh.name = 'overhead-cables';
    return mesh;
  }

  /**
   * How lit the street lamps are, 0..1. Driven by the weather cross-fade rather
   * than switched, so walking from midday into the storm brings them up the way
   * a real photocell would.
   */
  /**
   * Swap a procedurally built vehicle for a downloaded model, keeping the
   * transforms, the colours and the lamp layer exactly as they were. Called
   * after load, so the map is interactive before the extra download lands and
   * a failed fetch simply leaves the procedural one in place.
   */
  replaceVehicle(kind, loaded, liveries) {
    /* A fleet is several meshes now, not one: the taxis are cut into spatial
       tiles so the frustum can reject the ones behind you, and the buses into
       one mesh per livery. Every tile shares the one geometry the download
       produced, so the swap is per-mesh but the payload is not. */
    const fleet = (this._veh && this._veh[kind]) || [];
    if (!fleet.length || !loaded || !loaded.geometry) return false;
    let old = null;
    for (const mesh of fleet) {
      old = old || mesh.geometry;
      mesh.geometry = loaded.geometry;
      if (loaded.material) {
        /* A textured model brings its own material, and with it its own colour —
           so drop the per-instance tint, which would multiply the livery. */
        mesh.material = loaded.material;
        mesh.instanceColor = null;
      }
      mesh.computeBoundingSphere();
    }
    if (old && old !== loaded.geometry) old.dispose();
    const mesh = fleet[0];

    /* Now that the real bodywork is here, sit the lamps on it. The authored
       offsets came from this same model, but a sheared quad only approximates
       a curved panel; snapping each corner to the surface is what makes a lens
       read as set INTO the vehicle rather than stuck onto the front of it.
       The lamp tiles all point at one geometry, so fitting the first fits all. */
    const lights = (this._vehLights && this._vehLights[kind]) || [];
    const fitted = new Set();
    for (const l of lights) {
      if (fitted.has(l.geometry)) continue;
      fitted.add(l.geometry);
      fitLensesToBody(l.geometry, loaded.geometry);
    }

    /* One texture per livery, one InstancedMesh per texture. A per-instance
       tint cannot do this job: it multiplies the whole map, so painting a bus
       green would take its windows and indicators with it. Splitting the fleet
       costs a draw call each and keeps every other colour on the bus intact. */
    if (liveries && liveries.length > 1 && loaded.material && loaded.material.map) {
      /* Split by SLICING THE RESOLVED LAYOUT, never by re-running a PRNG: each
         bus keeps the exact transform its lamps, beam and halos were built
         against, whichever livery mesh ends up drawing it. */
      const place = this._busPlace || [];
      const per = Math.ceil(place.length / liveries.length);
      liveries.forEach((hex, i) => {
        const slice = place.slice(i * per, (i + 1) * per);
        if (!slice.length) return;
        const mat = loaded.material.clone();
        mat.map = makeLivery(loaded.material.map, hex);
        /* Each livery mesh is registered for culling against its OWN slice —
           without that the fleet is the one prop layer left transforming the
           whole map every frame, and at 2226 triangles a bus that is the
           heaviest thing in the scene after the map itself. */
        if (i === 0) {
          mesh.material = mat;
          this._reseat(mesh, slice);
          this._trackForCull(mesh, slice);
          return;
        }
        const extra = new THREE.InstancedMesh(loaded.geometry, mat, slice.length);
        this._reseat(extra, slice);
        extra.castShadow = extra.receiveShadow = false;
        extra.matrixAutoUpdate = false;
        this.group.add(extra);
        this.meshes.push(extra);
        fleet.push(extra);
        this._trackForCull(extra, slice);
      });
    }
    return true;
  }

  /** Add a mesh built after construction to the per-instance cull list. */
  _trackForCull(mesh, place) {
    const c = cullable(mesh, place, null);
    if (!c) return;
    this._cull.push(c);
    if (this._camState) this._camState.x = 1e9;      // rebuild on the next pass
  }

  /** Rewrite an InstancedMesh's transforms from a slice of a resolved layout. */
  _reseat(mesh, place) {
    const dummy = new THREE.Object3D();
    mesh.count = place.length;
    place.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  /**
   * Light every window in the city.
   *
   * The map has no building objects — it is one merged photogrammetry mesh —
   * but it does have walls, and a wall is findable: a triangle whose normal is
   * near-horizontal, standing above the street. Walking the building meshes
   * once at load and dropping a warm point on every few square metres of
   * facade gives the whole skyline lit windows for one Points draw, with no
   * baked data to go stale if the model is ever re-exported.
   *
   * Deterministic throughout — the same geometry gives the same windows every
   * visit, so the city can be art-directed rather than re-rolled.
   *
   * @param meshes the map meshes whose material is building-ish
   * @param streetY the road level; anything below this is kerb, not facade
   */
  buildWindows(meshes, streetY, tier = 'hi') {
    if (!meshes || !meshes.length) return 0;
    const GX = 5.5, GY = 4.2;            // one window per ~3.7 x 2.8 m of wall
    const MIN_Y = streetY + m(2.6);      // above the shopfront awnings
    const MAX_Y = streetY + m(95);
    const seen = new Set();
    const rows = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();

    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const pos = geo && geo.attributes && geo.attributes.position;
      if (!pos) continue;
      const index = geo.index;
      const count = index ? index.count : pos.count;
      const mw = mesh.matrixWorld;
      for (let i = 0; i + 2 < count; i += 3) {
        const i0 = index ? index.getX(i) : i;
        const i1 = index ? index.getX(i + 1) : i + 1;
        const i2 = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
        if (a.y < MIN_Y || a.y > MAX_Y) continue;      // cheap reject before the rest
        b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
        c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        ab.subVectors(b, a); ac.subVectors(c, a);
        n.crossVectors(ab, ac);
        const len = n.length();
        if (len < 1e-6) continue;
        n.multiplyScalar(1 / len);
        if (Math.abs(n.y) > 0.35) continue;            // roof or floor, not a wall
        if (len * 0.5 < 1.2) continue;                 // slivers carry no window
        const cx = (a.x + b.x + c.x) / 3;
        const cy = (a.y + b.y + c.y) / 3;
        const cz = (a.z + b.z + c.z) / 3;
        if (cy < MIN_Y) continue;
        const key = `${Math.floor(cx / GX)},${Math.floor(cy / GY)},${Math.floor(cz / GX)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        /* A deterministic hash decides whether this window is on tonight and
           what is behind it — warm bulb, fluorescent tube, or a sign. Yangon
           runs a lot of cheap fluorescent, which is why the cool ones matter:
           an all-amber city reads as a film set. */
        const h = Math.abs(Math.imul(Math.floor(cx * 7) ^ Math.floor(cz * 13), 0x27d4eb2d)
                           ^ Math.imul(Math.floor(cy * 11), 0x85ebca6b)) % 1000;
        if (h < 380) continue;                         // dark window
        const kind = h > 960 ? 2 : (h > 800 ? 1 : 0);
        rows.push({
          x: cx + n.x * m(0.35), y: cy, z: cz + n.z * m(0.35),
          size: kind === 2 ? m(0.62) : m(0.5),
          color: kind === 2 ? 0x5fe0ff : (kind === 1 ? 0xdcecff : 0xffc98a),
        });
      }
    }
    if (!rows.length) return 0;
    /* A phone does not need every window in the city, and the layer is one
       draw either way — but the fragments are real, so thin it. */
    const keep = tier === 'hi' ? rows : rows.filter((_, i) => i % 3 === 0);
    this._haloWin = haloPoints(keep, this._winTex);
    this._haloWin.points.renderOrder = 4;
    this.group.add(this._haloWin.points);
    this.windowCount = keep.length;
    return keep.length;
  }

  /**
   * Neon on the facades, derived the way the windows are.
   *
   * The complaint this answers is that the towers go dead after dark. They do:
   * the map's own texture is a daylight photograph, the night preset gives it
   * back 3.5% of itself as emissive, and the window layer is a scatter of
   * halo sprites floating a hand's width off the glass. None of that is what a
   * Yangon block looks like at night, because what a Yangon block looks like at
   * night is SIGNAGE — a shopfront band of it at eye level, saturated, and a
   * scatter of lit boxes further up.
   *
   * So: the same triangle walk as `buildWindows`, two height bands, and a small
   * emissive quad laid flat on each accepted wall face and turned to its
   * normal. Additive, depth-tested but not depth-writing, one instanced draw
   * for the lot. The hash gate is deliberately mean — at every eligible face
   * this reads as wallpaper rather than as a street.
   *
   * @returns how many signs were placed
   */
  buildNeon(meshes, streetY, tier = 'hi') {
    if (!meshes || !meshes.length) return 0;
    /* Coarser than the window grid on purpose: a sign is a metre of wall, not a
       window's worth, and two of them on one shopfront is a mess. */
    const GX = 9.5, GY = 7.0;
    /* The mall wants a tighter grid than the shophouses: one sign per 9.5 units
       of a hundred-metre glass facade is four lights on the whole building. */
    const MGX = 5.0, MGY = 4.4;
    const LOW_A = streetY + m(2.4), LOW_B = streetY + m(9.0);     // the shopfront band
    const UP_A = streetY + m(13), UP_B = streetY + m(64);         // boxes further up
    /* The mall's atrium runs the full height of the building, so its upper
       band is not the shophouse one. */
    const MALL_B = streetY + m(46);
    const seen = new Set();
    const rows = [], colours = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
    /* Yangon shopfronts, not a cyberpunk set: hot pink and cyan are real and
       common, and so are plain warm white and the green of a pharmacy cross.
       Electric Blue and Firebrick are the studio's own, and they earn their
       place on the two buildings the board is on. */
    const PALETTE = [0xff2e88, 0x36e0ff, 0xffd27a, 0x53ff9d, 0xff3030, 0x0066ff, 0xfff0d0];
    /* The mall's own light: warm white, barely varied. A shopping centre's
       glow is one colour temperature repeated over a hundred metres of glass,
       and scattering it across a palette is what makes CGI look like CGI. */
    const WARM = [0xfff2dc, 0xffe9c6, 0xfff6ea, 0xffedd2];

    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const pos = geo && geo.attributes && geo.attributes.position;
      if (!pos) continue;
      const index = geo.index;
      const count = index ? index.count : pos.count;
      const mw = mesh.matrixWorld;
      for (let i = 0; i + 2 < count; i += 3) {
        const i0 = index ? index.getX(i) : i;
        const i1 = index ? index.getX(i + 1) : i + 1;
        const i2 = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
        const mall = mesh.material && mesh.material.name === 'Hledan_Center';
        const lowBand = a.y >= LOW_A && a.y <= LOW_B;
        const upBand = a.y >= UP_A && a.y <= (mall ? MALL_B : UP_B);
        if (!lowBand && !upBand) continue;
        b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
        c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        ab.subVectors(b, a); ac.subVectors(c, a);
        n.crossVectors(ab, ac);
        const len = n.length();
        if (len < 1e-6) continue;
        n.multiplyScalar(1 / len);
        if (Math.abs(n.y) > 0.3) continue;              // a wall, not a soffit
        if (len * 0.5 < 3.0) continue;                  // too small to carry a sign
        const cx = (a.x + b.x + c.x) / 3;
        const cy = (a.y + b.y + c.y) / 3;
        const cz = (a.z + b.z + c.z) / 3;
        const gx = mall ? MGX : GX, gy = mall ? MGY : GY;
        const key = `${Math.floor(cx / gx)},${Math.floor(cy / gy)},${Math.floor(cz / gx)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const h = Math.abs(Math.imul(Math.floor(cx * 5) ^ Math.floor(cz * 11), 0x9e3779b1)
                           ^ Math.imul(Math.floor(cy * 3), 0x85ebca6b)) % 1000;
        /* The mall is its own case. Hledan Centre is a shopping centre with a
           lit atrium behind glass on every level, and treating it like a
           shophouse row left the one landmark on the map the darkest thing in
           frame after dark. It gets far more of its faces lit, and it gets
           them WARM WHITE rather than out of the neon palette: what a mall
           throws onto the street is its own interior lighting, not signage. */
        const isMall = mall;
        const keepGate = isMall ? (lowBand ? 780 : 460) : (lowBand ? 340 : 52);
        if (h > keepGate) continue;
        const big = lowBand;
        rows.push({
          x: cx + n.x * m(0.22), y: cy, z: cz + n.z * m(0.22),
          yaw: Math.atan2(n.x, n.z),
          w: isMall ? m(3.4 + (h % 7) * 0.34) : (big ? m(2.5 + (h % 7) * 0.28) : m(1.1 + (h % 5) * 0.22)),
          hgt: isMall ? m(1.05 + (h % 4) * 0.20) : (big ? m(0.62 + (h % 3) * 0.16) : m(0.44)),
        });
        colours.push(isMall ? WARM[h % WARM.length] : PALETTE[h % PALETTE.length]);
      }
    }
    if (!rows.length) return 0;

    const keep = tier === 'hi' ? rows : rows.filter((_, i) => i % 2 === 0);
    const keepCol = tier === 'hi' ? colours : colours.filter((_, i) => i % 2 === 0);

    /* Additive and unlit: a sign is a source, and at midday `setGlow` takes it
       to zero opacity so it costs nothing but a skipped draw. */
    this.signMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      side: THREE.DoubleSide, toneMapped: false,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.InstancedMesh(geo, this.signMat, keep.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    keep.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(0, r.yaw, 0);
      dummy.scale.set(r.w, r.hgt, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.setHex(keepCol[i]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this._signs = mesh;
    this.group.add(mesh);
    this.signCount = keep.length;
    return keep.length;
  }

  /**
   * Guard rails down both edges of the flyover.
   *
   * The deck has parapets in the photogrammetry, but the baked navmap is a
   * single layer of ground heights with no notion of a wall, so walking east
   * off the deck at z=200 simply stepped from 61.7 to 43.2 — an eighteen-unit
   * drop with nothing in the way. `_canStand` only ever rejects a step UP, on
   * the reasoning that walking downhill is walking; on a flyover it is falling
   * off a bridge.
   *
   * The rails are derived from the deck rather than authored: for each slice
   * across the map the run of cells sitting at deck height is measured, and a
   * short barrier is dropped just outside each end of that run, turned to the
   * local heading. The band is anchored at the deck's own height and is only a
   * few units tall, so it stops anyone on the deck and is invisible to anyone
   * on the street eighteen units below.
   *
   * @param nav    the baked navmap, which only exists once play mode has loaded
   * @param solids the mesh colliders. Optional, and only ever used to leave a
   *               rail OUT: a third of the deck's edge already has parapet in
   *               the photogrammetry (117 of 330 rails measured), and an
   *               invisible box on top of a wall that is already solid is a
   *               query the controller runs twenty times a frame for nothing.
   *               Every box that survives this test is one the player can walk
   *               into with no wall on screen, so the fewer the better.
   */
  addDeckRails(nav, solids = null) {
    if (this._railsDone || !this.obstacles || !nav) return 0;
    this._railsDone = true;
    const LO = 55, HI = 70, MIN_W = 8, STEP = 3;
    /* Contiguous RUNS, not the first and last elevated cell in the slice. The
       ramps sit at deck height too, so at some z there are two separate raised
       surfaces; taking the outermost pair of cells then spans the gap between
       them and puts both rails outside everything, leaving the real edges of
       both open. That is why walking west off the deck still worked at z=140. */
    const slices = [];
    for (let z = 30; z <= 520; z += STEP) {
      /* Height-banded to the FLAT deck, not to everything above LO. The ramp
         shoulders fall away through this window, so a plain threshold walks the
         run several cells down the slope and plants the rail below the deck —
         where a body that has already stepped down passes underneath its
         height band and off the side anyway. Take each slice's median elevated
         height and keep only what is level with it. */
      const cells = [];
      for (let x = -95; x <= 105; x += 1) {
        const h = nav.heightAt(x, z);
        if (h === null || h < LO || h > HI || nav.blockedAt(x, z)) { cells.push(null); continue; }
        cells.push(h);
      }
      const present = cells.filter((h) => h !== null).sort((p, q) => p - q);
      if (!present.length) continue;
      const med = present[present.length >> 1];
      const runs = [];
      let start = null, last = null;
      for (let i = 0; i < cells.length; i++) {
        const x = -95 + i;
        const ok = cells[i] !== null && Math.abs(cells[i] - med) <= 1.6;
        if (ok) {
          if (start === null) start = x;
          last = x;
        } else if (start !== null && x - last > 2) {   // tolerate a 2-cell nick
          if (last - start >= MIN_W) runs.push([start, last]);
          start = null;
        }
      }
      if (start !== null && last - start >= MIN_W) runs.push([start, last]);
      for (const [x0, x1] of runs) slices.push({ z, x0, x1, y: nav.heightAt((x0 + x1) / 2, z) });
    }
    if (slices.length < 3) return 0;

    /* Rail each run's two ends. The heading comes from the nearest slice ahead
       and behind that belongs to the SAME run — matched by overlap, so a rail
       never swings across to a neighbouring deck. */
    const rows = [];
    const near = (z, edgeX, sign) => {
      let best = null, bestD = 1e9;
      for (const t of slices) {
        if (Math.abs(t.z - z) < 0.5 || Math.abs(t.z - z) > STEP * 2.5) continue;
        const tx = sign > 0 ? t.x1 : t.x0;
        const d = Math.abs(tx - edgeX);
        if (d < bestD && d < 14) { bestD = d; best = { x: tx, z: t.z }; }
      }
      return best;
    };
    /* The body band the controller will actually test against, so "is there
       already a wall here" is asked exactly the way the wall is later used. */
    const R = 0.25 * S, STEP_UP = 0.62 * S, BODY_H = 1.8 * S;
    let skipped = 0;
    for (const s of slices) {
      if (s.y === null) continue;
      for (const sign of [-1, 1]) {
        const edge = sign > 0 ? s.x1 : s.x0;
        const n = near(s.z, edge, sign);
        const yaw = n ? Math.atan2(n.x - edge, n.z - s.z) : 0;
        // a step outside the last walkable cell, so the edge itself stays walkable
        const px = edge + sign * 1.3;
        if (solids && solids.blocked(px, s.z, R, s.y + STEP_UP, s.y + BODY_H)) { skipped++; continue; }
        rows.push([px, s.y, s.z, yaw]);
      }
    }
    this._railsSkipped = skipped;
    this.obstacles.add(rows, m(0.5), m(3.2), m(4.2), 1);
    this.obstacles.build();
    this.deckRails = rows.length;
    return rows.length;
  }

  /**
   * Compact each heavy prop layer down to the instances actually on screen.
   *
   * See instancedLayer() for why this is per-instance rather than per-tile.
   * The visible instances are written to the front of the buffer and `count`
   * is shortened, so the draw call stays one draw call and the GPU stops
   * transforming the nine tenths of the map that is behind the camera.
   *
   * Two things keep the cost down. The frustum is rebuilt only when the camera
   * has actually moved — auto-spin aside, a parked camera re-uploads nothing —
   * and a layer whose visible count is unchanged and whose set is unchanged
   * skips its upload entirely, which is the common case while walking.
   */
  _cullPass(camera) {
    const list = this._cull;
    if (!list || !list.length) return;
    const cam = this._camState || (this._camState = { x: 1e9, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 0 });
    const p = camera.position, q = camera.quaternion;
    const moved = Math.abs(p.x - cam.x) + Math.abs(p.y - cam.y) + Math.abs(p.z - cam.z) > 0.35
      || Math.abs(q.x - cam.qx) + Math.abs(q.y - cam.qy)
       + Math.abs(q.z - cam.qz) + Math.abs(q.w - cam.qw) > 0.002;
    if (!moved) return;
    cam.x = p.x; cam.y = p.y; cam.z = p.z;
    cam.qx = q.x; cam.qy = q.y; cam.qz = q.z; cam.qw = q.w;

    camera.updateMatrixWorld();
    const mat = this._cullMat || (this._cullMat = new THREE.Matrix4());
    const fr = this._frustum || (this._frustum = new THREE.Frustum());
    fr.setFromProjectionMatrix(mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sph = this._cullSphere || (this._cullSphere = new THREE.Sphere());
    const dummy = this._cullDummy || (this._cullDummy = new THREE.Object3D());
    const col = this._cullColor || (this._cullColor = new THREE.Color());

    /* On the low tier, drop what is too far away to read as anything.
       The frustum test alone keeps every bollard, planter and tarp out to the
       far edge of a 1765-unit map, and at street level most of them land on
       one or two pixels each — real vertex and instance cost for detail the
       phone cannot resolve. The cut is on the SQUARED distance so the whole
       pass stays multiply-only, and it is generous enough (180 units, 120 m)
       that the thinning happens in the haze rather than in front of you. The
       high tier keeps the lot. */
    const far2 = this._propFar2;
    for (const layer of list) {
      const { mesh, place, colours } = layer;
      // a layer this pass hid is still ours to reconsider; anything else that
      // is invisible was switched off deliberately and stays off
      if (!mesh.visible && !layer.hidden) continue;
      cullSphere(layer);
      const oy = layer.oy, r = layer.r;
      let n = 0;
      for (let i = 0; i < place.length; i++) {
        const pl = place[i];
        const limit2 = mesh.userData.detailDistance ? mesh.userData.detailDistance ** 2 : far2;
        if (limit2 > 0) {
          const dx = pl.x - p.x, dz = pl.z - p.z;
          if (dx * dx + dz * dz > limit2) continue;
        }
        sph.center.set(pl.x, pl.y + oy * pl.s, pl.z);
        sph.radius = r * pl.s;
        if (!fr.intersectsSphere(sph) && (!mesh.castShadow || sph.center.distanceToSquared(p) > 60 * 60)) continue;
        dummy.position.set(pl.x, pl.y, pl.z);
        dummy.rotation.set(0, pl.yaw, 0);
        dummy.scale.set(pl.s, pl.s, pl.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        if (colours && mesh.instanceColor) {
          mesh.setColorAt(n, col.set(colours[(i * 7 + 3) % colours.length]));
        }
        n++;
      }
      mesh.count = n;
      /* An InstancedMesh with count 0 still costs a draw call: three.js binds
         the program, uploads the uniforms and issues drawElementsInstanced for
         nothing. Six of those were going out per frame at street level once the
         distance cut started emptying whole layers, so an empty layer hides
         itself instead. The `hidden` flag rather than `visible` alone because
         a layer may also be switched off by the weather, and this pass must
         not switch that back on. */
      if (n === 0) { mesh.visible = false; layer.hidden = true; }
      else if (layer.hidden) { mesh.visible = true; layer.hidden = false; }
      mesh.instanceMatrix.needsUpdate = true;
      if (colours && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      /* The bounding sphere three.js would otherwise recompute is worthless
         now — the buffer changes every time the camera does — and every
         instance in it has already been tested. Skip its own cull. */
      mesh.frustumCulled = false;
      layer.count = n;
    }
  }

  /**
   * Move the real point lights to whichever lamp heads are nearest the camera.
   *
   * Called every frame; costs a pass over ~94 lamp positions and a partial
   * selection, which is nothing, and means the eight lights the scene can
   * afford are always the eight that matter. Lights are only moved when the
   * street is actually lit, so nothing happens at midday.
   */
  update(camera) {
    this._cullPass(camera);
    const lights = this._lampLights;
    if (!lights.length || !lights[0].visible) return;
    const heads = this._lampHeads;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const N = lights.length;

    /* Keep a shortlist of the nearest lamps, then hand the lights out along it
       while refusing any lamp that sits within MIN_SEP of one already chosen.
       Taking the nearest N outright looked correct on paper and blew out in
       practice: at a junction this dense, all eight landed inside one corner
       and stacked into a single overexposed patch. Spacing them turns the same
       eight lights into a lit neighbourhood. */
    const MIN_SEP = 26 * 26;
    const POOL = Math.min(heads.length, N * 4);
    const poolI = this._poolI || (this._poolI = new Int32Array(POOL));
    const poolD = this._poolD || (this._poolD = new Float32Array(POOL));
    poolD.fill(Infinity); poolI.fill(-1);
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i];
      const dx = h.x - cx, dy = h.y - cy, dz = h.z - cz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d >= poolD[POOL - 1]) continue;
      let k = POOL - 1;
      while (k > 0 && poolD[k - 1] > d) { poolD[k] = poolD[k - 1]; poolI[k] = poolI[k - 1]; k--; }
      poolD[k] = d; poolI[k] = i;
    }

    let used = 0;
    for (let p = 0; p < POOL && used < N; p++) {
      if (poolI[p] < 0) continue;
      const h = heads[poolI[p]];
      let clash = false;
      for (let u = 0; u < used; u++) {
        const l = lights[u].position;
        const dx = l.x - h.x, dz = l.z - h.z;
        if (dx * dx + dz * dz < MIN_SEP) { clash = true; break; }
      }
      if (clash) continue;
      lights[used].position.set(h.x, h.y, h.z);
      lights[used].intensity = lights[used].userData.lit || 0;
      used++;
    }
    /* A sparse corner may not fill every light. Darken the remainder by
       INTENSITY, never by `visible`: three.js keys its shader programs on the
       light COUNT, so toggling one off mid-run recompiles every material in
       the scene — a visible hitch, once per step you take. */
    for (let i = used; i < N; i++) lights[i].intensity = 0;
  }

  /**
   * @param lamps      street lamps and shop bulbs, 0..1 — these are on the grid
   * @param headlights vehicle lamps, 0..1 — these are not. In a blackout the
   *                   street is dark and the traffic is still lit, which is
   *                   exactly what the junction looks like when the power goes.
   */
  setGlow(lamps, headlights = lamps) {
    const a = Math.max(0, Math.min(1, lamps));
    const h = Math.max(0, Math.min(1, headlights));
    /* A layer that was switched off skipped its cull pass, so its instance
       buffer is stale by the time dusk switches it back on. Invalidate the
       camera state and the next pass rebuilds every layer from scratch. */
    if (this._camState) this._camState.x = 1e9;
    this.lampMat.opacity = a;
    this.glowMat.opacity = a * 0.6;
    this.bulbMat.opacity = a * 0.9;
    this.vehMat.opacity = h * 0.95;
    if (this.neonMat) this.neonMat.opacity = a * 0.85;
    /* Facade signage is on somebody's own meter, like the windows: it dims
       with the grid but a blackout street still has a few shopfronts lit off a
       generator, and a city with every sign dead reads as evacuated. */
    if (this.signMat) {
      const sg = Math.max(a, (this.windowFloor || 0) * 0.7);
      this.signMat.opacity = sg * 0.9;
      if (this._signs) this._signs.visible = sg > 0.012;
    }
    if (this.bakedMat) this.bakedMat.opacity = a * 0.95;
    if (this.shaftMat) this.shaftMat.opacity = a * 0.055;

    /* The beams belong to the traffic, not the grid — in a blackout the road is
       dark and the buses still light it — but a headlight beam laid on sunlit
       tarmac is invisible in life and should be absent here. Midday still runs
       the lamps at 0.14 for daytime running lights, which is a lit bulb and not
       a beam, so the wash is gated on the headlights being genuinely ON rather
       than merely non-zero. */
    const beamK = THREE.MathUtils.smoothstep(h, 0.3, 0.8);
    if (this.beamMat) this.beamMat.opacity = beamK * 0.11;
    if (this.tailMat) this.tailMat.opacity = beamK * 0.10;

    // the halo layer and the sodium pools ride the same photocell
    if (this._haloGrid) {
      this._haloGrid.mat.uniforms.uOpacity.value = a;
      this._haloGrid.points.visible = a > 0.012;
      /* Same for the lamp halos: a bloom around a bulb is something you only
         see against a dark street, so they come up with the beams. */
      this._haloVeh.mat.uniforms.uOpacity.value = beamK * 0.85;
      this._haloVeh.points.visible = beamK > 0.012;
    }
    /* Windows are on somebody's own meter. They dim with the grid but never go
       all the way out — a blackout street still has generators and candles,
       and a city with every window black looks abandoned rather than dark. */
    if (this._haloWin) {
      const w = Math.max(a, this.windowFloor || 0) * 0.9;
      this._haloWin.mat.uniforms.uOpacity.value = w;
      this._haloWin.points.visible = w > 0.012;
    }
    if (this._lampLights) {
      for (const l of this._lampLights) {
        /* the value update() restores for whichever lamps it hands out */
        l.userData.lit = a * 260;
        l.intensity = l.userData.lit;
        l.visible = a > 0.02;
      }
    }

    /* A transparent mesh at zero opacity still costs a draw call and, worse,
       still rasterises every pixel it covers before blending nothing. At midday
       that is the entire lighting rig drawn for no reason, so switch it off. */
    for (const mesh of this._lit) {
      mesh.visible = mesh.material.opacity > 0.012;
    }
  }

  get count() { return this.meshes.reduce((n, mesh) => n + mesh.count, 0); }
}
