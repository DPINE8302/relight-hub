import * as T from "three";

// Batched, deterministic meadow dressing; the center paths stay clear.
export function buildMeadows(world) {
  const positions = [];
  for (const [cx, r] of [
    [0, 13],
    [28, 13],
    [56, 13],
    [81, 9],
  ]) {
    for (let i = 0; i < 180; i++) {
      const a = world.random() * Math.PI * 2,
        d = Math.sqrt(world.random()) * r;
      const x = cx + Math.cos(a) * d,
        z = Math.sin(a) * d;
      if (
        Math.abs(z) < 2.8 ||
        (cx === 28 && Math.abs(x - 28) < 9 && Math.abs(z) < 4.7)
      )
        continue;
      if (world.ground(x, z) !== null) positions.push([x, z, cx]);
    }
  }
  const geometry = new T.SphereGeometry(1, 8, 6);
  const mat = new T.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.55,
    side: T.DoubleSide,
  });
  const wind = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.meadowTime = wind;
    shader.vertexShader = "uniform float meadowTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      transformed.x += sin(meadowTime*1.3 + instanceMatrix[3].x*.6 + instanceMatrix[3].z*.3)*position.y*.16;`,
    );
  };
  const blades = new T.InstancedMesh(geometry, mat, positions.length * 3);
  const dummy = new T.Object3D(),
    color = new T.Color();
  let n = 0;
  for (const [x, z, cx] of positions) {
    for (let k = 0; k < 3; k++) {
      dummy.position.set(
        x + Math.cos(k * 2.1) * 0.1,
        0.18,
        z + Math.sin(k * 2.1) * 0.1,
      );
      dummy.rotation.y = (k * Math.PI) / 3 + world.random();
      dummy.scale.set(0.09, 0.17 + world.random() * 0.13, 0.07);
      dummy.updateMatrix();
      blades.setMatrixAt(n, dummy.matrix);
      color.set(cx === 56 ? "#b69bdf" : cx === 28 ? "#b8c779" : "#86bc6c");
      color.multiplyScalar(0.8 + world.random() * 0.4);
      blades.setColorAt(n++, color);
    }
  }
  blades.receiveShadow = true;
  world.scene.add(blades);
  const flowerPositions = positions.filter((_, i) => i % 9 === 0);
  const flowerGeo = new T.IcosahedronGeometry(0.1, 1);
  const flowers = new T.InstancedMesh(
    flowerGeo,
    new T.MeshStandardMaterial({ color: "#fff1c9", roughness: 1 }),
    flowerPositions.length * 5,
  );
  n = 0;
  for (const [x, z] of flowerPositions) {
    const c = ["#fff1cb", "#f3aabc", "#b5dcff"][n % 3];
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5;
      dummy.position.set(x + Math.cos(a) * 0.11, 0.28, z + Math.sin(a) * 0.11);
      dummy.rotation.set(0, a, 0);
      dummy.scale.set(1, 0.5, 1);
      dummy.updateMatrix();
      flowers.setMatrixAt(n, dummy.matrix);
      flowers.setColorAt(n++, new T.Color(c));
    }
  }
  world.scene.add(flowers);
  const motes = new T.BufferGeometry();
  const data = [];
  for (let i = 0; i < 120; i++)
    data.push(
      world.random() * 100 - 12,
      1 + world.random() * 8,
      (world.random() - 0.5) * 24,
    );
  motes.setAttribute("position", new T.Float32BufferAttribute(data, 3));
  const dust = new T.Points(
    motes,
    new T.PointsMaterial({
      color: "#fff6d2",
      size: 0.06,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  world.scene.add(dust);
  world.meadowWind = wind;
  world.decorations.push(blades, flowers, dust);
}
