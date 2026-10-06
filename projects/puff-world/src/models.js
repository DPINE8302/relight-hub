import * as T from "three";
import { thai } from "./i18n";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
const mats = new Map(),
  sphere = new T.SphereGeometry(1, 24, 16),
  cube = new T.BoxGeometry(1, 1, 1);
export const material = (c, glow = 0) => {
  const k = c + ":" + glow;
  if (!mats.has(k))
    mats.set(
      k,
      new T.MeshStandardMaterial({
        color: c,
        roughness: 0.34,
        metalness: glow ? 0.2 : 0.05,
        emissive: c,
        emissiveIntensity: glow,
      }),
    );
  return mats.get(k);
};
export function ball(g, c, x, y, z, sx = 1, sy = sx, sz = sx, glow = 0) {
  const m = new T.Mesh(sphere, material(c, glow));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export function box(g, c, x, y, z, sx, sy, sz) {
  const m = new T.Mesh(cube, material(c));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export function tube(g, c, points, r = 0.2) {
  const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  const m = new T.Mesh(new T.TubeGeometry(curve, 20, r, 8, false), material(c));
  m.castShadow = true;
  g.add(m);
  return m;
}
export function ring(g, c, x, y, z, r = 0.6, width = 0.1) {
  const m = new T.Mesh(new T.TorusGeometry(r, width, 8, 40), material(c, 0.35));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
export function label(text, color = "#fff", size = 1) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(18,34,54,.86)";
  ctx.beginPath();
  ctx.roundRect(5, 5, 1014, 246, 55);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const translated = thai(text);
  ctx.font = 'bold 70px "LINE Seed Sans TH", "Avenir Next", sans-serif';
  ctx.fillText(translated, 512, 132, 940);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: true }));
  s.scale.set(size * 4, size, 1);
  return s;
}
export const factories = {
  airy() {
    const g = new T.Group();
    ball(g, "#fcf8ff", 0, 1.25, 0, 0.72, 0.68, 0.55);
    for (const [x, y, s] of [
      [-0.65, 1.15, 0.38],
      [0.65, 1.15, 0.38],
      [-0.4, 1.62, 0.4],
      [0.35, 1.67, 0.43],
      [0.05, 1.99, 0.34],
    ])
      ball(g, "#fcf8ff", x, y, 0, s);
    ball(g, "#fcf8ff", 0.22, 2.17, 0, 0.2);
    const curl = [];
    for (let i = 0; i < 20; i++) {
      const a = i * 0.19;
      curl.push([0.12 + Math.sin(a) * 0.25, 2.12 + (1 - Math.cos(a)) * 0.2, 0]);
    }
    tube(g, "#fcf8ff", curl, 0.16);
    ball(g, "#ffffff", 0, 0.55, 0, 0.48, 0.5, 0.38);
    const legs = [];
    legs.push(
      ball(g, "#e3dffc", -0.25, 0.15, 0.02, 0.22, 0.25, 0.26),
      ball(g, "#e3dffc", 0.25, 0.15, 0.02, 0.22, 0.25, 0.26),
    );
    const arms = [];
    arms.push(
      ball(g, "#ffffff", -0.57, 0.65, 0.03, 0.23, 0.36, 0.22),
      ball(g, "#ffffff", 0.57, 0.65, 0.03, 0.23, 0.36, 0.22),
    );
    for (const x of [-0.28, 0.28]) {
      ball(g, "#171537", x, 1.4, 0.5, 0.115, 0.18, 0.06);
      ball(g, "#ffffff", x - 0.027, 1.47, 0.555, 0.033);
      ball(g, "#f991c5", x * 1.55, 1.16, 0.45, 0.12, 0.08, 0.05);
    }
    ball(g, "#5c244c", 0, 1.12, 0.53, 0.14, 0.1, 0.02);
    ring(g, "#68edff", 0, 0.58, 0.38, 0.19, 0.05);
    box(g, "#4164ce", 0, 0.75, -0.43, 0.58, 0.65, 0.28);
    ring(g, "#69edff", 0, 0.8, -0.59, 0.18, 0.05);
    g.userData = { legs, arms };
    return g;
  },
  lung() {
    const g = new T.Group();
    for (const side of [-1, 1]) {
      ball(g, "#fa829e", side * 1.25, 2.7, 0, 1.25, 2.3, 0.95);
      ball(g, "#ed6886", side * 1.6, 1.1, 0.1, 0.7, 0.7, 0.7);
      tube(
        g,
        "#ffb0b6",
        [
          [0, 4.5, 0],
          [0, 3.8, 0.4],
          [side * 0.7, 3.1, 0.7],
          [side * 1.3, 2.6, 0.83],
        ],
        0.23,
      );
      for (let i = 0; i < 8; i++) {
        const a = i * 2.399;
        ball(
          g,
          "#ff9cad",
          side * 1.2 + Math.cos(a) * 0.6,
          1.7 + i * 0.3,
          0.8,
          0.24,
          0.33,
          0.15,
        );
      }
    }
    tube(
      g,
      "#f78394",
      [
        [0, 3.8, 0],
        [0, 5.6, 0],
      ],
      0.32,
    );
    for (let i = 0; i < 8; i++) {
      const r = ring(g, "#ffadba", 0, 3.9 + i * 0.21, 0, 0.34, 0.05);
      r.rotation.x = Math.PI / 2;
    }
    return g;
  },
  alveoli() {
    const g = new T.Group();
    tube(
      g,
      "#e87894",
      [
        [0, 0, 0],
        [0.1, 0.7, 0],
        [0, 1.3, 0],
      ],
      0.14,
    );
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 6;
      ball(
        g,
        "#ffabc2",
        Math.cos(a) * 0.38,
        1.2 + Math.sin(a) * 0.36,
        Math.sin(i) * 0.17,
        0.32,
      );
    }
    return g;
  },
  heart() {
    const g = new T.Group();
    ball(g, "#f46870", 0, 2.3, 0, 1.8, 1.8, 1.4);
    ball(g, "#fa7480", -0.8, 3.15, 0, 1);
    ball(g, "#fa7480", 0.8, 3.15, 0, 1);
    ring(g, "#bec7cf", 0, 2.3, 1.35, 1.03, 0.16);
    ball(g, "#ffcc58", 0, 2.3, 1.4, 0.8, 0.8, 0.12, 0.7);
    const heartShape = new T.Shape();
    heartShape.moveTo(0, -0.5);
    heartShape.bezierCurveTo(-0.15, -0.3, -0.7, 0.1, -0.52, 0.43);
    heartShape.bezierCurveTo(-0.35, 0.7, -0.08, 0.57, 0, 0.34);
    heartShape.bezierCurveTo(0.08, 0.57, 0.35, 0.7, 0.52, 0.43);
    heartShape.bezierCurveTo(0.7, 0.1, 0.15, -0.3, 0, -0.5);
    const h = new T.Mesh(
      new T.ExtrudeGeometry(heartShape, {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
      }),
      material("#fff5ac", 0.65),
    );
    h.position.set(0, 2.22, 1.57);
    g.add(h);
    for (const side of [-1, 1]) {
      tube(
        g,
        side < 0 ? "#398bdc" : "#f4675f",
        [
          [side * 0.7, 3.5, 0],
          [side * 1.1, 4.4, 0],
          [side * 1.8, 4.5, 0],
          [side * 2.2, 3.8, 0],
        ],
        0.3,
      );
      tube(
        g,
        side < 0 ? "#f4675f" : "#398bdc",
        [
          [side * 1.3, 2.8, 0],
          [side * 2.2, 2.5, 0],
          [side * 2.5, 1, 0],
          [side * 1.6, 0.3, 0],
        ],
        0.24,
      );
      ring(g, "#d6d6c9", side * 1.5, 2.5, 0.9, 0.43, 0.1);
      ball(g, "#ffd963", side * 1.5, 2.5, 1, 0.26, 0.26, 0.1, 0.6);
    }
    return g;
  },
  brain() {
    const g = new T.Group();
    for (let i = 0; i < 20; i++) {
      const a = i * 2.399;
      ball(
        g,
        i % 2 ? "#e994d3" : "#c891e6",
        Math.cos(a) * (i < 10 ? 1.5 : 2),
        1.2 + (i % 4) * 0.35,
        Math.sin(a) * 1.4,
        0.8,
        0.65,
        0.65,
      );
    }
    const dome = new T.Mesh(
      new T.SphereGeometry(2.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshPhysicalMaterial({
        color: "#d6ccff",
        transparent: true,
        opacity: 0.18,
        roughness: 0.12,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    dome.position.y = 2.2;
    g.add(dome);
    const r = ring(g, "#83d4ff", 0, 2.2, 0, 2.6, 0.09);
    r.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const a = i * 2.399;
      const b = factories[i % 2 ? "buildingA" : "buildingB"]();
      b.scale.setScalar(0.65);
      b.position.set(Math.cos(a) * 1.5, 2.2, Math.sin(a) * 1.5);
      g.add(b);
    }
    return g;
  },
  buildingA() {
    const g = new T.Group();
    box(g, "#8b6bd2", 0, 1.2, 0, 0.85, 2.4, 0.85);
    ball(g, "#c088ee", 0, 2.4, 0, 0.6, 0.5, 0.6);
    for (let i = 0; i < 3; i++)
      box(g, "#f9d582", 0, 0.55 + i * 0.55, 0.44, 0.24, 0.32, 0.03);
    ring(g, "#ffaeed", 0, 2.2, 0, 0.6, 0.08).rotation.x = Math.PI / 2;
    return g;
  },
  buildingB() {
    const g = factories.buildingA();
    g.scale.set(0.7, 1.4, 0.7);
    const r = ring(g, "#ffd686", 0, 2.5, 0, 0.95, 0.09);
    r.rotation.x = 1.2;
    return g;
  },
  nicotine() {
    const g = new T.Group();
    ball(g, "#ffcd54", 0, 0.45, 0, 0.43, 0.43, 0.43, 0.5);
    for (let i = 0; i < 3; i++) {
      const r = ring(g, "#fff4ba", 0, 0.45, 0, 0.35, 0.035);
      r.rotation.set(i * 0.7, i * 0.9, i * 0.4);
    }
    return g;
  },
  toxic() {
    const g = new T.Group();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399;
      ball(
        g,
        "#403c56",
        Math.cos(a) * 0.23,
        0.4 + Math.sin(a) * 0.22,
        Math.sin(i) * 0.2,
        0.24,
      );
    }
    for (const s of [-1, 1])
      ball(g, "#ffda57", s * 0.12, 0.45, 0.28, 0.08, 0.06, 0.03, 0.6);
    return g;
  },
  metal() {
    const g = new T.Group();
    const b = box(g, "#96a5ba", 0, 0.45, 0, 0.6, 0.6, 0.6);
    b.rotation.set(0.2, 0.4, 0.3);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      box(
        g,
        "#d2d8dc",
        Math.cos(a) * 0.5,
        0.5 + Math.sin(a) * 0.45,
        0,
        0.14,
        0.14,
        0.14,
      );
    }
    return g;
  },
  chemical() {
    const g = new T.Group();
    ball(g, "#81d949", 0, 0.4, 0, 0.35, 0.3, 0.35, 0.1);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25;
      ball(g, "#a2ec56", Math.cos(a) * 0.35, 0.4 + Math.sin(a) * 0.32, 0, 0.19);
    }
    return g;
  },
  platform() {
    const g = new T.Group();
    box(g, "#817b93", 0, -0.4, 0, 3, 0.8, 3);
    box(g, "#ffc178", 0, 0.02, 0, 3.1, 0.12, 3.1);
    for (const x of [-1.35, 1.35])
      for (const z of [-1.35, 1.35]) ball(g, "#ddd0b0", x, 0.1, z, 0.12);
    return g;
  },
  rock() {
    const g = new T.Group();
    const m = new T.Mesh(
      new T.DodecahedronGeometry(0.7, 0),
      material("#9a939a"),
    );
    m.scale.set(1, 1.3, 0.8);
    m.position.y = 0.6;
    m.castShadow = true;
    g.add(m);
    ball(g, "#95c770", 0, 1.1, 0, 0.5, 0.12, 0.4);
    return g;
  },
  plant() {
    const g = new T.Group();
    for (let i = 0; i < 5; i++) {
      const a = i * 1.256;
      const leaf = ball(
        g,
        i % 2 ? "#9cce68" : "#69b37a",
        Math.cos(a) * 0.3,
        0.4,
        Math.sin(a) * 0.3,
        0.12,
        0.5,
        0.2,
      );
      leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
    return g;
  },
  portalPurple() {
    return portal("#b778ff", "ONE MORE");
  },
  portalGreen() {
    return portal("#85ffbd", "WALK AWAY");
  },
  vape() {
    const g = new T.Group();
    box(g, "#735cd4", 0, 1.5, 0, 0.7, 2.7, 0.45);
    box(g, "#24263e", 0, 3, 0, 0.55, 0.5, 0.35);
    ring(g, "#9bedff", 0, 1.8, 0.24, 0.2, 0.04);
    return g;
  },
};
function portal(c, title) {
  const g = new T.Group();
  for (let i = 0; i < 17; i++) {
    const a = (i * Math.PI * 2) / 17;
    const m = box(
      g,
      "#89839d",
      Math.cos(a) * 1.8,
      2.5 + Math.sin(a) * 2.3,
      0,
      0.62,
      0.6,
      0.6,
    );
    m.rotation.z = a;
  }
  const d = new T.Mesh(
    new T.CircleGeometry(1.7, 64),
    new T.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.85,
      side: T.DoubleSide,
    }),
  );
  d.position.set(0, 2.5, 0.03);
  d.scale.y = 1.3;
  g.add(d);
  const swirl = new T.Group();
  for (let i = 0; i < 4; i++) {
    const pts = [];
    for (let j = 0; j < 30; j++) {
      const a = j * 0.22 + (i * Math.PI) / 2,
        r = j * 0.047;
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 1.3, 0]);
    }
    const light = tube(swirl, c, pts, 0.055);
    light.material = new T.MeshBasicMaterial({ color: c, toneMapped: false });
  }
  swirl.position.set(0, 2.5, 0.07);
  g.add(swirl);
  const l = label(title, c, 1);
  l.position.set(0, 5.25, 0);
  g.add(l);
  g.userData.swirl = swirl;
  return g;
}
export class Models {
  constructor() {
    this.manifest = {};
    this.assets = new Map();
    this.templates = new Map();
    this.mixers = [];
    this.errors = [];
  }
  async init() {
    this.manifest = await fetch(
      import.meta.env.BASE_URL + "models/manifest.json",
    ).then((r) => r.json());
    const loader = new GLTFLoader();
    await Promise.all(
      Object.entries(this.manifest)
        .filter(([, v]) => v)
        .map(async ([k, v]) => {
          try {
            const entry = typeof v === "string" ? { url: v } : v;
            const asset = await loader.loadAsync(
              import.meta.env.BASE_URL + entry.url.replace(/^\//, ""),
            );
            this.assets.set(k, { asset, entry });
          } catch (e) {
            this.errors.push(k);
            console.warn("Model fallback:", k, e.message);
          }
        }),
    );
  }
  make(key) {
    const slot = new T.Group();
    slot.name = "model:" + key;
    const loaded = this.assets.get(key);
    if (loaded) {
      const model = clone(loaded.asset.scene);
      const bounds = new T.Box3().setFromObject(model),
        size = bounds.getSize(new T.Vector3()),
        center = bounds.getCenter(new T.Vector3());
      const heights = {
        floatingIsland: 10,
        heartIsland: 10,
        bridge: 1.3,
        neuron: 1.1,
        airy: 2.4,
        lung: 5.6,
        heart: 4.6,
        brain: 4.8,
        portalPurple: 5.6,
        portalGreen: 5.6,
        alveoli: 1.8,
        buildingA: 3,
        buildingB: 3.8,
      };
      const s =
        (loaded.entry.height || heights[key] || 1.5) / Math.max(size.y, 0.001);
      model.scale.setScalar(s);
      model.position.set(-center.x * s, -bounds.min.y * s, -center.z * s);
      model.rotation.y = loaded.entry.rotationY || 0;
      model.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      slot.add(model);
      if (loaded.asset.animations.length) {
        const mixer = new T.AnimationMixer(model);
        this.mixers.push(mixer);
        slot.userData.mixer = mixer;
        mixer.clipAction(loaded.asset.animations[0]).play();
      }
    } else {
      if (
        !this.templates.has(key) &&
        [
          "nicotine",
          "toxic",
          "metal",
          "chemical",
          "rock",
          "plant",
          "platform",
          "buildingA",
          "buildingB",
        ].includes(key)
      )
        this.templates.set(key, factories[key]());
      slot.add(
        this.templates.has(key)
          ? this.templates.get(key).clone(true)
          : factories[key](),
      );
    }
    slot.userData.visual = slot.children[0];
    return slot;
  }
  release(root) {
    if (!root) return;
    const mixer = root.userData.mixer;
    if (mixer) {
      mixer.stopAllAction();
      mixer.uncacheRoot(mixer.getRoot());
      this.mixers = this.mixers.filter((m) => m !== mixer);
    }
    // Only per-instance captions are owned here. Cached model geometry stays reusable.
    root.traverse((n) => {
      if (n.userData.transientLabel) {
        n.material.map.dispose();
        n.material.dispose();
      }
    });
    root.removeFromParent();
  }
  update(dt) {
    for (const m of this.mixers) m.update(dt);
  }
}
