export const DEFAULTS = {
  quality: "high",
  hour: 17.25,
  rain: 0,
  haze: 0.25,
  exposure: 1,
  bloom: true,
  ao: true,
  reflections: true,
  traffic: true,
  adaptive: true,
  daycycle: false,
  preset: "golden",
};
export const PRESETS = {
  dawn: { hour: 6.5, rain: 0, haze: 0.45, label: "FIRST LIGHT" },
  clear: { hour: 12.5, rain: 0, haze: 0.15, label: "YANGON NOON" },
  blue: { hour: 18.4, rain: 0.22, haze: 0.25, label: "BLUE HOUR" },
  golden: { hour: 17.25, rain: 0, haze: 0.25, label: "GOLDEN HOUR" },
  monsoon: { hour: 15.5, rain: 0.95, haze: 0.55, label: "MONSOON AFTERNOON" },
  night: { hour: 20.5, rain: 0.45, haze: 0.3, label: "AFTER DARK" },
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
  for (const key of [
    "bloom",
    "ao",
    "reflections",
    "traffic",
    "adaptive",
    "daycycle",
  ])
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
      JSON.parse(localStorage.getItem("hledan-settings-v2")),
    );
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem("hledan-settings-v2", JSON.stringify(s));
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

export function skyForHour(hour, rain) {
  if (hour < 5.4 || hour >= 19.2) return "night";
  if (rain > 0.6) return "monsoon";
  if (hour < 7.5) return "dawn";
  if (hour < 15.8) return "clear";
  if (hour < 18) return "golden";
  return "blue";
}
