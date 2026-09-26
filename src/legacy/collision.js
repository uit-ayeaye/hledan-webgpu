/**
 * Mesh colliders for the whole map, derived from the map's own triangles.
 *
 * The baked navmap (navmesh.png) is one layer of heights plus one walkable
 * bit per cell, and both halves of that were wrong in ways you could feel:
 *
 *  - The blocked bit has **no height**. It was baked by looking for a ceiling
 *    within `headroom` of the surface, and the mesh it looked at included
 *    `Tree(No collider)` — a mesh the author had literally named for not being
 *    a collider. Measured against the real geometry, **89% of the navmap's
 *    blocked cells have nothing solid at body height**: they are pavements
 *    under a canopy six to twenty metres overhead. Those are the invisible
 *    walls. In the other direction 1.7% of the cells it calls open have a real
 *    wall standing in them, because a wall with a doorway or a gap over it
 *    keeps its headroom and passes the test.
 *
 *  - One height per cell means a flyover **deletes the road underneath it**.
 *    Standing on the lower carriageway the navmap reports the deck eighteen
 *    units overhead as the ground, so you cannot walk under the bridge at all
 *    (and the chase camera used to be lifted straight into the slab).
 *
 * So collision comes from the geometry instead. Three grids over the same
 * triangle array, split by facing:
 *
 *   floors — |normal.y| >= 0.55. Ground you walk on. Sampling a column gives
 *            every surface at an (x, z), which is what makes two-level ground
 *            work.
 *   ramps  — 0.25 <= |normal.y| < 0.55, so 57 deg to 76 deg of pitch. These
 *            HOLD the body up but do not stop it, and splitting them out is
 *            what makes the roofs standable. Lumped in with the walls they did
 *            both of the wrong things at once: they were not in the floor set,
 *            so a column query found nothing and the body dropped through the
 *            roof; and they were in the wall set, so the body it had just
 *            dropped into was then wedged, with every direction blocked by the
 *            shell around it. Measured over the built core, 0.58% of columns
 *            have a face this steep on top — the mall's barrel roof, the
 *            tower's sloped glass, every pitched shophouse — and all of them
 *            behaved that way. Nothing walks UP one: past the walk limit the
 *            controller slides you back down, which is the same answer a
 *            wall gives without the body having to be inside anything.
 *   walls  — |normal.y| < 0.25. These are what stop a body, and they carry
 *            their own height, so nothing can block in mid-air: a canopy at
 *            +6 m is simply not in the band a standing body occupies.
 *
 * Cost, measured on this map (53k triangles in, 52.5k kept — 29.4k walls,
 * 5.1k ramps and 17.9k floors): 3.95 MB at cell 4, and 3.0 MB at cell 6, which
 * is what the low tier takes. Splitting the ramps out of the walls costs
 * 0.1 MB and a third bucket sweep at build time; a whole controller frame is
 * around 13 us walking and 20 us through a Flash Step, against roughly 10 us
 * before — 0.08% of a 60 fps budget, and the Flash Step figure is the
 * sub-stepping in character.js rather than anything here. It is built lazily
 * with the navmap, so a visitor who only orbits the model never pays for it.
 *
 * XZ buckets, not an octree: this is a city, 825 x 1765 units of ground and
 * only ~170 tall, so the vertical axis buys almost no separation.
 *
 * `raycast()` at the bottom is the chase camera's occlusion test and combat's
 * aim ray. It used to be a second grid of its own (`occlusion.js`) over a
 * second copy of the triangles, built eagerly at page load for every visitor
 * whether they ever pressed Play or not. Same structure, same query, same
 * answer — so it is one grid now.
 */

const CELL = 4;                    // map units; the body is 0.75 across
const FLAT = 0.55;                 // |normal.y| above this counts as floor
/* Below this a face is a wall: it stops the body and holds nothing up. Between
   RAMP and FLAT it is a pitched surface — support without obstruction. 0.25 is
   76 deg, past which a photogrammetry face is a facade rather than a roof. */
const RAMP = 0.25;

/**
 * One XZ bucket set over a shared triangle array.
 *
 * Triangles are stored once, in `tris`; each grid holds only indices into it,
 * so the wall set and the floor set cost an Int32Array each rather than a
 * second copy of the geometry.
 */
class Buckets {
  constructor(tris, list, cell) {
    this.tris = tris;
    this.cell = cell;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const t of list) {
      const o = t * 9;
      for (let k = 0; k < 3; k++) {
        const x = tris[o + k * 3], z = tris[o + k * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
    if (!list.length) { minX = minZ = 0; maxX = maxZ = 0; }
    this.minX = minX; this.minZ = minZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);

    /* Counting sort into flat arrays: one pass to size every cell, a prefix
       sum, then one pass to fill. An array-of-arrays would allocate ~90k
       little arrays and is what makes this kind of grid feel expensive. */
    const nCells = this.nx * this.nz;
    const start = new Int32Array(nCells + 1);
    const half = cell / 2;
    const sweep = (cb) => {
      for (let n = 0; n < list.length; n++) {
        const t = list[n], o = t * 9;
        const ax = tris[o], az = tris[o + 2];
        const bx = tris[o + 3], bz = tris[o + 5];
        const cx = tris[o + 6], cz = tris[o + 8];
        const x0 = this._cx(Math.min(ax, bx, cx)), x1 = this._cx(Math.max(ax, bx, cx));
        const z0 = this._cz(Math.min(az, bz, cz)), z1 = this._cz(Math.max(az, bz, cz));
        /* A triangle covering a handful of cells goes in by bounding box; the
           test below costs more than the few empty buckets it would save. The
           terrain is the other case entirely — its triangles are long, thin and
           diagonal, and one of them can span thousands of cells of which it
           touches a few hundred. Filtering those halves both the index and the
           length of the buckets every query walks. */
        if ((x1 - x0 + 1) * (z1 - z0 + 1) <= 4) {
          for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) cb(j * this.nx + i, t);
          continue;
        }
        // 2D separating axes: the triangle's three edge normals, in XZ
        const n0x = -(bz - az), n0z = bx - ax;
        const n1x = -(cz - bz), n1z = cx - bx;
        const n2x = -(az - cz), n2z = ax - cx;
        const p0a = n0x * ax + n0z * az, p0c = n0x * cx + n0z * cz;
        const p1a = n1x * bx + n1z * bz, p1c = n1x * ax + n1z * az;
        const p2a = n2x * cx + n2z * cz, p2c = n2x * bx + n2z * bz;
        const r0 = Math.abs(n0x) * half + Math.abs(n0z) * half;
        const r1 = Math.abs(n1x) * half + Math.abs(n1z) * half;
        const r2 = Math.abs(n2x) * half + Math.abs(n2z) * half;
        for (let j = z0; j <= z1; j++) {
          const czc = this.minZ + (j + 0.5) * cell;
          for (let i = x0; i <= x1; i++) {
            const cxc = this.minX + (i + 0.5) * cell;
            const d0 = n0x * cxc + n0z * czc;
            if ((d0 - r0 > p0a && d0 - r0 > p0c) || (d0 + r0 < p0a && d0 + r0 < p0c)) continue;
            const d1 = n1x * cxc + n1z * czc;
            if ((d1 - r1 > p1a && d1 - r1 > p1c) || (d1 + r1 < p1a && d1 + r1 < p1c)) continue;
            const d2 = n2x * cxc + n2z * czc;
            if ((d2 - r2 > p2a && d2 - r2 > p2c) || (d2 + r2 < p2a && d2 + r2 < p2c)) continue;
            cb(j * this.nx + i, t);
          }
        }
      }
    };
    sweep((c) => { start[c + 1]++; });
    for (let i = 0; i < nCells; i++) start[i + 1] += start[i];
    const items = new Int32Array(start[nCells]);
    const cursor = new Int32Array(nCells);
    sweep((c, t) => { items[start[c] + cursor[c]++] = t; });
    this.start = start;
    this.items = items;
  }

  _cx(x) { return Math.min(this.nx - 1, Math.max(0, ((x - this.minX) / this.cell) | 0)); }
  _cz(z) { return Math.min(this.nz - 1, Math.max(0, ((z - this.minZ) / this.cell) | 0)); }

  get bytes() { return this.start.byteLength + this.items.byteLength; }
}

/**
 * Separating-axis test between a triangle and an axis-aligned box, with the
 * box already translated to the origin. Akenine-Moller's thirteen axes: the
 * three box normals, the triangle normal, and the nine edge cross products.
 *
 * Exact, ~40 flops, and it is what lets the body be tested against the real
 * surface rather than against a rasterised approximation of it.
 */
function triBox(T, o, cx, cy, cz, hx, hy, hz) {
  const v0x = T[o] - cx,     v0y = T[o + 1] - cy, v0z = T[o + 2] - cz;
  const v1x = T[o + 3] - cx, v1y = T[o + 4] - cy, v1z = T[o + 5] - cz;
  const v2x = T[o + 6] - cx, v2y = T[o + 7] - cy, v2z = T[o + 8] - cz;

  // box normals first — they reject the overwhelming majority
  if (Math.min(v0x, v1x, v2x) > hx || Math.max(v0x, v1x, v2x) < -hx) return false;
  if (Math.min(v0y, v1y, v2y) > hy || Math.max(v0y, v1y, v2y) < -hy) return false;
  if (Math.min(v0z, v1z, v2z) > hz || Math.max(v0z, v1z, v2z) < -hz) return false;

  const e0x = v1x - v0x, e0y = v1y - v0y, e0z = v1z - v0z;
  const e1x = v2x - v1x, e1y = v2y - v1y, e1z = v2z - v1z;
  const e2x = v0x - v2x, e2y = v0y - v2y, e2z = v0z - v2z;

  const nx = e0y * e1z - e0z * e1y;
  const ny = e0z * e1x - e0x * e1z;
  const nz = e0x * e1y - e0y * e1x;
  if (Math.abs(nx * v0x + ny * v0y + nz * v0z)
      > Math.abs(nx) * hx + Math.abs(ny) * hy + Math.abs(nz) * hz) return false;

  /* The nine edge axes, inlined. `axis` projects all three vertices and the
     box onto one direction and looks for a gap. */
  const axis = (ax, ay, az) => {
    const p0 = ax * v0x + ay * v0y + az * v0z;
    const p1 = ax * v1x + ay * v1y + az * v1z;
    const p2 = ax * v2x + ay * v2y + az * v2z;
    const r = Math.abs(ax) * hx + Math.abs(ay) * hy + Math.abs(az) * hz;
    return Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r;
  };
  if (axis(0, -e0z, e0y) || axis(e0z, 0, -e0x) || axis(-e0y, e0x, 0)) return false;
  if (axis(0, -e1z, e1y) || axis(e1z, 0, -e1x) || axis(-e1y, e1x, 0)) return false;
  if (axis(0, -e2z, e2y) || axis(e2z, 0, -e2x) || axis(-e2y, e2x, 0)) return false;
  return true;
}

export class MapColliders {
  /**
   * @param meshes  THREE.Mesh[] — read once at their current world transform.
   *                Pass the map's solid meshes only: the tree mesh is named
   *                "no collider" by its author and baking it is what put
   *                invisible walls all over the pavements.
   * @param THREE   the module, so this file needs no import of its own
   * @param yLo/yHi the band a body can ever reach. Everything outside it is
   *                dropped — a fourth-floor window ledge cannot be walked into
   *                and indexing it only makes the buckets longer.
   * @param cell    XZ bucket size. The low tier widens this: fewer, fatter
   *                buckets is a smaller index for slightly more work per query,
   *                and a phone is short of memory long before it is short of
   *                arithmetic.
   */
  constructor(meshes, THREE, { yLo = -Infinity, yHi = Infinity, cell = CELL } = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

    /* Size the output before filling it. The map is ~53k triangles and most of
       them survive the band test, so a growing plain array here spends more
       time in the allocator than the whole rest of the build does. */
    let total = 0;
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const pos = geo && geo.attributes && geo.attributes.position;
      if (!pos) continue;
      total += ((geo.index ? geo.index.count : pos.count) / 3) | 0;
    }
    const tmp = new Float32Array(total * 9);
    const walls = [], floors = [], ramps = [];
    let w = 0;                                        // write cursor, triangles

    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const pos = geo && geo.attributes && geo.attributes.position;
      if (!pos) continue;
      const idx = geo.index;
      mesh.updateWorldMatrix(true, false);
      const e = mesh.matrixWorld.elements;
      /* Read the packed array directly where the layout allows it: this is
         160k vertex reads and the accessor path pays a bounds check and a
         method call for each component. Interleaved attributes fall back. */
      const flat = pos.array && pos.itemSize === 3 && !pos.isInterleavedBufferAttribute
        ? pos.array : null;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        const j0 = idx ? idx.getX(i) : i;
        const j1 = idx ? idx.getX(i + 1) : i + 1;
        const j2 = idx ? idx.getX(i + 2) : i + 2;
        const rax = flat ? flat[j0 * 3] : pos.getX(j0);
        const ray = flat ? flat[j0 * 3 + 1] : pos.getY(j0);
        const raz = flat ? flat[j0 * 3 + 2] : pos.getZ(j0);
        const rbx = flat ? flat[j1 * 3] : pos.getX(j1);
        const rby = flat ? flat[j1 * 3 + 1] : pos.getY(j1);
        const rbz = flat ? flat[j1 * 3 + 2] : pos.getZ(j1);
        const rcx = flat ? flat[j2 * 3] : pos.getX(j2);
        const rcy = flat ? flat[j2 * 3 + 1] : pos.getY(j2);
        const rcz = flat ? flat[j2 * 3 + 2] : pos.getZ(j2);

        const ay = e[1] * rax + e[5] * ray + e[9] * raz + e[13];
        const by = e[1] * rbx + e[5] * rby + e[9] * rbz + e[13];
        const cy = e[1] * rcx + e[5] * rcy + e[9] * rcz + e[13];
        // only what a body could ever touch — checked before the other two axes
        if (ay > yHi && by > yHi && cy > yHi) continue;
        if (ay < yLo && by < yLo && cy < yLo) continue;

        const ax = e[0] * rax + e[4] * ray + e[8] * raz + e[12];
        const az = e[2] * rax + e[6] * ray + e[10] * raz + e[14];
        const bx = e[0] * rbx + e[4] * rby + e[8] * rbz + e[12];
        const bz = e[2] * rbx + e[6] * rby + e[10] * rbz + e[14];
        const cx = e[0] * rcx + e[4] * rcy + e[8] * rcz + e[12];
        const cz = e[2] * rcx + e[6] * rcy + e[10] * rcz + e[14];

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-12) continue;                    // degenerate; collides with nothing
        const up = Math.abs(ny / len);
        (up >= FLAT ? floors : up >= RAMP ? ramps : walls).push(w);
        const o = w * 9;
        tmp[o] = ax; tmp[o + 1] = ay; tmp[o + 2] = az;
        tmp[o + 3] = bx; tmp[o + 4] = by; tmp[o + 5] = bz;
        tmp[o + 6] = cx; tmp[o + 7] = cy; tmp[o + 8] = cz;
        w++;
      }
    }

    const tris = tmp.slice(0, w * 9);
    this.tris = tris;
    this.wall = new Buckets(tris, walls, cell);
    this.floor = new Buckets(tris, floors, cell);
    this.ramp = new Buckets(tris, ramps, cell);
    this.wallCount = walls.length;
    this.floorCount = floors.length;
    this.rampCount = ramps.length;
    this._col = [];                                   // scratch for surfaces(): heights
    this._src = [];                                   // and the triangle each came from
    this._stamp = null;                               // per-ray visit marks
    this._tick = 0;
    /* The facing of whatever `floorUnder` last settled on, so the controller
       can tell a floor from a pitch without asking a second question. */
    this.hitUp = 1;
    this.hitNx = 0; this.hitNz = 0;
    this.buildMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    this.bytes = tris.byteLength + this.wall.bytes + this.floor.bytes + this.ramp.bytes;
  }

  /**
   * Does a body of radius `r` standing at (x, z) with its band from `yLo` to
   * `yHi` run into anything solid?
   *
   * `yLo` is the caller's step-up height, not the feet: a kerb, a doorstep or
   * the lip of a traffic island is geometry you walk over, and testing from
   * the sole up would have every one of them stop you dead.
   */
  blocked(x, z, r, yLo, yHi) {
    const g = this.wall, T = this.tris;
    const x0 = g._cx(x - r), x1 = g._cx(x + r);
    const z0 = g._cz(z - r), z1 = g._cz(z + r);
    const cy = (yLo + yHi) / 2, hy = (yHi - yLo) / 2;
    for (let j = z0; j <= z1; j++) {
      const row = j * g.nx;
      for (let i = x0; i <= x1; i++) {
        const c = row + i;
        const end = g.start[c + 1];
        for (let p = g.start[c]; p < end; p++) {
          if (triBox(T, g.items[p] * 9, x, cy, z, r, hy, r)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Every surface directly over (x, z) that can hold a body up, lowest first.
   *
   * Floors and ramps both, because a barrel roof is somewhere to stand even
   * where it has tipped past walkable — see the class note. `this._src` holds
   * the triangle each height came from, so `floorUnder` can recover the facing
   * of the one it picks without this pass storing a normal per triangle.
   *
   * Returns a scratch array that is reused on the next call — a query this hot
   * must not allocate, and no caller needs two columns at once. The two sets
   * are merged by insertion as they are read: a column holds a handful of
   * surfaces, and inserting them in order is cheaper than sorting twice.
   */
  surfaces(x, z) {
    const T = this.tris, out = this._col, src = this._src;
    out.length = 0; src.length = 0;
    for (let b = 0; b < 2; b++) {
      const g = b ? this.ramp : this.floor;
      const c = g._cz(z) * g.nx + g._cx(x);
      const end = g.start[c + 1];
      for (let p = g.start[c]; p < end; p++) {
        const t = g.items[p], o = t * 9;
        const ax = T[o], az = T[o + 2];
        const bx = T[o + 3], bz = T[o + 5];
        const cx = T[o + 6], cz = T[o + 8];
        // barycentric containment in XZ, then interpolate the height
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (d > -1e-9 && d < 1e-9) continue;                  // edge-on triangle
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        if (l1 < -1e-4) continue;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        if (l2 < -1e-4) continue;
        const l3 = 1 - l1 - l2;
        if (l3 < -1e-4) continue;
        const y = l1 * T[o + 1] + l2 * T[o + 4] + l3 * T[o + 7];
        let i = out.length;
        while (i > 0 && out[i - 1] > y) { out[i] = out[i - 1]; src[i] = src[i - 1]; i--; }
        out[i] = y; src[i] = t;
      }
    }
    return out;
  }

  /**
   * The highest surface at or below `y`, or null if there is none.
   *
   * Also leaves the facing of that surface in `hitUp` (|normal.y|) and its
   * downhill direction in `hitNx`/`hitNz`, which is what the controller reads
   * to decide whether the thing under the feet is standable or a slide.
   */
  floorUnder(x, z, y) {
    const s = this.surfaces(x, z);
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] > y) continue;
      const o = this._src[i] * 9, T = this.tris;
      const ax = T[o], ay = T[o + 1], az = T[o + 2];
      const e1x = T[o + 3] - ax, e1y = T[o + 4] - ay, e1z = T[o + 5] - az;
      const e2x = T[o + 6] - ax, e2y = T[o + 7] - ay, e2z = T[o + 8] - az;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz) || 1;
      // point it up, so the horizontal part is always the downhill direction
      const sign = ny < 0 ? -1 : 1;
      this.hitUp = Math.abs(ny) / len;
      this.hitNx = (nx * sign) / len;
      this.hitNz = (nz * sign) / len;
      return s[i];
    }
    this.hitUp = 1; this.hitNx = 0; this.hitNz = 0;
    return null;
  }

  /**
   * The highest surface a body could stand on at (x, z), or null.
   *
   * `surfaces()` would answer this, but it answers it into a buffer it shares
   * with every other caller — and the one caller that needs this is
   * `InteriorMask.inside`, which is itself called from inside a loop over that
   * same buffer. So this walks the grids and keeps a maximum instead, touching
   * nothing anyone else is holding.
   */
  topAt(x, z) {
    const T = this.tris;
    let top = null;
    for (let b = 0; b < 2; b++) {
      const g = b ? this.ramp : this.floor;
      const c = g._cz(z) * g.nx + g._cx(x);
      const end = g.start[c + 1];
      for (let p = g.start[c]; p < end; p++) {
        const t = g.items[p], o = t * 9;
        const ax = T[o], az = T[o + 2];
        const bx = T[o + 3], bz = T[o + 5];
        const cx = T[o + 6], cz = T[o + 8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (d > -1e-9 && d < 1e-9) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        if (l1 < -1e-4) continue;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        if (l2 < -1e-4) continue;
        const l3 = 1 - l1 - l2;
        if (l3 < -1e-4) continue;
        const y = l1 * T[o + 1] + l2 * T[o + 4] + l3 * T[o + 7];
        if (top === null || y > top) top = y;
      }
    }
    return top;
  }

  /** The lowest surface above `y` — headroom, for anything that needs it. */
  ceilingOver(x, z, y) {
    const s = this.surfaces(x, z);
    for (let i = 0; i < s.length; i++) if (s[i] > y) return s[i];
    return null;
  }

  /**
   * Nearest hit along `dir` from `origin`, or -1 for a clear line. `dir` must
   * be unit length; `maxLen` bounds the search.
   *
   * This is the chase camera's occlusion test and combat's aim ray, and it is
   * here rather than in a grid of its own because the set it needs is exactly
   * the set collision already holds. The separate occluder grid it replaces
   * was built from every map mesh EXCEPT `Environment`, on the reasoning that
   * the terrain backdrop is ground and the camera has a height clamp for
   * ground. It is not only ground: **the flyover's piers are in `Environment`**,
   * so walking under the bridge put the eye inside a pier with nothing to push
   * it out, and the screen filled with grey slab. All three sets count here —
   * the deck's underside is a ceiling the camera must not rise through, and a
   * ramp is as opaque as anything else.
   */
  raycast(origin, dir, maxLen) {
    const T = this.tris;
    const stamp = this._stamp || (this._stamp = new Int32Array(this.tris.length / 9));
    const tick = ++this._tick;
    let best = maxLen, found = false;

    for (let g = 0; g < 3; g++) {
      const B = g === 0 ? this.wall : g === 1 ? this.floor : this.ramp;
      const ex = origin.x + dir.x * maxLen, ez = origin.z + dir.z * maxLen;
      const x0 = B._cx(Math.min(origin.x, ex)), x1 = B._cx(Math.max(origin.x, ex));
      const z0 = B._cz(Math.min(origin.z, ez)), z1 = B._cz(Math.max(origin.z, ez));
      for (let j = z0; j <= z1; j++) {
        const row = j * B.nx;
        for (let i = x0; i <= x1; i++) {
          const c = row + i;
          const end = B.start[c + 1];
          for (let p = B.start[c]; p < end; p++) {
            const t = B.items[p];
            if (stamp[t] === tick) continue;
            stamp[t] = tick;

            // Moller-Trumbore, inlined on the flat triangle array
            const o = t * 9;
            const ax = T[o], ay = T[o + 1], az = T[o + 2];
            const e1x = T[o + 3] - ax, e1y = T[o + 4] - ay, e1z = T[o + 5] - az;
            const e2x = T[o + 6] - ax, e2y = T[o + 7] - ay, e2z = T[o + 8] - az;
            const px = dir.y * e2z - dir.z * e2y;
            const py = dir.z * e2x - dir.x * e2z;
            const pz = dir.x * e2y - dir.y * e2x;
            const det = e1x * px + e1y * py + e1z * pz;
            if (det > -1e-8 && det < 1e-8) continue;      // parallel to the triangle
            const inv = 1 / det;
            const tx = origin.x - ax, ty = origin.y - ay, tz = origin.z - az;
            const u = (tx * px + ty * py + tz * pz) * inv;
            if (u < 0 || u > 1) continue;
            const qx = ty * e1z - tz * e1y;
            const qy = tz * e1x - tx * e1z;
            const qz = tx * e1y - ty * e1x;
            const vv = (dir.x * qx + dir.y * qy + dir.z * qz) * inv;
            if (vv < 0 || u + vv > 1) continue;
            const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
            if (d > 1e-4 && d < best) { best = d; found = true; }
          }
        }
      }
    }
    return found ? best : -1;
  }
}

/**
 * Which patches of standable ground are inside a building.
 *
 * The buildings on this map are hollow shells with nothing modelled in them —
 * no rooms, no floors, no fittings, just the mirrored backs of their own
 * facades — so ending up in one reads as falling out of the world rather than
 * as exploring. They are also not reliably closed at ground level: some
 * shopfronts have a sill low enough to jump, and once anything can carry a
 * body over one it lands in a white box it then has to find its way out of.
 *
 * The openings cannot be closed one at a time — they are gaps in a
 * photogrammetry mesh, not doors. So the interiors are identified instead, and
 * the test turns out to be a single question: **is there a ceiling above it?**
 *
 * Measured over the built core, that separates cleanly. Standing on the
 * navmap's own ground, a mesh ceiling overhead marks 10.4% of standable cells,
 * and rendering them gives the building footprints back exactly — shophouse
 * rows, tower blocks, the mall — with open street everywhere else. The four
 * interiors that had trapped the character all report one (12.9, 12.3, 36.5
 * and 43 units up) and every outdoor probe reports none, the underpass beneath
 * the flyover included: the navmap calls the DECK the ground there, so the
 * cell is classified up on the deck where the sky is open, and the road below
 * is a level the navmap has never heard of and this mask never marks.
 *
 * An earlier version flooded the map from the street and sealed whatever it
 * could not reach. It is not in here because it does not work at any
 * affordable resolution: walls on this map get down to 0.3 units and a grid
 * coarse enough to flood quickly steps straight through them, so the flood
 * "reached" the inside of the shophouses and sealed 197 cells instead of 1372.
 *
 * Ceilings closer than MIN_ROOF are left alone. Those are canopies, awnings
 * and covered walkways — 241 cells of them — and pavement you can stand under
 * is pavement, which is the same mistake the baked navmap made with tree
 * canopies and the reason its walkable bit could not be trusted.
 */
export class InteriorMask {
  /**
   * @param nav    the baked navmap, for ground height
   * @param solids MapColliders, for walls and ceilings
   * @param opts   {cell, bodyR, stepUp, bodyH, minRoof, bounds}
   */
  constructor(nav, solids, opts = {}) {
    const cell = opts.cell || 2.5;
    const R = opts.bodyR || 0.375;
    const STEP_UP = opts.stepUp || 0.93;
    const BODY_H = opts.bodyH || 2.7;
    /* A roof is a storey up. Below this it is a canopy and the ground under it
       is still ground. */
    const MIN_ROOF = opts.minRoof || 6;
    /* Clearance kept under the ceiling, so the ROOF of a building is free to
       stand on even though the room beneath it is not. */
    const ROOF_GAP = opts.roofGap || 1;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

    /* Bounded to the built-up core on purpose. The map plate is 826 x 1786
       units, but everything outside roughly x -140..160 / z -230..640 is
       terrain backdrop — fields and embankments, with no buildings in them. */
    const minX = opts.minX ?? -180, maxX = opts.maxX ?? 200;
    const minZ = opts.minZ ?? -320, maxZ = opts.maxZ ?? 740;
    const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
    const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    this.cell = cell; this.minX = minX; this.minZ = minZ; this.nx = nx; this.nz = nz;
    this.roofGap = ROOF_GAP;

    const N = nx * nz;
    const raw = new Uint8Array(N);
    this.bits = new Uint8Array(N);
    this.floorY = new Float32Array(N);
    this.roofY = new Float32Array(N);
    /* Kept so `inside` can ask the geometry a question the grid cannot answer;
       see the note there. */
    this.solids = solids;
    let ground = 0, roofed = 0, canopy = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = minX + i * cell, z = minZ + j * cell, k = j * nx + i;
        const top = nav.heightAt(x, z);
        if (top === null) continue;
        ground++;
        /* Deliberately NOT gated on the cell being standable. A cell whose
           centre happens to land inside a wall would otherwise be a hole in the
           mask, and at 2.5 units there are plenty of those in a narrow room —
           it is what left the tower on Pyay Road open when everything around it
           was sealed. A wall cell is blocked anyway, so marking it costs
           nothing. */
        const c = solids.ceilingOver(x, z, top + BODY_H);
        if (c === null) continue;
        if (c - top < MIN_ROOF) { canopy++; continue; }
        raw[k] = 1; this.floorY[k] = top; this.roofY[k] = c; roofed++;
      }
    }

    /* Erode by one cell. The marked region runs to the outer face of the
       building, and a cell straddling the facade would take a bite out of the
       pavement outside it — up to 1.25 units of a footpath that is not much
       wider than that. Keeping only cells whose four neighbours are also
       roofed pulls the mask back behind the wall, and the wall itself is
       already solid, so nothing is lost by leaving that ring unmarked. */
    let sealed = 0;
    for (let j = 1; j < nz - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (!raw[k]) continue;
        if (!raw[k - 1] || !raw[k + 1] || !raw[k - nx] || !raw[k + nx]) continue;
        this.bits[k] = 1; sealed++;
      }
    }
    this.groundCells = ground;
    this.roofedCells = roofed;
    this.sealedCells = sealed;
    this.canopyCells = canopy;
    this.bytes = N * 9;
    this.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  /** Is (x, z) at height `y` inside a building? */
  inside(x, z, y) {
    const i = ((x - this.minX) / this.cell) | 0;
    const j = ((z - this.minZ) / this.cell) | 0;
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
    const k = j * this.nx + i;
    if (!this.bits[k]) return false;
    if (y <= this.floorY[k] - 2) return false;
    if (y >= this.roofY[k] - this.roofGap) return false;
    /* The grid says "inside". Before believing it, ask the geometry.
     *
     * A cell is 2.5 units and carries ONE floor/ceiling pair, sampled at its
     * own corner. That is a fair description of a shophouse and a poor one of
     * a stepped roof, because the pair recorded for a cell can belong to a
     * different level of the roof than the point being tested — and the answer
     * it then gives is that the rooftop is a room.
     *
     * The tower on Pyay Road is the case. Its roof is a low hexagonal basin at
     * 174.5 inside a crown that rises to 191.9, so cells over the basin were
     * baked against the crown: the window ran to 175.1 and swallowed the floor
     * of the basin whole. You could Flash Step up there and then not take a
     * single step — 58 of the 123 cells of that rooftop, the entire middle of
     * it, answered "inside a building". It is what the roof reads as from the
     * air: a ledge around a hole.
     *
     * Standing on the highest surface of a column is never being inside
     * something, whatever the grid was baked against, so that is the test.
     * It costs a grid lookup and it is only ever reached for a body the cheap
     * test has already placed within a building's volume. */
    const top = this.solids ? this.solids.topAt(x, z) : null;
    if (top !== null && y > top - 0.5) return false;
    return true;
  }
}
