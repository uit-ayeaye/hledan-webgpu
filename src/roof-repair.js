import { BufferAttribute, ShapeUtils, Vector2 } from "three/webgpu";

// The source Pacific Tower caps contain overlapping fan triangles. Rebuild only
// their planar interiors from the existing boundary; preserve facade and UV seams.
export function repairPacificRoof(root) {
  const mesh = root.getObjectByName("Buildings");
  if (!mesh?.geometry.index)
    throw new Error("Pacific roof repair: expected indexed Buildings mesh");
  const source = mesh.geometry,
    p = source.attributes.position,
    index = source.index;
  const removed = new Set(),
    patches = [];
  for (const height of [101.43022, 102.31678]) {
    const edges = new Map(),
      vertices = new Map();
    const key = (i) =>
      [p.getX(i), p.getZ(i)].map((v) => Math.round(v * 1000)).join(",");
    let count = 0;
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (
        !ids.every(
          (j) =>
            Math.abs(p.getY(j) - height) < 0.001 &&
            p.getX(j) > -170 &&
            p.getX(j) < -65 &&
            p.getZ(j) > 260 &&
            p.getZ(j) < 360,
        )
      )
        continue;
      count++;
      removed.add(i);
      for (let j = 0; j < 3; j++) {
        const a = key(ids[j]),
          b = key(ids[(j + 1) % 3]),
          edge = [a, b].sort().join("|");
        vertices.set(a, ids[j]);
        const record = edges.get(edge) ?? { a, b, count: 0 };
        record.count++;
        edges.set(edge, record);
      }
    }
    if (!count) throw new Error("Pacific roof repair: source cap not found");
    const adjacent = new Map();
    for (const e of edges.values())
      if (e.count === 1) {
        for (const [a, b] of [
          [e.a, e.b],
          [e.b, e.a],
        ]) {
          if (!adjacent.has(a)) adjacent.set(a, []);
          adjacent.get(a).push(b);
        }
      }
    if ([...adjacent.values()].some((v) => v.length !== 2))
      throw new Error("Pacific roof repair: non-manifold outline");
    const first = adjacent.keys().next().value,
      boundary = [];
    let current = first,
      previous = null;
    do {
      boundary.push(vertices.get(current));
      const next = adjacent.get(current).find((v) => v !== previous);
      previous = current;
      current = next;
      if (boundary.length > adjacent.size)
        throw new Error("Pacific roof repair: open outline");
    } while (current !== first);
    if (boundary.length !== adjacent.size)
      throw new Error("Pacific roof repair: unexpected multiple outlines");
    const contour = boundary.map((i) => new Vector2(p.getX(i), p.getZ(i)));
    patches.push({
      boundary,
      triangles: ShapeUtils.triangulateShape(contour, []),
      height,
      originalTriangles: count,
    });
  }
  const g = source.clone(),
    arrays = {};
  for (const [name, a] of Object.entries(source.attributes)) {
    const data = [];
    for (let i = 0; i < a.count; i++)
      for (let j = 0; j < a.itemSize; j++) data.push(a.getComponent(i, j));
    arrays[name] = data;
  }
  const indices = [];
  for (let i = 0; i < index.count; i += 3)
    if (!removed.has(i))
      indices.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  let cursor = p.count;
  for (const patch of patches) {
    const offset = cursor;
    for (const vertex of patch.boundary) {
      for (const [name, a] of Object.entries(source.attributes))
        for (let j = 0; j < a.itemSize; j++)
          arrays[name].push(
            name === "normal"
              ? j === 1
                ? 1
                : 0
              : name === "position" && j === 1
                ? patch.height
                : a.getComponent(vertex, j),
          );
      cursor++;
    }
    for (const tri of patch.triangles) {
      const ids = tri.map((i) => patch.boundary[i]);
      const cross =
        (p.getZ(ids[1]) - p.getZ(ids[0])) * (p.getX(ids[2]) - p.getX(ids[0])) -
        (p.getX(ids[1]) - p.getX(ids[0])) * (p.getZ(ids[2]) - p.getZ(ids[0]));
      const ordered = cross > 0 ? tri : [tri[0], tri[2], tri[1]];
      indices.push(...ordered.map((i) => offset + i));
    }
  }
  for (const [name, a] of Object.entries(source.attributes))
    g.setAttribute(
      name,
      new BufferAttribute(new Float32Array(arrays[name]), a.itemSize),
    );
  g.setIndex(indices);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  mesh.geometry = g;
  return patches.map((p) => ({
    height: p.height,
    before: p.originalTriangles,
    after: p.triangles.length,
  }));
}
