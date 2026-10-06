import * as T from "three";
import { buildMeadows } from "./scenery";
import { buildNature } from "./nature";
import { ball, box, tube, ring, label, material } from "./models";
export class World {
  constructor(scene, models) {
    this.scene = scene;
    this.models = models;
    this.alveoli = [];
    this.platforms = [];
    this.portals = [];
    this.clouds = [];
    this.decorations = [];
    this.gates = [];
    this.neurons = [];
    this.rng = 1234;
    this.build();
    buildMeadows(this);
    this.batchDecorations();
  }
  batchDecorations() {
    const batches = new Map(),
      remaining = [];
    for (const root of this.decorations) {
      const key = root.name.replace("model:", "");
      if (!["plant", "rock"].includes(key) || this.models.assets.has(key)) {
        remaining.push(root);
        continue;
      }
      root.updateMatrixWorld(true);
      root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const id = mesh.geometry.uuid + mesh.material.uuid;
        if (!batches.has(id))
          batches.set(id, {
            geometry: mesh.geometry,
            material: mesh.material,
            matrices: [],
          });
        batches.get(id).matrices.push(mesh.matrixWorld.clone());
      });
      root.removeFromParent();
    }
    for (const { geometry, material, matrices } of batches.values()) {
      const mesh = new T.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.highCount = matrices.length;
      this.scene.add(mesh);
      remaining.push(mesh);
    }
    this.decorations = remaining;
  }
  random() {
    this.rng = (1664525 * this.rng + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }
  place(key, x, y, z, scale = 1) {
    const g = this.models.make(key);
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    this.scene.add(g);
    return g;
  }
  island(x, r, color) {
    const g = new T.Group();
    g.position.x = x;
    let mesh;
    if (x === 28) {
      const shape = new T.Shape();
      shape.absarc(0, 0, r, 0, Math.PI * 2, false);
      const hole = new T.Path();
      hole.moveTo(-8, -3.8);
      hole.lineTo(-8, 3.8);
      hole.lineTo(8.3, 3.8);
      hole.lineTo(8.3, -3.8);
      hole.closePath();
      shape.holes.push(hole);
      mesh = new T.Mesh(
        new T.ExtrudeGeometry(shape, {
          depth: 1.2,
          bevelEnabled: false,
          curveSegments: 32,
        }),
        material(color),
      );
      mesh.rotation.x = Math.PI / 2;
    } else {
      mesh = new T.Mesh(
        new T.CylinderGeometry(r, r * 0.78, 1.2, 48),
        material(color),
      );
      mesh.position.y = -0.6;
    }
    mesh.receiveShadow = true;
    g.add(mesh);
    const under = new T.Mesh(
      new T.ConeGeometry(r * 0.85, 9, 9),
      material("#8c8495"),
    );
    under.rotation.z = Math.PI;
    under.position.y = -5;
    g.add(under);
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI * 2) / 32;
      ball(g, color, Math.cos(a) * r, -0.1, Math.sin(a) * r, 0.9, 0.4, 0.75);
    }
    const key = x === 28 ? "heartIsland" : "floatingIsland";
    if (this.models.assets.has(key)) {
      g.clear();
      const visual = this.models.make(key);
      visual.position.y = -10;
      visual.scale.x = visual.scale.z = r / 14;
      g.add(visual);
    }
    this.scene.add(g);
  }
  sign(text, x, z, c) {
    const s = label(text, c, 1.15);
    s.position.set(x, 3, z);
    this.scene.add(s);
    return s;
  }
  bridge(x, z, len = 4) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    for (let i = 0; i < len / 0.5; i++)
      box(g, "#c89c72", -len / 2 + i * 0.5, 0.05, 0, 0.44, 0.14, 3);
    for (const xx of [-len / 2, len / 2])
      for (const zz of [-1.5, 1.5]) {
        box(g, "#bc906a", xx, 0.65, zz, 0.28, 1.3, 0.28);
      }
    for (const zz of [-1.5, 1.5])
      tube(
        g,
        "#ecbe86",
        [
          [-len / 2, 1.2, zz],
          [0, 0.95, zz],
          [len / 2, 1.2, zz],
        ],
        0.055,
      );
    if (this.models.assets.has("bridge")) {
      g.clear();
      const visual = this.models.make("bridge");
      visual.scale.x = len / 4;
      g.add(visual);
    }
    this.scene.add(g);
  }
  buildGardenDetails() {
    // Instanced accents enrich the islands without increasing each flower's draw calls.
    const dummy = new T.Object3D();
    const flowers = new T.InstancedMesh(
      new T.SphereGeometry(1, 7, 5),
      material("#fff4c1"),
      420,
    );
    const centers = new T.InstancedMesh(
      new T.SphereGeometry(1, 7, 5),
      material("#ffd65c"),
      84,
    );
    let petal = 0;
    for (let i = 0; i < 84; i++) {
      const zone = i % 4,
        xc = [0, 28, 56, 81][zone];
      const a = this.random() * Math.PI * 2,
        r = (zone === 3 ? 6 : 8) + this.random() * 2;
      const x = xc + Math.cos(a) * r,
        z = Math.sin(a) * r;
      for (let j = 0; j < 5; j++) {
        const angle = (j * Math.PI * 2) / 5;
        dummy.position.set(
          x + Math.cos(angle) * 0.12,
          0.12,
          z + Math.sin(angle) * 0.12,
        );
        dummy.scale.set(0.13, 0.055, 0.1);
        dummy.rotation.set(0, angle, 0);
        dummy.updateMatrix();
        flowers.setMatrixAt(petal++, dummy.matrix);
      }
      dummy.position.set(x, 0.15, z);
      dummy.scale.setScalar(0.075);
      dummy.updateMatrix();
      centers.setMatrixAt(i, dummy.matrix);
    }
    flowers.receiveShadow = true;
    this.scene.add(flowers, centers);
    const paving = new T.InstancedMesh(
      new T.CylinderGeometry(0.62, 0.66, 0.07, 7),
      material("#e5cda5"),
      39,
    );
    let n = 0;
    for (let x = -9; x < 88; x += 2.5) {
      // Preserve the platform channel and bridge surfaces.
      const inChannel = x > 19 && x < 37;
      const onBridge =
        (x > 12 && x < 16) || (x > 40 && x < 44) || (x > 68 && x < 74);
      dummy.position.set(
        x,
        inChannel || onBridge ? -25 : 0.05,
        Math.sin(x * 0.7) * 0.12,
      );
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, this.random(), 0);
      dummy.updateMatrix();
      paving.setMatrixAt(n++, dummy.matrix);
    }
    paving.count = n;
    paving.receiveShadow = true;
    this.scene.add(paving);
  }
  build() {
    this.island(0, 14, "#a4cb7f");
    this.island(28, 14, "#c9b883");
    this.island(56, 14, "#b8a2d9");
    this.island(81, 10, "#a1d39b");
    this.buildGardenDetails();
    this.bridge(14, 0);
    this.bridge(42, 0);
    this.bridge(71, 0, 6);
    this.lung = this.place("lung", 0, 0, -4, 1.25);
    this.lung.rotation.y = -Math.PI / 3;
    this.sign("LUNG GARDEN", 0, -7, "#ceffcf");
    this.heart = this.place("heart", 28, 0, -6, 1.45);
    this.heart.rotation.y = -Math.PI / 3;
    this.sign("HEART ZONE", 28, -10, "#ffd5b1");
    this.brain = this.place("brain", 56, 0, -5, 1.5);
    this.sign("BRAIN ZONE", 56, -10, "#f6d9ff");
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.15 + i * Math.PI * 0.17;
      this.alveoli.push(
        this.place("alveoli", Math.cos(a) * 5, 0, Math.sin(a) * 5 - 1, 1.2),
      );
    }
    for (let i = 0; i < 4; i++) {
      const g = this.place("platform", 22 + i * 4, 0.6, 0);
      this.platforms.push({
        g,
        x: g.position.x,
        z: 0,
        prev: new T.Vector3(),
        phase: i * 0.9,
      });
    }
    // The shallow channel is a safe teaching obstacle; falling respawns at the Heart checkpoint.
    for (const z of [-4.2, 4.2])
      tube(
        this.scene,
        "#ec855c",
        [
          [19, 0.05, z],
          [26, 0.05, z],
          [37, 0.05, z],
        ],
        0.16,
      );
    for (let i = 0; i < 6; i++) {
      const x = 49 + i * 2.5,
        z = i % 2 ? 5 : 7;
      this.place(i % 2 ? "buildingA" : "buildingB", x, 0, z, 0.75);
      tube(
        this.scene,
        "#f2afe9",
        [
          [x, 1, z],
          [x + 1, 1.5, z - 1],
          [x + 2, 1, z],
        ],
        0.07,
      );
      ball(this.scene, "#ffd87a", x, 1.1, z, 0.18, 0.18, 0.18, 0.5);
    }
    for (let i = 0; i < 8; i++) {
      const g = new T.Group();
      const x = 50 + i * 1.9,
        z = 2.6 + Math.sin(i) * 0.5;
      ball(g, "#ffd384", 0, 0.6, 0, 0.23, 0.23, 0.23, 0.5);
      for (const s of [-1, 1])
        tube(
          g,
          "#b48cf6",
          [
            [0, 0.6, 0],
            [s * 0.5, 0.6, 0.3],
            [s * 0.9, 0.6, 0],
          ],
          0.07,
        );
      if (this.models.assets.has("neuron")) {
        g.clear();
        g.add(this.models.make("neuron"));
      }
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.neurons.push(g);
    }
    for (let i = 0; i < 2; i++) {
      const g = this.place(
        i ? "portalGreen" : "portalPurple",
        83,
        0,
        i ? 4 : -4,
        1,
      );
      g.rotation.y = -Math.PI / 2;
      this.portals.push(g);
    }
    for (const [x, c] of [
      [14, "#abf4bd"],
      [42, "#ffc89f"],
      [70, "#e8c4ff"],
    ]) {
      const g = new T.Group();
      g.position.set(x, 0, 0);
      for (const z of [-1.8, 1.8]) box(g, c, 0, 1.5, z, 0.13, 3, 0.13);
      const sheet = new T.Mesh(
        new T.PlaneGeometry(4, 3),
        new T.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.25,
          side: T.DoubleSide,
        }),
      );
      sheet.rotation.y = Math.PI / 2;
      sheet.position.y = 1.5;
      g.add(sheet);

      this.scene.add(g);
      this.gates.push(g);
    }
    const natureReady = buildNature(this);
    for (let i = 0; i < (natureReady ? 0 : 180); i++) {
      const zone = i % 4,
        xc = [0, 28, 56, 81][zone],
        r = zone === 3 ? 9 : 13,
        a = this.random() * Math.PI * 2,
        dist = 7 + this.random() * (r - 7),
        x = xc + Math.cos(a) * dist,
        z = Math.sin(a) * dist;
      if (Math.abs(z) < 3.3) continue;
      const key = i % 4 === 0 ? "rock" : "plant",
        g = this.place(key, x, 0, z, 0.5 + this.random() * 0.8);
      g.rotation.y = this.random() * 6.28;
      this.decorations.push(g);
      if (i % 8 === 0) {
        ball(
          this.scene,
          zone === 2 ? "#d19af5" : "#ffd1dc",
          x,
          1,
          z,
          0.8,
          0.75,
          0.8,
        );
        tube(
          this.scene,
          "#a89b7a",
          [
            [x, 0, z],
            [x, 1, z],
          ],
          0.15,
        );
      }
    }
    const water = new T.Mesh(
      new T.PlaneGeometry(240, 240),
      new T.MeshBasicMaterial({
        color: "#9bdced",
        transparent: true,
        opacity: 0.3,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(35, -19, 0);
    this.scene.add(water);
    for (let i = 0; i < 24; i++) {
      const g = new T.Group();
      g.position.set(
        this.random() * 170 - 40,
        -10 + this.random() * 5,
        this.random() * 100 - 50,
      );
      for (let j = 0; j < 4; j++)
        ball(g, "#edf7ff", j * 1.3, Math.sin(j), 0, 2, 1, 1.5);
      this.scene.add(g);
      this.clouds.push(g);
    }
    this.vape = this.place("vape", -10, 9, -8, 1.8);
    this.vape.rotation.z = -0.55;
    this.vape.visible = false;
    this.aerosol = new T.Group();
    for (let i = 0; i < 25; i++) {
      const m = ball(
        this.aerosol,
        ["#bcafff", "#ffb9df", "#99efff"][i % 3],
        (this.random() - 0.5) * 20,
        this.random() * 4,
        (this.random() - 0.5) * 12,
        0.7 + this.random() * 1.2,
      );
      m.material = new T.MeshStandardMaterial({
        color: m.material.color,
        transparent: true,
        opacity: 0.27,
        roughness: 1,
        depthWrite: false,
      });
    }
    this.aerosol.position.y = 7;
    this.scene.add(this.aerosol);
    this.aerosol.visible = false;
  }
  ground(x, z) {
    let floor = null;
    for (const [cx, r] of [
      [0, 14],
      [28, 14],
      [56, 14],
      [81, 10],
    ])
      if (Math.hypot(x - cx, z) < r - 0.1) floor = 0;
    if (
      (x >= 12 && x <= 16 && Math.abs(z) < 1.5) ||
      (x >= 40 && x <= 44 && Math.abs(z) < 1.5) ||
      (x >= 68 && x <= 74 && Math.abs(z) < 1.5)
    )
      floor = 0.12;
    if (x > 20 && x < 36.3 && Math.abs(z) < 3.8) floor = null;
    for (const p of this.platforms)
      if (
        Math.abs(x - p.g.position.x) < 1.5 &&
        Math.abs(z - p.g.position.z) < 1.5
      )
        floor = Math.max(floor ?? -100, p.g.position.y + 0.12);
    return floor;
  }
  setHealth(count) {
    this.alveoli.forEach((g, i) => {
      const damaged = i >= count;
      g.traverse((n) => {
        if (n.isMesh) {
          n.userData.healthyMaterial ??= n.material;
          n.material = damaged
            ? material("#685573")
            : n.userData.healthyMaterial;
        }
      });
      g.userData.damaged = damaged;
    });
  }
  update(dt, time, bpm, stage, mode) {
    if (this.meadowWind) this.meadowWind.value = time;
    this.heart.scale.setScalar(
      1.45 * (1 + Math.sin(((time * bpm) / 60) * 6.28) * 0.025),
    );
    this.lung.scale.setScalar(1.25 * (1 + Math.sin(time * 1.4) * 0.018));
    this.alveoli.forEach(
      (g, i) =>
        (g.scale.y =
          1.2 *
          (1 +
            Math.sin(time * 1.4 + i * 0.2) *
              (g.userData.damaged ? 0.008 : 0.04))),
    );
    for (const p of this.platforms) {
      p.prev.copy(p.g.position);
      p.g.position.z = Math.sin(time * (bpm / 72) * 0.48 + p.phase) * 0.85;
    }
    for (const g of this.portals) {
      const sw = g.userData.visual.userData.swirl;
      if (sw) sw.rotation.z += dt * (g === this.portals[0] ? 0.7 : -0.5);
    }
    this.neurons.forEach((g, i) =>
      g.scale.setScalar(1 + Math.sin(time * 2 + i) * 0.08),
    );
    for (const c of this.clouds) c.position.x += dt * 0.08;
    if (this.aerosol.visible) {
      this.aerosol.rotation.y += dt * 0.07;
      this.aerosol.position.y = 5.7 + Math.sin(time) * 0.4;
    }
    this.scene.background.set(
      mode === "crash"
        ? "#92a7bd"
        : stage === "BRAIN"
          ? "#aebde5"
          : stage === "ENDING_LOOP"
            ? "#a4a3c4"
            : "#99d4ef",
    );
    this.scene.fog.color.copy(this.scene.background);
  }
}
