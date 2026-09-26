// Shadow maps can be reused between updates; the main image still renders every frame.
// Cap at 30 Hz in Ultra and 20 Hz in High. Refresh immediately when a sun setting changes.
export class ShadowBudget {
  constructor() {
    this.age = Infinity;
    this.key = "";
    this.updates = 0;
  }
  update(dt, settings, frozen = false) {
    this.age += dt;
    const key = `${settings.quality}:${Math.round(settings.hour * 100)}:${Math.round(settings.rain * 100)}`;
    const interval = frozen
      ? Infinity
      : 1 /
        (settings.quality === "ultra"
          ? 30
          : settings.quality === "high"
            ? 20
            : 12);
    if (key !== this.key || this.age >= interval) {
      this.key = key;
      this.age = 0;
      this.updates++;
      return true;
    }
    return false;
  }
  invalidate() {
    this.key = "";
  }
}
