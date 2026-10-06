export class Audio {
  constructor() {
    this.ctx = null;
    this.master = 0.65;
    this.music = 0.35;
    this.notes = 0;
    this.beat = 0;
    this.events = {};
    this.active = true;
  }
  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.master;
      this.out.connect(this.ctx.destination);
    }
    await this.ctx.resume();
  }
  tone(freq, duration = 0.2, type = "sine", volume = 0.15, slide = 0) {
    if (!this.ctx || !this.active || this.simulating) return;
    const t = this.ctx.currentTime,
      osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + duration);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.002, volume), t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
  noise(duration = 0.5, volume = 0.15) {
    if (!this.ctx || !this.active || this.simulating) return;
    const sr = this.ctx.sampleRate,
      buf = this.ctx.createBuffer(1, sr * duration, sr),
      d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(),
      filter = this.ctx.createBiquadFilter(),
      gain = this.ctx.createGain();
    s.buffer = buf;
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    gain.gain.value = volume;
    s.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    s.start();
  }
  sfx(name) {
    this.events[name] = (this.events[name] || 0) + 1;
    switch (name) {
      case "inhale":
        this.noise(1, 0.1);
        break;
      case "exhale":
        this.noise(1.3, 0.2);
        break;
      case "clear":
        this.tone(880, 0.16, "sine", 0.12, 1500);
        break;
      case "damage":
        this.tone(110, 0.28, "triangle", 0.18, 60);
        break;
      case "jump":
        this.tone(300, 0.16, "sine", 0.08, 550);
        break;
      case "reward":
        this.tone(660, 0.4, "sine", 0.14);
        this.tone(990, 0.5, "sine", 0.1);
        break;
      case "crash":
        this.tone(220, 0.7, "triangle", 0.1, 70);
        break;
      case "portal":
        this.tone(200, 1.2, "sine", 0.15, 900);
        break;
      case "ending":
        for (const f of [261.6, 329.6, 392, 523.2])
          this.tone(f, 2, "sine", 0.07);
        break;
      case "click":
        this.tone(700, 0.06, "sine", 0.06);
        break;
      case "checkpoint":
        this.tone(523, 0.2, "sine", 0.1);
        break;
    }
  }
  update(dt, stage, bpm, mode) {
    if (!this.ctx || !this.active) return;
    this.notes += dt;
    this.beat += dt;
    if (this.notes > 1.8) {
      this.notes = 0;
      const notes =
        stage === "BRAIN" ? [220, 277, 330, 440] : [196, 246.94, 293.66, 392];
      const f = notes[Math.floor(this.ctx.currentTime / 1.8) % notes.length];
      this.tone(
        mode === "crash" ? f / 2 : f,
        2.4,
        "sine",
        this.music * (mode === "crash" ? 0.045 : 0.09),
      );
      if (mode === "rush") this.tone(f * 2, 0.6, "sine", this.music * 0.07);
    }
    if (stage === "HEART" && this.beat > 60 / bpm) {
      this.beat = 0;
      this.tone(65, 0.15, "sine", 0.22, 38);
      this.events.heartbeat = (this.events.heartbeat || 0) + 1;
    }
  }
  set(master, music) {
    this.master = master;
    this.music = music;
    if (this.out)
      this.out.gain.setTargetAtTime(master, this.ctx.currentTime, 0.05);
  }
  pause(value) {
    this.active = !value;
    if (this.ctx) {
      if (value) this.ctx.suspend();
      else this.ctx.resume();
    }
  }
}
