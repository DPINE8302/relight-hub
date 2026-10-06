import * as T from "three";
import { copy } from "./i18n";
import { STAGE_SCENES, sceneCamera } from "./story-scenes";

// Story progression belongs to completed actions, never an unattended countdown.
export class Journey {
  constructor(game) {
    this.g = game;
    this.heartMarks = [];
    this.signals = [];
    this.links = [];
    for (const platform of game.world.platforms) {
      const marker = this.marker("#ffd58b");
      platform.g.add(marker);
      marker.position.y = 0.2;
      this.heartMarks.push(marker);
    }
    [
      [50, 3],
      [58, 1],
      [65, 3],
    ].forEach(([x, z]) => {
      const group = this.marker("#abecff", true);
      group.position.set(x, 0.1, z);
      game.scene.add(group);
      this.signals.push(group);
    });
    const points = [
      [46, 1],
      [50, 3],
      [58, 1],
      [65, 3],
      [70, 0],
    ];
    for (let i = 0; i < points.length - 1; i++) {
      const [x, z] = points[i],
        [nx, nz] = points[i + 1];
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(x, 0.1, z),
        new T.Vector3((x + nx) / 2, 0.18, (z + nz) / 2),
        new T.Vector3(nx, 0.1, nz),
      ]);
      const line = new T.Mesh(
        new T.TubeGeometry(curve, 24, 0.1, 6, false),
        new T.MeshBasicMaterial({ color: "#79dfff", toneMapped: false }),
      );
      game.scene.add(line);
      this.links.push(line);
    }
    this.reset();
  }
  marker(color, signal = false) {
    const root = new T.Group();
    const material = new T.MeshBasicMaterial({
      color,
      toneMapped: false,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new T.Mesh(
      new T.TorusGeometry(signal ? 0.9 : 0.85, 0.07, 8, 40),
      material,
    );
    if (signal) {
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 1.2;
    } else ring.rotation.x = -Math.PI / 2;
    root.add(ring);
    const core = new T.Mesh(
      new T.SphereGeometry(signal ? 0.33 : 0.16, 16, 12),
      new T.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.25,
      }),
    );
    core.position.y = signal ? 1.1 : 0.12;
    root.add(core);
    root.userData = { ring, core };
    return root;
  }
  reset() {
    this.scene = null;
    this.clearPreview();
    this.heart = 0;
    this.connected = 0;
    this.lungDone = false;
    this.brainDone = false;
    this.lureCooldown = 0;
    this.cinematicShot = -1;
    this.heartMarks.forEach((m) => {
      m.visible = false;
      m.userData.ring.material.color.set("#ffd58b");
    });
    this.signals.forEach((m) => {
      m.visible = false;
      m.userData.ring.material.color.set("#abecff");
      m.userData.core.material.color.set("#526486");
      m.userData.core.material.emissive.set("#526486");
    });
    this.links.forEach((m) => {
      m.visible = false;
      m.material.color.set("#79dfff");
    });
  }
  enter(stage) {
    const g = this.g;
    document.body.classList.toggle("cinematic", stage === "INTRO");
    document.getElementById("skipScene").hidden = stage !== "INTRO";
    if (stage === "INTRO") {
      this.cinematicShot = -1;
      g.player.position.set(-6, 0, 0);
      g.player.rotation.y = -Math.PI / 4;
    }
    if (stage === "LUNG") {
      g.player.rotation.y = Math.PI / 2;
      g.world.vape.visible = true;
      g.world.aerosol.visible = true;
      g.spawnClock = 0.6;
    }
    if (stage === "HEART") {
      g.clearTransient();
      g.checkpoint.set(18, 0, 0);
      g.audio.sfx("checkpoint");
      this.heartMarks.forEach((m) => (m.visible = true));
    }
    if (stage === "BRAIN") {
      g.checkpoint.set(46, 0, 0);
      g.audio.sfx("checkpoint");
      this.signals.forEach((m) => (m.visible = true));
      this.links.forEach((m) => (m.visible = true));
      this.spawnLure();
      g.brainPhase = "connect";
    }
    if (stage === "CHOICE") {
      g.world.gates[2].visible = false;
      g.world.portals.forEach((p) => (p.visible = true));
      g.checkpoint.set(75, 0, 0);
    }
    if (STAGE_SCENES[stage]) this.startScene(stage);
  }
  clearPreview() {
    for (const model of this.preview ?? []) this.g.models.release(model);
    this.preview = [];
  }
  startScene(stage) {
    this.scene = { stage, index: -1, time: 0, shotTime: 0 };
    this.clearPreview();
    if (stage === "LUNG")
      for (const type of ["toxic", "metal", "chemical"]) {
        const m = this.g.models.make(type);
        this.g.scene.add(m);
        this.preview.push(m);
      }
    document.body.classList.add("cinematic");
    document.getElementById("skipScene").hidden = false;
    document.getElementById("hud").hidden = true;
    document.getElementById("controls").hidden = true;
    document.getElementById("compass").hidden = true;
    copy("hint", "");
    this.g.keys.clear();
  }
  finishScene() {
    const stage = this.scene?.stage;
    this.scene = null;
    this.clearPreview();
    document.body.classList.remove("cinematic");
    document.getElementById("skipScene").hidden = true;
    document.getElementById("hud").hidden = false;
    document.getElementById("controls").hidden = false;
    this.g.mode = "normal";
    this.g.phaseTime = 0;
    this.g.keys.clear();
    copy("caption", "");
    if (stage === "HEART") this.g.bpm = 72;
    if (stage === "BRAIN" && this.g.orb) this.g.orb.position.set(54, 0.8, -0.5);
    this.g.updateHUD();
    this.g.arts.renderHUD();
    document.getElementById("game").focus({ preventScroll: true });
  }
  skip() {
    if (this.g.stage === "INTRO") this.g.transition("LUNG");
    else if (this.scene) this.finishScene();
  }
  spawnLure() {
    const g = this.g;
    if (g.orb) g.models.release(g.orb);
    g.orb = g.models.make("nicotine");
    g.orb.position.set(54, 0.7, -0.5);
    g.scene.add(g.orb);
  }
  act() {
    const g = this.g;
    if (g.stage !== "BRAIN" || this.scene || this.brainDone) return;
    if (
      g.orb &&
      Math.hypot(
        g.orb.position.x - g.player.position.x,
        g.orb.position.z - g.player.position.z,
      ) < 5.5
    ) {
      const away = g.orb.position.clone().sub(g.player.position);
      away.y = 0;
      if (away.length() < 0.1) away.set(-1, 0, 0);
      g.orb.position.addScaledVector(away.normalize(), 3.8);
      g.burst(g.orb.position, "#c1ffff");
      g.audio.sfx("clear");
    } else g.audio.sfx("exhale");
  }
  passWaypoint() {
    const g = this.g,
      signal = this.signals[this.connected];
    signal.userData.core.material.color.set("#c6ffff");
    signal.userData.core.material.emissive.set("#89f9dd");
    signal.userData.ring.material.color.set("#89f9dd");
    this.links[this.connected].material.color.set("#89f9dd");
    g.burst(signal.position, "#b0ffff");
    g.audio.sfx("checkpoint");
    this.connected++;
    if (this.connected === 3) {
      this.brainDone = true;
      g.mode = "normal";
      g.phaseTime = 0;
      g.brainPhase = "done";
      g.world.gates[2].visible = false;
      this.links[3].material.color.set("#89f9dd");
      if (g.orb) g.models.release(g.orb);
      g.orb = null;
      g.caption("We can choose a different path.", 2.5);
    }
  }
  tempt() {
    const g = this.g;
    if (g.stage !== "BRAIN" || !g.orb || this.lureCooldown > 0) return;
    g.cycles++;
    g.stats.orbs++;
    g.mode = "rush";
    g.brainPhase = "rush";
    g.phaseTime = 0;
    this.lureCooldown = 9;
    g.audio.sfx("reward");
    g.burst(g.orb.position, "#ffe7a4");
    g.models.release(g.orb);
    g.orb = null;
    g.caption("Feels good… but only for a moment.", 2);
  }
  update(dt) {
    const g = this.g,
      p = g.player.position;
    if (this.scene) {
      const scene = this.scene,
        shots = STAGE_SCENES[scene.stage];
      scene.time += dt;
      let elapsed = scene.time,
        index = 0;
      while (index < shots.length && elapsed >= shots[index].time) {
        elapsed -= shots[index].time;
        index++;
      }
      if (index >= shots.length) {
        this.finishScene();
        return;
      }
      scene.shotTime = elapsed;
      if (index !== scene.index) {
        scene.index = index;
        g.caption(shots[index].text, shots[index].time + 0.1);
        g.audio.sfx(index === 0 ? "inhale" : "exhale");
      }
      if (scene.stage === "LUNG")
        this.preview.forEach((m, i) =>
          m.position.set(
            -6 + ((scene.time * 0.75 + i * 0.9) % 7),
            0.65,
            1 + i * 0.7,
          ),
        );
      if (scene.stage === "HEART")
        g.bpm = Math.round(72 + Math.min(scene.time / 6, 1) * 40);
      if (scene.stage === "BRAIN") {
        g.mode = index === 0 ? "rush" : index === 1 ? "crash" : "normal";
        if (g.orb) {
          g.orb.position.set(50 + Math.sin(scene.time) * 0.5, 0.9, 1);
          g.orb.rotation.y += dt;
        }
      }
      return;
    }
    if (g.stage === "INTRO") {
      const shot = g.elapsed < 3 ? 0 : g.elapsed < 6 ? 1 : 2;
      if (shot !== this.cinematicShot) {
        this.cinematicShot = shot;
        g.caption(
          [
            "Airy: I’m a little breath inside the body.",
            "A vape cloud enters. It carries more than water vapour.",
            "The way out is ahead. Through lungs, heart and brain.",
          ][shot],
          3.5,
        );
      }
      if (g.elapsed >= 3) {
        g.world.vape.visible = true;
        g.world.aerosol.visible = true;
      }
      if (g.elapsed >= 9.5) this.skip();
      return;
    }
    if (g.stage === "LUNG") {
      if (!this.lungDone) {
        g.spawnClock += dt;
        if (g.spawnClock > 0.72 && g.particles.length < 12) {
          g.spawnClock = 0;
          g.spawnParticle();
        }
        g.updateParticles(dt);
        if (g.stats.cleared >= 12) {
          this.lungDone = true;
          g.clearTransient();
          g.world.gates[0].visible = false;
          g.audio.sfx("checkpoint");
          g.caption("Aerosol can carry particles and harmful chemicals.", 3);
        }
      }
      if (this.lungDone && p.x > 15) g.transition("HEART");
    }
    if (g.stage === "HEART") {
      g.bpm = [72, 85, 98, 112, 112][this.heart];
      const platform = g.world.platforms[this.heart];
      if (
        platform &&
        g.grounded &&
        Math.abs(p.x - platform.g.position.x) < 1.45 &&
        Math.abs(p.z - platform.g.position.z) < 1.45 &&
        Math.abs(p.y - (platform.g.position.y + 0.12)) < 0.16
      ) {
        this.heartMarks[this.heart].userData.ring.material.color.set("#b6ffe5");
        this.heart++;
        g.burst(p, "#b6ffe5");
        g.audio.sfx("checkpoint");
        if (this.heart === 4) {
          g.world.gates[1].visible = false;
          g.caption("Nicotine can make the heart beat faster.", 3);
        }
      }
      if (this.heart === 4 && p.x > 43) g.transition("BRAIN");
    }
    if (g.stage === "BRAIN") {
      this.lureCooldown = Math.max(0, this.lureCooldown - dt);
      g.phaseTime += dt;
      if (g.mode === "rush" && g.phaseTime >= 2.5) {
        g.mode = "crash";
        g.brainPhase = "crash";
        g.phaseTime = 0;
        g.audio.sfx("crash");
        g.caption("The boost fades. The craving can return.", 2);
      }
      if (g.mode === "crash" && g.phaseTime >= 2.5) {
        g.mode = "normal";
        g.brainPhase = "connect";
        g.phaseTime = 0;
      }
      if (
        !this.brainDone &&
        !g.orb &&
        g.mode === "normal" &&
        this.lureCooldown <= 0
      )
        this.spawnLure();
      if (g.orb) {
        const d = new T.Vector3(
          p.x - g.orb.position.x,
          0,
          p.z - g.orb.position.z,
        );
        if (d.length() > 1.1)
          g.orb.position.addScaledVector(
            d.normalize(),
            dt * (1.25 + this.connected * 0.3),
          );
        g.orb.position.y = 0.8 + Math.sin(g.total * 3) * 0.15;
        g.orb.rotation.y += dt;
        if (Math.hypot(p.x - g.orb.position.x, p.z - g.orb.position.z) < 1.15)
          this.tempt();
      }
      const waypoint = this.signals[this.connected];
      if (
        waypoint &&
        Math.hypot(p.x - waypoint.position.x, p.z - waypoint.position.z) < 1.35
      )
        this.passWaypoint();
      if (this.brainDone && p.x > 72) g.transition("CHOICE");
    }
    this.heartMarks.forEach((m, i) => {
      m.userData.ring.material.opacity =
        i < this.heart
          ? 0.55
          : i === this.heart
            ? 0.7 + Math.sin(g.total * 4) * 0.25
            : 0.15;
    });
    this.signals.forEach((s, i) => {
      s.userData.core.position.y = 1.1 + Math.sin(g.total * 2 + i) * 0.1;
      s.userData.ring.material.opacity = i === this.connected ? 0.85 : 0.3;
      if (i === this.connected) {
        s.userData.core.material.color.set("#a8edff");
        s.userData.core.material.emissive.set("#a8edff");
      }
    });
  }
  target() {
    const g = this.g;
    if (g.stage === "LUNG")
      return this.lungDone
        ? new T.Vector3(16, 0, 0)
        : (g.particles[0]?.g.position ?? new T.Vector3(-1, 0, 1));
    if (g.stage === "HEART")
      return (
        g.world.platforms[this.heart]?.g.position ?? new T.Vector3(44, 0, 0)
      );
    if (g.stage === "BRAIN")
      return this.signals[this.connected]?.position ?? new T.Vector3(74, 0, 0);
    if (g.stage === "CHOICE") return new T.Vector3(83, 0, 4);
  }
  hud() {
    const g = this.g;
    const open =
      g.stage === "LUNG"
        ? this.lungDone
        : g.stage === "HEART"
          ? this.heart === 4
          : this.brainDone;
    const goal =
      g.stage === "LUNG"
        ? "Sweep the cloud away"
        : g.stage === "HEART"
          ? "Light the four stepping stones"
          : g.stage === "BRAIN"
            ? "Escape the craving loop"
            : "Choose our next step";
    copy("mission", open && g.stage !== "CHOICE" ? "The path is open" : goal);
    const count =
      g.stage === "LUNG"
        ? `${Math.min(g.stats.cleared, 12)} / 12`
        : g.stage === "HEART"
          ? `${this.heart} / 4`
          : g.stage === "BRAIN"
            ? `${this.connected} / 3`
            : "";
    document.getElementById("zoneMeter").textContent = count;
    copy(
      "hint",
      g.stage === "LUNG" && g.stats.cleared < 2
        ? "WASD · Move   Click · Breathe"
        : g.stage === "HEART" && this.heart < 1
          ? "Space · Jump"
          : g.stage === "BRAIN" && !open
            ? "Blue path · Walk   Golden lure · Breathe"
            : "",
    );
  }
  camera() {
    if (this.scene)
      return sceneCamera(
        STAGE_SCENES[this.scene.stage][Math.max(0, this.scene.index)],
        this.scene.shotTime,
      );
    const time = this.g.elapsed;
    if (time < 3)
      return {
        target: new T.Vector3(-6, 1.2, 0),
        desired: new T.Vector3(-10 + time * 0.3, 3.2, 5),
      };
    if (time < 6)
      return {
        target: new T.Vector3(-5, 5, -3),
        desired: new T.Vector3(-17 + (time - 3) * 0.7, 11, 9),
      };
    return {
      target: new T.Vector3(32, 2, -3),
      desired: new T.Vector3(20 + (time - 6) * 1.5, 27, 39),
    };
  }
}
