import * as THREE from "three/webgpu";
export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.spline = new THREE.CatmullRomCurve3([
      new THREE.Vector3(105, 58, -150),
      new THREE.Vector3(72, 61.8, -30),
      new THREE.Vector3(42, 61.73, 80),
      new THREE.Vector3(10, 61.73, 200),
      new THREE.Vector3(-17, 61.73, 320),
      new THREE.Vector3(-24, 61.73, 405),
      new THREE.Vector3(-7, 61.73, 505),
      new THREE.Vector3(18, 58, 610),
    ]);
    this.length = this.spline.getLength();
    this.p = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
  }
  add(loaded, type) {
    const total = type === "bus" ? 4 : 14;
    for (let i = 0; i < total; i++) {
      const mat =
        loaded.material?.clone() ??
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          color: type === "bus" ? 0x246faa : 0xded9cc,
          roughness: 0.35,
          metalness: 0.15,
        });
      const mesh = new THREE.Mesh(loaded.geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.cars.push({
        mesh,
        u: 0,
        dir: this.cars.length % 2 ? 1 : -1,
        speed: 12,
        type,
      });
    }
    // Same lane speed and evenly staggered slots prevent vehicles overtaking
    // through one another. This is kinematic traffic, not a rigid-body solver.
    for (let i = 0; i < this.cars.length; i++)
      this.cars[i].u =
        (Math.floor(i / 2) + 0.4) / Math.ceil(this.cars.length / 2);
  }
  update(dt, on, player) {
    for (const car of this.cars) {
      if (on) {
        let stop = this.cars.some(
          (other) =>
            other !== car &&
            other.dir === car.dir &&
            (((other.u - car.u) * car.dir + 1) % 1) * this.length < 25,
        );
        if (player && Math.abs(player.y - car.mesh.position.y) < 6) {
          const dx = player.x - car.mesh.position.x,
            dz = player.z - car.mesh.position.z;
          const forward =
            dx * Math.sin(car.mesh.rotation.y) +
            dz * Math.cos(car.mesh.rotation.y);
          const lateral = Math.abs(
            dx * Math.cos(car.mesh.rotation.y) -
              dz * Math.sin(car.mesh.rotation.y),
          );
          stop = forward > 0 && forward < 22 && lateral < 4;
        }
        if (!stop)
          car.u = (car.u + ((dt * car.speed) / this.length) * car.dir + 1) % 1;
      }
      this.spline.getPointAt(car.u, this.p);
      this.spline.getTangentAt(car.u, this.tangent);
      const lane = 6 * car.dir;
      car.mesh.position.copy(this.p);
      car.mesh.position.x += this.tangent.z * lane;
      car.mesh.position.z -= this.tangent.x * lane;
      car.mesh.rotation.y = Math.atan2(
        this.tangent.x * car.dir,
        this.tangent.z * car.dir,
      );
    }
  }
  blocked(x, z, r, feet) {
    for (const c of this.cars) {
      const p = c.mesh.position;
      if (feet > p.y + 5 || feet + 2.55 < p.y) continue;
      const dx = x - p.x,
        dz = z - p.z,
        a = c.mesh.rotation.y,
        lx = dx * Math.cos(a) - dz * Math.sin(a),
        lz = dx * Math.sin(a) + dz * Math.cos(a);
      if (
        Math.abs(lx) < (c.type === "bus" ? 1.9 : 1.4) + r &&
        Math.abs(lz) < (c.type === "bus" ? 8.7 : 3.3) + r
      )
        return true;
    }
    return false;
  }
}
