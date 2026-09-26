export const DEFAULTS = {
  quality: "high",
  hour: 17.25,
  rain: 0,
  haze: 0.25,
  exposure: 1,
  bloom: true,
  ao: true,
  traffic: true,
  adaptive: true,
  daycycle: false,
  preset: "golden",
};
export const PRESETS = {
  dawn: { hour: 6.2, rain: 0, haze: 0.45, label: "FIRST LIGHT" },
  golden: { hour: 17.25, rain: 0, haze: 0.25, label: "GOLDEN HOUR" },
  monsoon: { hour: 15.5, rain: 0.85, haze: 0.7, label: "MONSOON AFTERNOON" },
  night: { hour: 20.5, rain: 0.12, haze: 0.3, label: "AFTER DARK" },
};
export function sanitizeSettings(data) {
  const s = { ...DEFAULTS };
  if (!data || typeof data !== "object") return s;
  for (const [key, min, max] of [
    ["hour", 0, 24],
    ["rain", 0, 1],
    ["haze", 0, 1],
    ["exposure", 0.4, 1.6],
  ])
    if (Number.isFinite(data[key]))
      s[key] = Math.max(min, Math.min(max, data[key]));
  for (const key of ["bloom", "ao", "traffic", "adaptive", "daycycle"])
    if (typeof data[key] === "boolean") s[key] = data[key];
  if (["balanced", "high", "ultra"].includes(data.quality))
    s.quality = data.quality;
  if (
    typeof data.preset === "string" &&
    (Object.hasOwn(PRESETS, data.preset) || data.preset === "custom")
  )
    s.preset = data.preset;
  return s;
}
export function loadSettings() {
  try {
    return sanitizeSettings(
      JSON.parse(localStorage.getItem("hledan-settings-v1")),
    );
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem("hledan-settings-v1", JSON.stringify(s));
  } catch {
    /* Private browsing may disallow persistence. */
  }
}
export function clockLabel(hour) {
  const m = Math.round((hour % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function moveTowards(value, target, speed, dt) {
  return value + (target - value) * (1 - Math.exp(-speed * dt));
}
