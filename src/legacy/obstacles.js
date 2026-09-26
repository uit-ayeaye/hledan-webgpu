/**
 * Solid footprints for the things that were added on top of the map.
 *
 * The navmap is baked from the GLB, so it knows about buildings and kerbs and
 * nothing else. Every bus, tea shop and utility pole placed by props.js was
 * therefore walk-through: you could stroll out of a lane and end up standing
 * inside a bus, which reads as a bug long before anyone thinks about it as
 * physics.
 *
 * This is deliberately not a physics engine. Each prop is one axis-aligned
 * rectangle in XZ — buses and cars get their real footprint rotated to the
 * road's heading, pavement props get a square — bucketed into a uniform grid so
 * a query touches a handful of candidates rather than all ~350. One test costs
 * a couple of microseconds, which matters: the controller calls it about twenty
 * times a frame while resolving movement.
 *
 * Height is *not* ignored, though it is only a band rather than a real third
 * axis. This map has a flyover: a bus parked on the lower road sits ~18 units
 * beneath the deck that runs over it, and a purely 2D footprint stopped the
 * player up on the deck against a vehicle they could not see. Each box
 * therefore carries its own ground height and only bites when the body is
 * within roughly its own height of it.
 */

const CELL = 12;                  // map units; a bus is ~17 long, so 1-2 cells

export class ObstacleField {
  constructor() {
    this.boxes = [];              // {cx, cz, hx, hz, cos, sin}
    this.cells = new Map();
    this.minX = 0; this.minZ = 0; this.nx = 1; this.nz = 1;
    this._built = false;
  }

  /**
   * @param rows   anchor rows: [x, y, z] or [x, y, z, yaw]
   * @param w      footprint width in map units (across the vehicle)
   * @param l      footprint length in map units (along it)
   * @param height how far above its own anchor the thing reaches, in map units.
   *               A body outside that band passes over or under it.
   * @param inset  shrink both axes by this fraction — a body should be able to
   *               brush past a bus without being stopped a metre short of it
   */
  add(rows, w, l, height, inset = 0.88) {
    for (const r of rows) {
      const yaw = r.length > 3 ? r[3] : 0;
      this.boxes.push({
        cx: r[0], cz: r[2], cy: r[1],
        hx: (w * inset) / 2, hz: (l * inset) / 2, hy: height,
        cos: Math.cos(yaw), sin: Math.sin(yaw),
      });
    }
    this._built = false;
  }

  /** Bucket the boxes once every add() is done. */
  build() {
    if (!this.boxes.length) { this._built = true; return this; }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const b of this.boxes) {
      const reach = Math.hypot(b.hx, b.hz);       // rotation-proof bound
      minX = Math.min(minX, b.cx - reach); maxX = Math.max(maxX, b.cx + reach);
      minZ = Math.min(minZ, b.cz - reach); maxZ = Math.max(maxZ, b.cz + reach);
    }
    this.minX = minX; this.minZ = minZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1);
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / CELL) + 1);
    this.cells.clear();
    this.boxes.forEach((b, i) => {
      const reach = Math.hypot(b.hx, b.hz);
      const x0 = this._cx(b.cx - reach), x1 = this._cx(b.cx + reach);
      const z0 = this._cz(b.cz - reach), z1 = this._cz(b.cz + reach);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = cz * this.nx + cx;
          let list = this.cells.get(k);
          if (!list) { list = []; this.cells.set(k, list); }
          list.push(i);
        }
      }
    });
    this._built = true;
    return this;
  }

  _cx(x) { return Math.min(this.nx - 1, Math.max(0, ((x - this.minX) / CELL) | 0)); }
  _cz(z) { return Math.min(this.nz - 1, Math.max(0, ((z - this.minZ) / CELL) | 0)); }

  /**
   * Does a body of radius `r` and height `h` standing at (x, z, y) overlap
   * anything? Pass `y` as null to ignore height entirely.
   *
   * The circle is tested against each box in the box's own frame, which turns a
   * rotated-rectangle-vs-circle test into an axis-aligned one: rotate the
   * offset by -yaw, clamp it to the half extents, and compare the distance to
   * the nearest point against the radius.
   */
  blocked(x, z, r, y = null, h = 0) {
    if (!this._built || !this.boxes.length) return false;
    const list = this.cells.get(this._cz(z) * this.nx + this._cx(x));
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const b = this.boxes[list[i]];
      /* Feet below the roof and head above the floor. Without this a bus on the
         lower road blocks the flyover deck eighteen units over its roof.
         The head is the BODY's height, not the box's: standing that in for it
         made a 12-unit utility pole reach twelve units DOWNWARD as well, which
         is the same kind of blocking-in-mid-air the mesh colliders exist to
         stop. `h` defaults to the box's own height only so a caller that has
         not been updated keeps the behaviour it was written against. */
      const head = h || b.hy;
      if (y !== null && (y > b.cy + b.hy || y + head < b.cy)) continue;
      const dx = x - b.cx, dz = z - b.cz;
      const lx = dx * b.cos + dz * b.sin;         // into the box's frame
      const lz = -dx * b.sin + dz * b.cos;
      const qx = Math.max(-b.hx, Math.min(b.hx, lx)) - lx;
      const qz = Math.max(-b.hz, Math.min(b.hz, lz)) - lz;
      if (qx * qx + qz * qz < r * r) return true;
    }
    return false;
  }

  get count() { return this.boxes.length; }
}
