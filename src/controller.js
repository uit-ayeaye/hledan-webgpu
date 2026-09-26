import { Vector3, Euler, MathUtils } from "three/webgpu";
const EYE = 2.55,
  RADIUS = 0.48,
  STEP = 0.65;
export class Explorer {
  constructor(camera, canvas, solids, props, sound) {
    Object.assign(this, { camera, canvas, solids, props, sound });
    this.mode = "orbit";
    this.dragging = false;
    canvas.tabIndex = 0;
    this.keys = new Set();
    this.velocity = new Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.vy = 0;
    this.stepTime = 0;
    this.body = camera.position.clone();
    this.previous = this.body.clone();
    this.accumulator = 0;
    this.eyeOffset = 0;
    document.addEventListener("keydown", (e) => {
      if (
        /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) ||
        e.target.isContentEditable ||
        e.target.closest?.("dialog")
      )
        return;
      this.keys.add(e.code);
      if (
        this.mode !== "orbit" &&
        ["Space", "ArrowUp", "ArrowDown"].includes(e.code)
      )
        e.preventDefault();
    });
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    const release = () => {
      this.keys.clear();
      this.dragging = false;
      this.velocity.set(0, 0, 0);
      this.accumulator = 0;
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    document.addEventListener("pointerlockchange", () => {
      document.body.classList.toggle("locked", !!document.pointerLockElement);
      if (!document.pointerLockElement) this.keys.clear();
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas && !this.dragging) return;
      this.yaw -= e.movementX * 0.002;
      this.pitch = MathUtils.clamp(
        this.pitch - e.movementY * 0.002,
        -1.45,
        1.45,
      );
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (this.mode === "orbit") return;
      this.dragging = true;
      canvas.focus();
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointerup", () => (this.dragging = false));
    canvas.addEventListener("pointercancel", () => (this.dragging = false));
    canvas.addEventListener("click", () => {
      if (this.mode !== "orbit") this.capture();
    });
  }
  capture() {
    this.canvas.focus();
    this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }
  setMode(mode, spawn = true) {
    this.mode = mode;
    this.body.copy(this.camera.position);
    this.previous.copy(this.body);
    this.accumulator = 0;
    this.eyeOffset = 0;
    this.velocity.set(0, 0, 0);
    this.vy = 0;
    this.keys.clear();
    if (mode === "orbit") {
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (mode === "walk" && spawn) {
      const p = this.camera.position;
      const floor = this.solids.floorUnder(p.x, p.z, p.y);
      if (floor !== null && !this.blocked(p.x, p.z, floor))
        this.teleport(p.x, floor, p.z);
      else this.teleport(-46, 43.5, 262);
    }
    const e = new Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = e.y;
    this.pitch = e.x;
  }
  teleport(x, y, z) {
    const f = this.solids.floorUnder(x, z, y + 3);
    this.camera.position.set(x, (f ?? y) + EYE, z);
    this.body.copy(this.camera.position);
    this.previous.copy(this.body);
    this.eyeOffset = 0;
    this.accumulator = 0;
    this.vy = 0;
  }
  blocked(x, z, feet) {
    return (
      this.solids.blocked(x, z, RADIUS, feet + STEP, feet + EYE) ||
      this.props.obstacles?.blocked?.(x, z, RADIUS, feet, EYE) ||
      this.traffic?.blocked(x, z, RADIUS, feet)
    );
  }
  update(dt) {
    if (this.mode === "orbit") return;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    if (
      document.pointerLockElement !== this.canvas &&
      document.activeElement !== this.canvas
    )
      this.keys.clear();
    // Bounded fixed simulation ticks make collision and acceleration independent of FPS.
    const tick = 1 / 90;
    this.accumulator += Math.min(Math.max(dt, 0), 0.1);
    while (this.accumulator >= tick) {
      this.previous.copy(this.body);
      this.simulate(tick);
      this.accumulator -= tick;
    }
    this.accumulator = Math.max(0, this.accumulator);
    this.eyeOffset = MathUtils.damp(this.eyeOffset, 0, 18, dt);
    this.camera.position.lerpVectors(
      this.previous,
      this.body,
      this.accumulator / tick,
    );
    this.camera.position.y += this.eyeOffset;
  }
  simulate(dt) {
    const k = this.keys,
      sprint = k.has("ShiftLeft") || k.has("ShiftRight");
    let ax = Number(k.has("KeyD")) - Number(k.has("KeyA")),
      az = Number(k.has("KeyS")) - Number(k.has("KeyW"));
    const len = Math.hypot(ax, az) || 1;
    ax /= len;
    az /= len;
    const speed =
      this.mode === "fly" ? (sprint ? 130 : 42) : sprint ? 10.5 : 5.8;
    const tx = (ax * Math.cos(this.yaw) + az * Math.sin(this.yaw)) * speed,
      tz = (-ax * Math.sin(this.yaw) + az * Math.cos(this.yaw)) * speed;
    this.velocity.x = MathUtils.damp(this.velocity.x, tx, 12, dt);
    this.velocity.z = MathUtils.damp(this.velocity.z, tz, 12, dt);
    const p = this.body;
    if (this.mode === "fly") {
      p.x += this.velocity.x * dt;
      p.z += this.velocity.z * dt;
      p.y += (Number(k.has("Space")) - Number(k.has("KeyC"))) * speed * dt;
      p.y = MathUtils.clamp(p.y, 46, 900);
      return;
    }
    let feet = p.y - EYE;
    const steps = Math.max(
      1,
      Math.ceil(
        (Math.hypot(this.velocity.x, this.velocity.z) * dt) / (RADIUS * 0.5),
      ),
    );
    for (let i = 0; i < steps; i++) {
      const nx = p.x + (this.velocity.x * dt) / steps,
        nz = p.z + (this.velocity.z * dt) / steps;
      if (!this.blocked(nx, p.z, feet)) p.x = nx;
      else this.velocity.x = 0;
      if (!this.blocked(p.x, nz, feet)) p.z = nz;
      else this.velocity.z = 0;
    }
    if (k.has("Space") && this.grounded) {
      this.vy = 9;
      this.grounded = false;
      k.delete("Space");
    }
    this.vy -= 27 * dt;
    let next = feet + this.vy * dt;
    const floor = this.solids.floorUnder(
      p.x,
      p.z,
      feet + (this.vy <= 0 ? STEP : 0),
    );
    if (floor !== null && next <= floor && this.vy <= 0) {
      if (this.grounded && floor > feet && floor - feet <= STEP)
        this.eyeOffset -= floor - feet;
      next = floor;
      this.vy = 0;
      this.grounded = true;
    } else this.grounded = false;
    const ceiling = this.solids.ceilingOver(p.x, p.z, feet + 0.15);
    if (this.vy > 0 && ceiling !== null && next + EYE > ceiling) {
      next = ceiling - EYE - 0.03;
      this.vy = 0;
    }
    p.y = next + EYE;
    if (p.y < 10 || Math.abs(p.x) > 1000 || p.z < -1100 || p.z > 1400)
      this.teleport(-46, 43.5, 262);
    this.sound.player(dt, {
      speed: Math.hypot(this.velocity.x, this.velocity.z) / 1.5,
      grounded: this.grounded,
    });
  }
}
