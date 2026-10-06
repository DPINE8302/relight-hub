import * as T from "three";
import { t } from "./i18n";

// A single, readable action: Airy's breath clears aerosol or pushes away the lure.
export class BreathArts {
  constructor(game) {
    this.game = game;
    this.effects = [];
    this.reset();
  }
  reset() {
    this.cooldown = 0;
    this.stamina = 100;
    this.lift = 0;
    this.glide = false;
    this.sprinting = false;
    for (const e of this.effects) {
      e.mesh.removeFromParent();
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    this.effects = [];
  }
  sweep() {
    const g = this.game;
    if (
      g.paused ||
      g.journey.scene ||
      !["LUNG", "HEART", "BRAIN", "CHOICE"].includes(g.stage) ||
      this.cooldown > 0
    )
      return;
    this.cooldown = 0.28;
    const mesh = new T.Mesh(
      new T.RingGeometry(0.9, 1, 48),
      new T.MeshBasicMaterial({
        color: "#b9f5ff",
        transparent: true,
        opacity: 0.85,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(g.player.position);
    mesh.position.y += 0.14;
    g.scene.add(mesh);
    this.effects.push({ mesh, life: 0.5 });
    if (g.stage === "BRAIN") {
      g.journey.act();
      return;
    }
    let cleared = 0;
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      if (
        Math.hypot(
          p.g.position.x - g.player.position.x,
          p.g.position.z - g.player.position.z,
        ) > 4.5
      )
        continue;
      g.burst(p.g.position, "#b9f5ff");
      g.models.release(p.g);
      g.particles.splice(i, 1);
      cleared++;
    }
    g.stats.cleared += cleared;
    g.audio.sfx(cleared ? "clear" : "exhale");
  }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.stamina = T.MathUtils.clamp(
      this.stamina + (this.sprinting ? -26 : this.glide ? -14 : 22) * dt,
      0,
      100,
    );
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      e.mesh.scale.setScalar(1 + (1 - e.life / 0.5) * 4.5);
      e.mesh.material.opacity = Math.max(0, e.life / 0.5) * 0.7;
      if (e.life <= 0) {
        e.mesh.removeFromParent();
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
    this.renderHUD();
  }
  renderHUD() {
    const g = this.game,
      el = document.getElementById("compass");
    el.hidden =
      !!g.journey.scene ||
      !["LUNG", "HEART", "BRAIN"].includes(g.stage);
    const target = g.journey?.target();
    if (!target) {
      el.hidden = true;
      return;
    }
    const a =
      Math.atan2(
        target.z - g.player.position.z,
        target.x - g.player.position.x,
      ) - g.yaw;
    document.getElementById("compassNeedle").style.transform =
      `rotate(${(a * 180) / Math.PI}deg)`;
    const distance = `${Math.round(Math.hypot(target.x - g.player.position.x, target.z - g.player.position.z))} m`;
    document.getElementById("distance").textContent = t(distance);
  }
  snapshot() {
    return {
      stamina: this.stamina,
      gliding: this.glide,
      sprinting: this.sprinting,
      effects: this.effects.length,
    };
  }
}
