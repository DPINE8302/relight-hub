import "./style.css";
import { initLanguage, copy, t, thai } from "./i18n";
import * as T from "three";
import { Models, ball, label } from "./models";
import { World } from "./world";
import { Audio } from "./audio";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BreathArts } from "./abilities";
import { Journey } from "./journey";
import { loadNature } from "./nature";
const $ = (id) => document.getElementById(id),
  clamp = T.MathUtils.clamp;
class Game {
  constructor(models) {
    this.models = models;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#99d4ef");
    this.scene.fog = new T.Fog("#99d4ef", 45, 135);
    this.camera = new T.PerspectiveCamera(
      65,
      innerWidth / innerHeight,
      0.1,
      220,
    );
    this.renderer = new T.WebGLRenderer({
      canvas: $("game"),
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const room = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new T.HemisphereLight("#dcf4ff", "#737a9d", 1.4));
    const sun = new T.DirectionalLight("#fff0d6", 2.2);
    sun.position.set(25, 45, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -25,
      right: 105,
      top: 35,
      bottom: -35,
      near: 0.1,
      far: 110,
    });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.035;
    const rim = new T.DirectionalLight("#b7d9ff", 1.1);
    rim.position.set(-20, 12, -25);
    this.scene.add(rim);
    this.scene.add(sun);
    this.sun = sun;
    this.world = new World(this.scene, models);
    this.player = models.make("airy");
    this.scene.add(this.player);
    this.audio = new Audio();
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0.4;
    this.velocity = 0;
    this.grounded = true;
    this.settings = {
      master: 0.65,
      music: 0.35,
      sensitivity: 1,
      quality: "high",
    };
    this.stage = "WELCOME";
    this.elapsed = 0;
    this.total = 0;
    this.paused = false;
    this.checkpoint = new T.Vector3(-6, 0, 0);
    this.player.position.copy(this.checkpoint);
    this.particles = [];
    this.bursts = [];
    this.health = 5;
    this.bpm = 72;
    this.mode = "normal";
    this.cycles = 0;
    this.respawns = 0;
    this.stats = {
      cleared: 0,
      damaged: 0,
      orbs: 0,
      jumps: 0,
      stages: [],
      endings: [],
    };
    this.captionUntil = 0;
    this.spawnClock = 0;
    this.speed = 5;
    this.orb = null;
    this.brainPhase = "seek";
    this.phaseTime = 0;
    this.last = performance.now();
    this.fps = 60;
    this.journey = new Journey(this);
    this.arts = new BreathArts(this);
    this.bind();
    this.camera.position.set(-15, 6, 12);
    this.camera.lookAt(0, 1, 0);
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
    this.ready = true;
    $("start").disabled = false;
    $("game").removeAttribute("aria-busy");
  }
  bind() {
    addEventListener("languagechange", () => {
      this.hudKey = "";
      this.arts.hudKey = "";
      this.arts.lastDistance = "";
      this.updateHUD();
      this.arts.renderHUD();
    });
    addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    addEventListener("keydown", (e) => {
      const dialog = this.activeDialog();
      if (dialog && e.code === "Tab") {
        const controls = [
          ...dialog.querySelectorAll("button, input, select, a"),
        ].filter((el) => !el.disabled && el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.code === "Escape") {
        if (!$("journal").hidden) $("closeJournal").click();
        else if (this.paused) this.pause(false);
        else if (this.stage !== "WELCOME" && !this.stage.startsWith("ENDING"))
          this.pause(true);
        return;
      }
      if (dialog) return;
      if (
        this.stage === "WELCOME" ||
        this.stage.startsWith("ENDING") ||
        ["INPUT", "SELECT"].includes(e.target.tagName)
      )
        return;
      if (e.code === "KeyJ") {
        $("journalButton").click();
        return;
      }
      if (this.paused || this.stage === "INTRO" || this.journey.scene) return;
      if (
        ["BUTTON", "A"].includes(e.target.tagName) &&
        ["Space", "Enter"].includes(e.code)
      )
        return;
      if (e.code === "KeyH" && !e.repeat) {
        $("controls").hidden = !$("controls").hidden;
        return;
      }
      if (["KeyQ", "KeyE"].includes(e.code) && !e.repeat) this.arts.sweep();
      if (e.code === "KeyL" && !e.repeat) {
        if (document.pointerLockElement) document.exitPointerLock();
        else $("game").requestPointerLock?.();
      }
      if (e.code === "Space") this.heldSpace = true;
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Space" && !e.repeat) this.jumpRequested = true;
    });
    addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Space") this.heldSpace = false;
    });
    addEventListener("blur", () => {
      this.keys.clear();
      if (
        this.stage !== "WELCOME" &&
        !this.stage.startsWith("ENDING") &&
        !this.activeDialog()
      )
        this.pause(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (
        document.hidden &&
        this.stage !== "WELCOME" &&
        !this.stage.startsWith("ENDING")
      )
        this.pause(true);
    });
    let drag = false,
      moved = 0,
      px = 0,
      py = 0;
    $("game").addEventListener("contextmenu", (e) => e.preventDefault());
    $("game").addEventListener("pointerdown", (e) => {
      $("game").focus({ preventScroll: true });
      if (
        this.paused ||
        this.stage === "WELCOME" ||
        this.stage === "INTRO" ||
        this.journey.scene ||
        this.stage.startsWith("ENDING")
      )
        return;
      if (e.button === 2) {
        this.arts.sweep();
        return;
      }
      if (document.pointerLockElement) {
        this.arts.sweep();
        return;
      }
      drag = true;
      moved = 0;
      px = e.clientX;
      py = e.clientY;
      $("game").setPointerCapture(e.pointerId);
    });
    $("game").addEventListener("pointermove", (e) => {
      if ((!drag && !document.pointerLockElement) || this.paused) return;
      const dx = document.pointerLockElement ? e.movementX : e.clientX - px;
      const dy = document.pointerLockElement ? e.movementY : e.clientY - py;
      moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.006 * this.settings.sensitivity;
      this.pitch = clamp(
        this.pitch + dy * 0.004 * this.settings.sensitivity,
        0.16,
        0.9,
      );
      px = e.clientX;
      py = e.clientY;
    });
    $("game").addEventListener("pointerup", (e) => {
      if (drag && moved < 6 && e.button === 0) this.arts.sweep();
      drag = false;
    });
    $("game").addEventListener("pointercancel", () => (drag = false));
    $("start").onclick = async () => {
      await this.begin();
    };
    $("pauseButton").onclick = () => {
      if (this.stage === "WELCOME") {
        this.pause(true);
      } else if (!this.stage.startsWith("ENDING")) this.pause(!this.paused);
    };
    $("resume").onclick = () => this.pause(false);
    $("journalButton").onclick = () => {
      if (!$("journal").hidden) {
        $("closeJournal").click();
        return;
      }
      this.journalPaused = this.paused;
      this.pause(true);
      $("pause").hidden = true;
      $("journal").hidden = false;
      copy(
        "journalStats",
        `${this.stats.cleared} / 12 · ${this.journey.heart} / 4 · ${this.journey.connected} / 3`,
        false,
      );
      this.syncInterface("closeJournal");
    };
    $("closeJournal").onclick = () => {
      $("journal").hidden = true;
      this.pause(this.journalPaused);
      this.journalPaused = false;
    };
    $("skipScene").onclick = () => this.journey.skip();
    $("restart").onclick = () => this.begin();
    $("home").onclick = (e) => {
      e.preventDefault();
      if (
        this.stage !== "WELCOME" &&
        !this.stage.startsWith("ENDING") &&
        !this.activeDialog()
      )
        this.pause(true);
    };
    $("replay").onclick = () => this.begin();
    $("chooseAgain").onclick = () => {
      this.clearTransient();
      $("ending").hidden = true;
      $("game").inert = false;
      document.querySelector("header").inert = false;
      $("game").focus({ preventScroll: true });
      this.player.position.set(77, 0, 0);
      this.transition("CHOICE");
      this.yaw = 0;
      this.renderer.toneMappingExposure = 1.1;
      this.paused = false;
      this.syncInterface("game");
    };
    for (const k of ["master", "music", "sensitivity"])
      $(k).oninput = () => {
        this.settings[k] = +$(k).value;
        this.audio.set(this.settings.master, this.settings.music);
      };
    $("quality").onchange = () => {
      this.settings.quality = $("quality").value;
      this.renderer.setPixelRatio(
        this.settings.quality === "low" ? 1 : Math.min(devicePixelRatio, 1.5),
      );
      this.renderer.shadowMap.enabled = this.settings.quality === "high";
      this.world.decorations.forEach((g, i) => {
        if (g.userData.highCount) {
          g.count =
            this.settings.quality === "high"
              ? g.userData.highCount
              : Math.ceil(g.userData.highCount / 2);
        } else g.visible = this.settings.quality === "high" || i % 2 === 0;
      });
    };
    $("fullscreen").onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        this.caption("Fullscreen is unavailable in this browser.", 4);
      }
    };
  }
  activeDialog() {
    return ["error", "journal", "pause", "ending"]
      .map($)
      .find((el) => !el.hidden);
  }
  syncInterface(focusId) {
    const dialog = this.activeDialog();
    for (const child of document.body.children)
      child.inert = !!dialog && child !== dialog;
    this.audio.pause(this.paused || !!dialog);
    if (focusId) $(focusId).focus({ preventScroll: true });
  }
  async begin() {
    if (this.starting) return;
    this.starting = true;
    $("start").disabled = true;
    try {
      await this.audio.start();
    } catch {
      /* Play remains available when audio is unavailable. */
    } finally {
      $("start").disabled = false;
      this.starting = false;
    }
    this.start();
  }
  pause(v) {
    this.paused = v;
    this.keys.clear();
    this.heldSpace = false;
    this.jumpRequested = false;
    if (v && document.pointerLockElement) document.exitPointerLock();
    $("pause").hidden = !v;
    this.syncInterface();
    copy(
      "resume",
      this.stage === "WELCOME" ? "Back to the world →" : "Continue journey →",
      false,
    );
    this.audio.pause(v);
    if (v) $("master").focus({ preventScroll: true });
    if (!v) {
      this.last = performance.now();
      (this.stage === "WELCOME" ? $("start") : $("game")).focus({
        preventScroll: true,
      });
    }
  }
  clearTransient() {
    for (const p of this.particles) this.models.release(p.g);
    this.particles = [];
    for (const b of this.bursts) this.scene.remove(b.g);
    this.bursts = [];
    if (this.orb) this.models.release(this.orb);
    this.orb = null;
    this.world.aerosol.visible = false;
    this.world.vape.visible = false;
  }
  start() {
    this.clearTransient();
    this.arts.reset();
    this.journey.reset();
    $("journal").hidden = true;
    this.heldSpace = false;
    this.pause(false);
    this.audio.sfx("click");
    this.health = 5;
    this.bpm = 72;
    this.mode = "normal";
    this.renderer.toneMappingExposure = 1.1;
    this.cycles = 0;
    this.world.setHealth(5);
    this.world.gates.forEach((g) => (g.visible = true));
    this.world.portals.forEach((g) => (g.visible = false));
    this.checkpoint.set(-6, 0, 0);
    this.player.position.copy(this.checkpoint);
    this.player.rotation.y = Math.PI / 2;
    this.yaw = 0;
    this.pitch = 0.4;
    this.velocity = 0;
    this.grounded = true;
    this.keys.clear();
    this.jumpRequested = false;
    this.total = 0;
    this.respawns = 0;
    this.spawnClock = 0;
    this.brainPhase = "seek";
    this.phaseTime = 0;
    this.stats = {
      cleared: 0,
      damaged: 0,
      orbs: 0,
      jumps: 0,
      stages: [],
      endings: [],
    };
    document.body.classList.add("playing");
    $("welcome").hidden = true;
    $("ending").hidden = true;
    $("pause").hidden = true;
    $("hud").hidden = false;
    $("controls").hidden = false;
    $("flash").style.opacity = 0;
    this.transition("INTRO");
    copy("caption", "");
    this.syncInterface("game");
  }
  transition(stage) {
    this.stage = stage;
    document.body.classList.toggle("choosing", stage === "CHOICE");
    this.elapsed = 0;
    this.stats.stages.push(stage);
    this.mode = "normal";
    const names = {
      INTRO: "",
      LUNG: "Lung Garden",
      HEART: "Heart Zone",
      BRAIN: "Brain Zone",
      CHOICE: "Our way home",
    };
    $("hud").hidden = stage === "INTRO";
    $("controls").hidden = stage === "INTRO";
    copy("zoneName", names[stage] ?? "");
    this.journey.enter(stage);
    this.arts.renderHUD();
    this.hudKey = "";
    this.updateHUD();
  }
  caption(text, duration = 5) {
    dispatchEvent(
      new CustomEvent("puff:narration-cue", {
        detail: { english: text, thai: thai(text), duration },
      }),
    );
    copy("caption", text, false);
    this.captionUntil = this.total + duration;
  }
  burst(pos, color) {
    const g = new T.Group();
    for (let i = 0; i < 9; i++) {
      const b = ball(g, color, 0, 1, 0, 0.08);
      b.userData.v = new T.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 3,
        (Math.random() - 0.5) * 3,
      );
    }
    g.position.copy(pos);
    this.scene.add(g);
    this.bursts.push({ g, life: 0.55 });
  }
  spawnParticle() {
    const type = ["nicotine", "toxic", "metal", "chemical"][
        Math.floor(this.world.random() * 4)
      ],
      target = Math.floor(this.world.random() * 5);
    const g = this.models.make(type);
    const a = -Math.PI / 2 + this.world.random() * Math.PI;
    g.position.set(-7 + this.world.random() * 3, 0, Math.sin(a) * 9);
    this.scene.add(g);
    this.particles.push({
      g,
      type,
      target,
      speed: 1.4 + Math.min(this.stats.cleared, 12) * 0.05,
    });
  }
  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i],
        target = this.world.alveoli[p.target].position;
      const dir = target.clone().sub(p.g.position);
      dir.y = 0;
      p.g.position.addScaledVector(
        dir.normalize(),
        p.speed * (p.slowUntil > this.total ? 0.2 : 1) * dt,
      );
      p.g.rotation.y += dt;
      let remove = false;
      const playerFlat = Math.hypot(
        this.player.position.x - p.g.position.x,
        this.player.position.z - p.g.position.z,
      );
      if (playerFlat < 1.1 && this.player.position.y < 2) {
        this.stats.cleared++;
        this.audio.sfx("clear");
        this.burst(p.g.position, "#b0f8ff");
        remove = true;
      } else if (p.g.position.distanceTo(target) < 0.5) {
        if (this.health > 0) {
          this.health--;
          this.stats.damaged++;
          this.world.setHealth(this.health);
          this.audio.sfx("damage");
          this.burst(target, "#b9a0cb");
        }
        remove = true;
      }
      if (remove) {
        this.models.release(p.g);
        this.particles.splice(i, 1);
      }
    }
  }
  move(dt) {
    const p = this.player.position,
      prev = p.clone();
    let forward =
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0),
      side =
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const input = new T.Vector3(
      Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side,
      0,
      Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side,
    );
    if (input.length() > 1) input.normalize();
    this.speed =
      5 * (this.mode === "rush" ? 1.25 : this.mode === "crash" ? 0.8 : 1);
    this.arts.sprinting =
      input.lengthSq() > 0.01 &&
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) &&
      this.arts.stamina > 5 &&
      this.grounded;
    if (this.arts.sprinting) this.speed *= 1.65;
    p.addScaledVector(input, this.speed * dt);
    if (this.stage === "BRAIN" && this.orb) {
      const pull = this.orb.position.clone().sub(p);
      pull.y = 0;
      const distance = pull.length();
      if (distance > 1.15 && distance < 5.5)
        p.addScaledVector(pull.normalize(), 1.8 * dt);
    }
    const gate =
      this.stage === "LUNG" && !this.journey.lungDone
        ? 13
        : this.stage === "HEART" && this.journey.heart < 4
          ? 41
          : this.stage === "BRAIN" && !this.journey.brainDone
            ? 69
            : null;
    if (gate !== null) p.x = Math.min(p.x, gate);
    const obstacles = [
      { x: 0, z: -4, r: 3.4 },
      { x: 28, z: -6, r: 3.5 },
      { x: 56, z: -5, r: 4.3 },
    ];
    for (const o of obstacles) {
      const dx = p.x - o.x,
        dz = p.z - o.z,
        dist = Math.hypot(dx, dz);
      if (dist < o.r && p.y < 4) {
        p.x = o.x + (dx / (dist || 1)) * o.r;
        p.z = o.z + (dz / (dist || 1)) * o.r;
      }
    }
    let riding = null;
    for (const platform of this.world.platforms) {
      const q = platform.g.position;
      if (
        this.grounded &&
        Math.abs(prev.x - platform.x) < 1.55 &&
        Math.abs(prev.z - platform.prev.z) < 1.55 &&
        Math.abs(prev.y - (q.y + 0.12)) < 0.15
      ) {
        riding = platform;
        p.z += q.z - platform.prev.z;
      }
    }
    if ((this.keys.has("Space") || this.jumpRequested) && this.grounded) {
      this.velocity = this.arts.lift > 0 ? 9 : this.mode === "rush" ? 7.4 : 6.5;
      this.grounded = false;
      this.keys.delete("Space");
      this.stats.jumps++;
      this.audio.sfx("jump");
    }
    this.jumpRequested = false;
    const oldY = p.y;
    this.arts.glide =
      !this.grounded &&
      this.velocity < 0 &&
      this.heldSpace &&
      this.arts.stamina > 2;
    this.velocity -= (this.arts.glide ? 3 : 14) * dt;
    if (this.arts.glide) this.velocity = Math.max(this.velocity, -1.8);
    p.y += this.velocity * dt;
    const floor = this.world.ground(p.x, p.z);
    this.grounded = false;
    if (
      floor !== null &&
      p.y <= floor &&
      this.velocity <= 0 &&
      oldY >= floor - 0.15
    ) {
      p.y = floor;
      this.velocity = 0;
      this.grounded = true;
    }
    if (p.y < -12) {
      this.respawn();
    }
    if (input.lengthSq() > 0.01)
      this.player.rotation.y = Math.PI / 2 - Math.atan2(input.z, input.x);
    const visual = this.player.userData.visual;
    if (visual.userData.legs) {
      visual.userData.legs.forEach(
        (leg, i) =>
          (leg.position.z =
            Math.sin(this.total * 10 + i * Math.PI) *
            (input.lengthSq() > 0.01 ? 0.15 : 0)),
      );
      visual.userData.arms.forEach(
        (arm, i) => (arm.rotation.z = Math.sin(this.total * 6 + i) * 0.08),
      );
    }
    visual.position.y =
      Math.sin(this.total * 3) * (this.grounded ? 0.04 : 0.02);
    visual.rotation.z =
      this.mode === "crash" ? Math.sin(this.total * 2) * 0.06 : 0;
  }
  respawn() {
    if (this.stage === "HEART" && this.journey.heart > 0) {
      const q = this.world.platforms[this.journey.heart - 1].g.position;
      this.player.position.set(q.x, q.y + 0.12, q.z);
    } else this.player.position.copy(this.checkpoint);
    this.velocity = 0;
    this.grounded = true;
    this.respawns++;
    this.audio.sfx("checkpoint");
    this.caption("Let’s try that step again.", 1.5);
  }
  ending(good) {
    this.clearTransient();
    this.stage = good ? "ENDING_GOOD" : "ENDING_LOOP";
    this.elapsed = 0;
    this.mode = "normal";
    this.stats.endings.push(this.stage);
    document.body.classList.remove("cinematic");
    $("skipScene").hidden = true;
    this.arts.renderHUD();
    this.audio.sfx("portal");
    $("hud").hidden = true;
    $("controls").hidden = true;
    copy("hint", "", false);
    this.caption(
      good ? "Airy: We found clear air." : "Airy: Back here again?",
      3,
    );
    if (good) this.audio.sfx("ending");
    else {
      this.audio.sfx("inhale");
      this.world.aerosol.visible = true;
      this.world.aerosol.position.set(this.player.position.x, 5, 0);
    }
    $("flash").style.background = good ? "#ccfff0" : "#c9a6ef";
    $("flash").style.opacity = good ? 0.12 : 0.45;
    this.endingShown = false;
  }
  showEnding() {
    this.endingShown = true;
    $("flash").style.opacity = 0;
    $("ending").hidden = false;
    $("game").inert = true;
    document.querySelector("header").inert = true;
    $("replay").focus({ preventScroll: true });
    const good = this.stage === "ENDING_GOOD";
    copy(
      "endingTitle",
      good ? "We chose clear air" : "One more brings us back",
    );
    copy(
      "endingIntro",
      good
        ? "A little choice. A brighter next step."
        : "The craving repeats. We can choose another way.",
    );
    $("facts").hidden = !good;
    $("learning").hidden = !good;
    $("learning").open = false;
    $("chooseAgain").hidden = good;
    copy("caption", "", true);
    if (!good) {
      this.player.position.set(-6, 0, 0);
      this.world.aerosol.position.set(0, 5, 0);
      this.world.setHealth(Math.min(this.health, 2));
      this.scene.background.set("#a4a3c4");
      this.renderer.toneMappingExposure = 0.9;
    }
    this.syncInterface("replay");
  }
  updateHUD() {
    if (
      !this.journey.scene &&
      ["LUNG", "HEART", "BRAIN", "CHOICE"].includes(this.stage)
    )
      this.journey.hud();
  }
  tick(dt) {
    if (this.paused || this.activeDialog()) return;
    if (this.stage === "WELCOME") {
      this.total += dt;
      this.world.update(dt, this.total, 72, this.stage, "normal");
      this.models.update(dt);
      return;
    }
    this.total += dt;
    this.elapsed += dt;
    this.models.update(dt);
    if (this.total > this.captionUntil) copy("caption", "", true);
    const stage = this.stage;
    if (
      !stage.startsWith("ENDING") &&
      stage !== "INTRO" &&
      !this.journey.scene
    ) {
      this.move(dt);
      this.arts.update(dt);
    }
    this.journey.update(dt);
    if (stage === "CHOICE") {
      for (let i = 0; i < 2; i++)
        if (
          Math.hypot(
            this.player.position.x - 83,
            this.player.position.z - (i ? 4 : -4),
          ) < 1.5
        ) {
          this.ending(i === 1);
          break;
        }
    }
    if (stage === "ENDING_GOOD") {
      const v = this.player.userData.visual;
      if (v.userData.arms)
        v.userData.arms.forEach(
          (arm, i) =>
            (arm.rotation.z =
              (i ? -0.9 : 0.9) + Math.sin(this.total * 4) * 0.12),
        );
      v.position.y = Math.sin(this.total * 3) * 0.08;
      this.bpm = Math.max(72, 112 - this.elapsed * 10);
      if (this.elapsed > 2) {
        this.health = Math.min(5, Math.floor(this.elapsed * 2));
        this.world.setHealth(this.health);
      }
      if (this.elapsed >= 4 && !this.endingShown) this.showEnding();
    } else if (
      stage === "ENDING_LOOP" &&
      this.elapsed >= 3 &&
      !this.endingShown
    )
      this.showEnding();
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      for (const m of b.g.children)
        m.position.addScaledVector(m.userData.v, dt);
      if (b.life <= 0) {
        this.scene.remove(b.g);
        this.bursts.splice(i, 1);
      }
    }
    this.world.update(dt, this.total, this.bpm, this.stage, this.mode);
    this.audio.update(dt, this.stage, this.bpm, this.mode);
    if (this.renderMode !== this.mode) {
      this.renderMode = this.mode;
      $("game").style.filter =
        this.mode === "crash"
          ? "saturate(.35) brightness(.88)"
          : this.mode === "rush"
            ? "saturate(1.25) brightness(1.06)"
            : "";
    }
    this.updateHUD();
  }
  cameraUpdate(dt) {
    let target, desired;
    if (this.stage === "INTRO" || this.journey.scene) {
      ({ target, desired } = this.journey.camera());
    } else if (this.stage === "WELCOME") {
      target = new T.Vector3(1, 1, -1);
      desired = new T.Vector3(-14, 10, 20);
    } else if (this.stage === "ENDING_GOOD") {
      target = new T.Vector3(40, 0, 0);
      desired = new T.Vector3(32, 36 + Math.min(this.elapsed, 10) * 1.5, 64);
    } else if (this.stage === "ENDING_LOOP" && this.endingShown) {
      target = new T.Vector3(0, 1, 0);
      desired = new T.Vector3(-13, 8, 14);
    } else {
      target = this.player.position.clone().add(new T.Vector3(0, 1.3, 0));
      desired = target
        .clone()
        .add(
          new T.Vector3(
            -Math.cos(this.yaw) * 8,
            2.4 + this.pitch * 3.5,
            -Math.sin(this.yaw) * 8,
          ),
        );
      const dir = desired.clone().sub(target),
        ray = new T.Raycaster(
          target,
          dir.clone().normalize(),
          0.5,
          dir.length(),
        );
      ray.camera = this.camera;
      const hits = ray
        .intersectObjects(
          [this.world.lung, this.world.heart, this.world.brain],
          true,
        )
        .filter((hit) => hit.object.isMesh && !hit.object.material.transparent);
      if (hits.length)
        desired
          .copy(target)
          .addScaledVector(
            dir.normalize(),
            Math.max(2, hits[0].distance - 0.4),
          );
      desired.y = Math.max(desired.y, 2.7);
    }
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(target);
  }
  renderLoop(now) {
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.fps = this.fps * 0.95 + 0.05 / (dt || 0.016);
    if (!this.manual) {
      this.tick(dt);
      this.cameraUpdate(dt);
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.renderLoop);
  }
  snapshot() {
    return {
      ready: this.ready,
      stage: this.stage,
      elapsed: this.elapsed,
      total: this.total,
      health: this.health,
      bpm: this.bpm,
      mode: this.mode,
      cycles: this.cycles,
      phase: this.brainPhase,
      position: this.player.position.toArray(),
      checkpoint: this.checkpoint.toArray(),
      grounded: this.grounded,
      respawns: this.respawns,
      particles: this.particles.length,
      orb: this.orb?.position.toArray(),
      paused: this.paused,
      settings: { ...this.settings },
      audio: { state: this.audio.ctx?.state, events: { ...this.audio.events } },
      stats: structuredClone(this.stats),
      fps: Math.round(this.fps),
      triangles: this.renderer.info.render.triangles,
      drawCalls: this.renderer.info.render.calls,
      modelErrors: this.models.errors,
      arts: this.arts.snapshot(),
      journey: {
        lungDone: this.journey.lungDone,
        heart: this.journey.heart,
        connected: this.journey.connected,
        brainDone: this.journey.brainDone,
        scene: this.journey.scene?.stage,
      },
    };
  }
}
initLanguage();
try {
  await document.fonts.load('700 48px "LINE Seed Sans TH"', "ไทย");
  const models = new Models();
  await models.init();
  models.nature = await loadNature();
  const game = new Game(models);
  if (new URLSearchParams(location.search).has("qa")) {
    window.__game = game;
    window.__qa = {
      snapshot: () => game.snapshot(),
      step(seconds) {
        game.manual = true;
        game.audio.simulating = true;
        try {
          for (let t = 0; t < seconds; t += 1 / 60)
            game.tick(Math.min(1 / 60, seconds - t));
        } finally {
          game.audio.simulating = false;
        }
        game.cameraUpdate(1);
        game.renderer.render(game.scene, game.camera);
        return game.snapshot();
      },
      live() {
        game.manual = false;
        game.last = performance.now();
      },
      key(code, value) {
        value ? game.keys.add(code) : game.keys.delete(code);
      },
      place(x, y, z) {
        game.player.position.set(x, y, z);
        game.velocity = 0;
        game.grounded = true;
        game.cameraUpdate(1);
      },
      start: () => game.start(),
    };
  }
} catch (e) {
  $("error").hidden = false;
  $("errorText").textContent =
    e.message + " Enable WebGL in a current desktop browser, then reload.";
  console.error(e);
}
