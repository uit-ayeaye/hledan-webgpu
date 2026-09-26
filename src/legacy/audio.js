/**
 * The junction, procedurally.
 *
 * Structure is lifted from the Elbaf showcase — one looping pink-noise buffer
 * feeding a few filtered layers, a handful of oscillators for the sustained
 * tones, and short one-shots off a voice budget — but the palette is different.
 * Elbaf is wind over an empty island. Hledan is four lanes of traffic under a
 * flyover, so the bed is engine roar and tyre hiss, the recurring event is a
 * horn rather than a gust, and the rain has somewhere to land.
 *
 * Nothing is sampled. Every sound here is arithmetic, which is why the whole
 * soundscape is a few kilobytes of source and no download at all.
 *
 * Two rules this file exists to keep:
 *   - it is OFF until asked. The AudioContext is not merely suspended at load,
 *     it is not constructed, so nothing can autoplay even if a browser would
 *     have let it.
 *   - it never blocks a frame. update() runs a fixed handful of setTargetAtTime
 *     calls; the proximity search that decides what you are standing next to is
 *     throttled to 4 Hz and looks at baked anchors, not the scene graph.
 */
import { ANCHORS } from './props.js';

const VOICES = { hi: 12, lo: 5 };          // concurrent one-shots

/**
 * Elbaf's impact dictionary, verbatim (`jr` in its bundle): the filter corner,
 * the length, the level and how far the corner sweeps down over that length,
 * plus an optional sine `thump` under the noise for the heavy ones.
 */
const IMPACT_SFX = {
  punch:   { lp: 1500, dur: .16, level: .5,  sweep: .4 },
  slash:   { lp: 4200, dur: .2,  level: .42, sweep: .25 },
  land:    { lp: 700,  dur: .26, level: .5,  sweep: .5,  thump: 90 },
  bazooka: { lp: 900,  dur: .5,  level: .8,  sweep: .3,  thump: 70 },
  gigant:  { lp: 520,  dur: .75, level: 1,   sweep: .25, thump: 48 },
  haki:    { lp: 340,  dur: 1.2, level: 1,   sweep: .2,  thump: 36 },
  zap:     { lp: 3000, dur: .3,  level: .5,  sweep: .3,  bell: 520 },
  /* Flash Step's two ends. `whoosh` is the departure — air, no metal, and a
     downward sweep so it reads as something leaving; `flash` is the arrival,
     which is a draw-cut, so it is short, bright and carries the blade's ring.
     Marking both ends is most of what makes a blink read as a blink: with only
     the landing the move had no attack at all, and the ear heard a hit with
     nothing before it. */
  whoosh:  { lp: 2600, dur: .16, level: .34, sweep: .18 },
  flash:   { lp: 5200, dur: .16, level: .5,  sweep: .3,  bell: 880 },
};

/**
 * How far a footstep is, in metres.
 *
 * Elbaf hard-codes 1.39, but that number is not arbitrary and copying it
 * blindly would desynchronise the sound from these legs: it is `1.3 * walkDur`
 * for a 1.07 s clip. Character computes the real figure from its own clip and
 * passes it in (see `strideM` there); this is only the fallback.
 */
const DEFAULT_STRIDE = 1.39;   // Elbaf's own figure, for a rig that has no clip

/** Elbaf's inverse-square-ish rolloff: silent past `far`, quadratic inside it. */
function rolloff(d2, far) {
  if (d2 > far * far) return 0;
  const k = 1 - Math.sqrt(d2) / far;
  return k * k;
}

/**
 * Pink-ish noise, looped. Voss-McCartney with four running poles — cheaper than
 * a proper filter bank and indistinguishable here.
 *
 * Three seconds, not two, because the buffer also has to be long enough for the
 * longest one-shot cut from it: thunder runs 2.4 s, and a 2 s buffer made the
 * random start offset negative, which throws outright rather than degrading.
 */
const NOISE_SECONDS = 3;

function pinkBuffer(ctx) {
  const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    a = 0.99765 * a + w * 0.0990;
    b = 0.96300 * b + w * 0.2965;
    c = 0.57000 * c + w * 1.0526;
    d[i] = (a + b + c + w * 0.1848) * 0.22;
  }
  return buf;
}

/** A looping noise layer: source -> lowpass -> [highpass] -> gain -> dest. */
function noiseLayer(ctx, buf, dest, { lp = 800, hp = 0, gain = 0.1 }) {
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass'; low.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(low);
  if (hp) {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass'; high.frequency.value = hp;
    low.connect(high); high.connect(g);
  } else {
    low.connect(g);
  }
  g.connect(dest);
  src.start();
  return { src, filt: low, gain: g };
}

function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

function nearest(list, x, z) {
  let best = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = dist2(x, z, list[i][0], list[i][2]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export class Soundscape {
  constructor(tier = 'hi') {
    this.tier = tier === 'lo' ? 'lo' : 'hi';
    this.enabled = false;
    this.ctx = null;
    this.nodes = null;
    this.master = 0.5;
    this.voices = 0;
    this._hornIn = 3 + Math.random() * 5;
    this._crowIn = 9 + Math.random() * 14;
    this._clinkIn = 2 + Math.random() * 4;
    this._probeIn = 0;
    this._near = { road: 999, tea: 999 };
    /* Metres travelled since the last footfall. Parked at a stride so the
       first step of a walk lands on the first frame of it. */
    this._stride = DEFAULT_STRIDE;
    this._rain = 0;               // last rain value seen, for wet footsteps
  }

  /**
   * Build the graph. Only ever called from a user gesture — see the rule at the
   * top of the file. Safe to call again; it resumes instead of rebuilding.
   */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;                       // faded up by setEnabled
    master.connect(ctx.destination);

    const noise = pinkBuffer(ctx);

    /* The bed. Traffic at this junction is a broadband roar with a lot of
       bottom in it, so the main layer is heavily lowpassed and a much quieter
       band up top carries the tyre hiss that makes it read as *moving*. */
    const roar = noiseLayer(ctx, noise, master, { lp: 360, gain: 0.075 });
    const hiss = this.tier === 'lo' ? null
      : noiseLayer(ctx, noise, master, { lp: 2600, hp: 900, gain: 0.012 });

    /* Crowd. Pavement chatter sits in a narrow mid band; slow wobble on the
       gain keeps it from turning into a hum. */
    const murmur = noiseLayer(ctx, noise, master, { lp: 900, hp: 300, gain: 0.0 });

    /* Rain gets two layers: hiss for the fall and a low wash for what it does
       to the road. Both ride the weather's own rain value. */
    const rainHiss = noiseLayer(ctx, noise, master, { lp: 7000, hp: 1500, gain: 0 });
    const rainLow = noiseLayer(ctx, noise, master, { lp: 500, gain: 0 });

    /* Diesel. Two saws a hair apart beat against each other at ~1.5 Hz, which
       is what gives an idling bus its lope. */
    const engGain = ctx.createGain(); engGain.gain.value = 0;
    const engFilt = ctx.createBiquadFilter();
    engFilt.type = 'lowpass'; engFilt.frequency.value = 190;
    engFilt.connect(engGain); engGain.connect(master);
    const engines = [61, 62.5, 91].slice(0, this.tier === 'lo' ? 2 : 3).map((hz) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = hz;
      o.connect(engFilt); o.start();
      return o;
    });

    this.nodes = { master, noise, roar, hiss, murmur, rainHiss, rainLow, engGain, engFilt, engines };
    if (ctx.state === 'suspended') ctx.resume();
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.enabled) this.start();
    if (!this.ctx || !this.nodes) return;
    const t = this.ctx.currentTime;
    this.nodes.master.gain.cancelScheduledValues(t);
    this.nodes.master.gain.setTargetAtTime(this.enabled ? this.master : 0, t, 0.12);
    if (this.enabled && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  /* ------------------------------------------------------------ one-shots */

  _budget() { return this.voices < VOICES[this.tier]; }

  /**
   * Filtered noise burst — used for thunder and for the wet slap of tyres.
   *
   * `delay` schedules it into the future on the audio clock rather than the
   * main loop's, which is what thunder needs: the clap is seconds behind the
   * light, and a setTimeout for it would jitter with the frame rate and drift
   * if the tab were throttled.
   */
  _burst(level, { lp = 1200, dur = 0.3, sweep = 0, delay = 0 }) {
    if (!this.ctx || !this.nodes || !this._budget() || level < 0.004) return;
    this.voices++;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.nodes.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(lp, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, lp * sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(f); f.connect(g); g.connect(this.nodes.master);
    src.onended = () => { this.voices--; };
    /* Clamp both ends. start() throws on a negative offset, so a one-shot longer
       than the buffer must not be allowed to compute one — belt as well as
       braces, since the buffer is now sized for the longest burst. */
    const room = Math.max(0, this.nodes.noise.duration - dur - 0.05);
    src.start(t, Math.random() * room, Math.min(dur + 0.05, this.nodes.noise.duration));
  }

  /**
   * A horn. Two partials a fifth apart with a hard attack and a flat body —
   * the cheap electric kind fitted to a bus, not a car chime. Detune and the
   * distance rolloff are what stop a dozen of them sounding like one horn.
   */
  _horn(level, hz, dur) {
    if (!this.ctx || !this.nodes || !this._budget() || level < 0.004) return;
    this.voices++;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.012);
    g.gain.setValueAtTime(level, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    g.connect(this.nodes.master);
    let last = null;
    for (const [mult, amp] of [[1, 1], [1.5, 0.55], [2.02, 0.22]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz * mult;
      const og = ctx.createGain(); og.gain.value = amp;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.03);
      last = o;
    }
    if (last) last.onended = () => { this.voices--; }; else this.voices--;
  }

  /** Glass on saucer, at a tea shop. Three inharmonic partials, very short. */
  _clink(level) {
    if (!this.ctx || !this.nodes || !this._budget() || level < 0.004) return;
    this.voices++;
    const ctx = this.ctx, t = ctx.currentTime;
    let last = null;
    const base = 1750 + Math.random() * 900;
    for (const [mult, amp, dur] of [[1, 1, 0.22], [2.41, 0.45, 0.15], [4.1, 0.2, 0.09]]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = base * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level * amp, t + 0.003);
      g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
      o.connect(g); g.connect(this.nodes.master);
      o.start(t); o.stop(t + dur + 0.02);
      last = o;
    }
    if (last) last.onended = () => { this.voices--; }; else this.voices--;
  }

  /** A crow. Yangon is full of them and they are the one bird you always hear. */
  _crow(level) {
    if (!this.ctx || !this.nodes || !this._budget() || level < 0.004) return;
    this.voices++;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(780 + Math.random() * 160, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.22);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 3.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 0.26);
    o.connect(f); f.connect(g); g.connect(this.nodes.master);
    o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + 0.3);
  }

  /**
   * A sine that drops a fifth and a bit as it decays — Elbaf's `w0`.
   *
   * This is the body under a heavy impact. The noise burst alone is a slap;
   * what makes a landing feel like weight is the low end arriving with it, and
   * a phone speaker that cannot reproduce 48 Hz still reproduces its envelope.
   */
  _thump(level, hz, dur) {
    if (!this.ctx || !this.nodes || !this._budget() || level < 0.004) return;
    this.voices++;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.4, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g); g.connect(this.nodes.master);
    o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + dur + 0.02);
  }

  /**
   * Thunder, at the distance it came from.
   *
   * It used to be one 2.4 s low-passed burst fired on the frame the sky lit up,
   * which is a lightning strike happening on top of you, every time. Real
   * thunder is late and it rolls: the crack arrives first and only if the bolt
   * is close, then the sound bounces off cloud base and terrain and comes back
   * as a couple of swells over several seconds.
   *
   * Three layers, staggered on the audio clock. Distance does three things at
   * once and they all matter: it delays everything by `metres / 343`, it takes
   * the level down, and it eats the top end — a near bolt is a whip-crack, a
   * far one is all rumble with no crack left in it. That last part is why the
   * crack's level is scaled by `near`, and why the low tier drops the third
   * layer rather than shortening the others; five concurrent voices is the
   * whole phone budget and the roll is what carries the sound.
   *
   * @param metres how far the bolt was
   * @param power  0..1, the bolt's own brightness
   */
  thunder(metres = 900, power = 1) {
    const travel = Math.max(0, metres) / 343;
    /* 1 up close, 0 by about three kilometres. */
    const near = Math.max(0, 1 - metres / 3000);
    const lvl = 0.5 * power * (0.35 + 0.65 * near);
    /* The crack: only really there for a close strike. */
    this._burst(lvl * 0.85 * near, {
      lp: 900 + 2600 * near, dur: 0.45 + 0.35 * near, sweep: 0.18, delay: travel,
    });
    /* The body, and the roll behind it. Each swell is darker and later than
       the last, which is the sound losing its top end to the trip. */
    this._burst(lvl, { lp: 210 + 180 * near, dur: 2.2, sweep: 0.3, delay: travel + 0.12 });
    if (this.tier === 'hi') {
      this._burst(lvl * 0.6, { lp: 140, dur: 2.4, sweep: 0.45, delay: travel + 1.5 });
    }
  }

  /* ------------------------------------------------------- the player */

  /**
   * Footfalls, and the thud at the end of a drop.
   *
   * Elbaf's stride model exactly: distance is accumulated, not time, so the
   * cadence follows the legs at every speed without a single timer — walk,
   * sprint and the slow-motion bite of a hit stop all come out right because
   * they are all just metres travelled. Standing still parks the accumulator
   * ON the threshold rather than at zero, so the first step lands the instant
   * you move instead of half a stride later.
   *
   * @param dt   seconds, real clock
   * @param mo   {speed, grounded, landing, stride} — speed and landing in
   *             metres/s, stride in metres (Character.strideM)
   */
  player(dt, mo) {
    if (!this.enabled || !this.ctx || !this.nodes) return;
    const a = Math.min(dt, 0.05);
    const speed = mo.speed || 0;
    const stride = mo.stride || DEFAULT_STRIDE;

    if (mo.grounded && speed > 0.4) {
      this._stride += speed * a;
      if (this._stride >= stride) {
        this._stride = 0;
        /* Wet tarmac is brighter and shorter — the corner opens and the tail
           clips. Same burst, different room. */
        const wet = this._rain;
        this._burst(0.05 + Math.min(0.05, speed * 0.008), {
          lp: (1800 + Math.random() * 900) * (1 + wet * 0.5),
          dur: 0.11 * (1 - wet * 0.25),
          sweep: 0.35,
        });
        if (wet > 0.25) this._burst(0.02 * wet, { lp: 5200, dur: 0.05, sweep: 0.6 });
      }
    } else {
      this._stride = stride;
    }

    /* The landing. `landing` is the fall speed on the frame the feet touch,
       so it is non-zero for exactly one frame and needs no edge detection. */
    const fall = mo.landing || 0;
    if (fall > 2.5) {
      const k = Math.min(1, fall / 16);
      const s = IMPACT_SFX.land;
      this._burst(s.level * (0.25 + 0.6 * k), { lp: s.lp, dur: s.dur, sweep: s.sweep });
      this._thump(s.level * 0.5 * (0.3 + 0.7 * k), s.thump, s.dur * 1.4);
    }
  }

  /**
   * One combat impact, attenuated by how far it landed from the listener.
   *
   * Called from the effect spawner rather than polled, so a move that fires
   * three hits gets three sounds with the right spacing for free.
   */
  impact(x, y, z, power, kind, view) {
    if (!this.enabled || !this.ctx || !this.nodes) return;
    const s = IMPACT_SFX[kind] || IMPACT_SFX.punch;
    const dx = x - view.x, dy = y - view.y, dz = z - view.z;
    const k = rolloff(dx * dx + dy * dy + dz * dz, kind === 'haki' ? 160 : 90);
    if (k <= 0) return;
    this._burst(s.level * k * (0.5 + 0.5 * power), {
      lp: s.lp * (0.35 + 0.65 * k), dur: s.dur, sweep: s.sweep,
    });
    if (s.thump) this._thump(s.level * k * 0.5, s.thump, s.dur * 1.4);
    if (s.bell) this._clink(0.16 * k);
  }

  /* --------------------------------------------------------------- update */

  /**
   * @param view {x, z}         where the listener is
   * @param w    {rain, flash, traffic}  straight off the weather. `traffic`
   *             scales the whole road bed: the junction at three in the morning
   *             is the same place with the volume down, and during a blackout
   *             it is quieter still.
   */
  update(dt, view, w) {
    if (!this.enabled || !this.ctx || !this.nodes || this.ctx.state !== 'running') return;
    const n = this.nodes, t = this.ctx.currentTime;
    const rain = w.rain || 0;
    this._rain = rain;                  // footsteps read this for the wet variant
    const traf = w.traffic === undefined ? 1 : w.traffic;

    /* Proximity at 4 Hz. Every layer below reads these, and a full pass over
       the anchor lists every frame would be the most expensive thing here. */
    this._probeIn -= dt;
    if (this._probeIn <= 0) {
      this._probeIn = 0.25;
      const road = Math.min(nearest(ANCHORS.BUS, view.x, view.z), nearest(ANCHORS.TAXI, view.x, view.z));
      this._near.road = road;
      this._near.tea = Math.min(nearest(ANCHORS.TEA, view.x, view.z), nearest(ANCHORS.STALL, view.x, view.z));
    }
    const roadNear = Math.max(0, 1 - this._near.road / 90) * traf;
    const teaNear = Math.max(0, 1 - this._near.tea / 34);

    /* Slow, irrational wobble so the bed never settles into a loop the ear can
       find. Two sines whose periods do not divide each other. */
    const wob = 0.5 + 0.5 * Math.sin(t * 0.093) * Math.cos(t * 0.041);

    n.roar.gain.gain.setTargetAtTime(0.030 + 0.075 * roadNear + 0.020 * wob, t, 0.6);
    n.roar.filt.frequency.setTargetAtTime(260 + 240 * roadNear + 90 * wob, t, 0.7);
    if (n.hiss) n.hiss.gain.gain.setTargetAtTime((0.004 + 0.020 * roadNear) * (1 - rain * 0.5), t, 0.5);
    n.murmur.gain.gain.setTargetAtTime((0.006 + 0.030 * teaNear) * (0.5 + 0.5 * wob) * (1 - rain * 0.6), t, 0.8);
    n.engGain.gain.setTargetAtTime(0.020 * roadNear * roadNear, t, 1.0);

    n.rainHiss.gain.gain.setTargetAtTime(rain * 0.055, t, 0.9);
    n.rainLow.gain.gain.setTargetAtTime(rain * 0.030, t, 0.9);

    /* Thunder comes off the strike itself, which carries the bolt's distance.
       It used to edge-detect `flash` — and `flash` now flickers with the drawn
       bolt's return strokes, so every flicker would have been another clap. */
    const strike = w.strike || 0;
    if (strike > 0) this.thunder(strike, 0.65 + Math.random() * 0.45);

    // horns: constant near the carriageway, rare away from it
    this._hornIn -= dt;
    if (this._hornIn <= 0) {
      // horns thin right out once the buses stop running
      this._hornIn = (1.4 + Math.random() * 4.5) / (0.25 + roadNear) / Math.max(0.25, traf);
      const lvl = (0.020 + 0.055 * roadNear) * (0.6 + Math.random() * 0.6);
      this._horn(lvl, 300 + Math.random() * 210, 0.16 + Math.random() * 0.4);
    }

    this._clinkIn -= dt;
    if (this._clinkIn <= 0) {
      this._clinkIn = 1.2 + Math.random() * 5;
      if (teaNear > 0.15) this._clink(0.020 * teaNear * (0.6 + Math.random() * 0.7));
    }

    this._crowIn -= dt;
    if (this._crowIn <= 0) {
      this._crowIn = 7 + Math.random() * 20;
      if (rain < 0.4 && traf > 0.4) this._crow(0.016 * (0.5 + Math.random() * 0.8));
    }
  }

  dispose() {
    if (!this.ctx) return;
    try { this.ctx.close(); } catch (e) { /* already gone */ }
    this.ctx = null; this.nodes = null;
  }
}
