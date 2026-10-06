import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const names = [
  "CommonTree_1",
  "Bush_Common_Flowers",
  "Plant_1",
  "Rock_Medium_1",
  "Flower_3_Group",
];
export async function loadNature() {
  const loader = new GLTFLoader(),
    assets = new Map();
  await Promise.all(
    names.map(async (name) => {
      try {
        const asset = await loader.loadAsync(
          import.meta.env.BASE_URL + "nature/" + name + ".gltf",
        );
        assets.set(name, asset.scene);
      } catch (error) {
        console.warn("Nature fallback:", name, error.message);
      }
    }),
  );
  return assets;
}
function tintedMaterial(source, zone) {
  const mat = source.clone(),
    name = source.name ?? "";
  const leaves = ["#88bd60", "#a6c56b", "#a99bd8", "#83c87c"],
    flowers = ["#ffb6ce", "#ffe2a1", "#dfaaff", "#d2f1b6"];
  mat.color.set(
    /Bark/i.test(name)
      ? "#98765c"
      : /Rock/i.test(name)
        ? "#9c91a8"
        : /Flower/i.test(name)
          ? flowers[zone]
          : leaves[zone],
  );
  mat.roughness = 0.68;
  mat.metalness = 0;
  mat.vertexColors = false;
  // Neutralise map colour in the shader, retaining the original leaf silhouette/alpha.
  if (mat.map) {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
 vec4 sampledDiffuseColor = texture2D(map,vMapUv);
 sampledDiffuseColor.rgb=vec3(.65+.35*dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722)));
 diffuseColor*=sampledDiffuseColor;
 #endif`,
      );
    };
    mat.customProgramCacheKey = () => "puff-neutral-leaf";
  }
  return mat;
}
export function buildNature(world) {
  const assets = world.models.nature;
  if (assets?.size !== names.length) return false;
  for (let zone = 0; zone < 4; zone++) {
    const cx = [0, 28, 56, 81][zone],
      r = zone === 3 ? 8 : 12;
    const placement = new Map(names.map((n) => [n, []]));
    for (const [dx, dz, h] of [
      [-0.64, 0.55, 3.8],
      [0.64, 0.57, 4.3],
      [0.68, -0.57, 3.5],
    ])
      placement.get("CommonTree_1").push([cx + dx * r, dz * r, h]);
    for (let i = 0; i < 38; i++) {
      const a = world.random() * Math.PI * 2,
        d = 4 + world.random() * (r - 4),
        x = cx + Math.cos(a) * d,
        z = Math.sin(a) * d;
      if (
        Math.abs(z) < 3.8 ||
        (zone === 1 && Math.abs(z) < 5) ||
        (zone === 2 && z > -1 && z < 5.4) ||
        world.ground(x, z) === null
      )
        continue;
      const key = names[1 + (i % 4)],
        height =
          key === "Rock_Medium_1"
            ? 0.8
            : key === "Bush_Common_Flowers"
              ? 1.3
              : key === "Flower_3_Group"
                ? 0.65
                : 0.7;
      placement.get(key).push([x, z, height * (0.8 + world.random() * 0.4)]);
    }
    for (const [name, positions] of placement) {
      if (!positions.length) continue;
      const source = assets.get(name);
      source.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(source),
        center = bounds.getCenter(new T.Vector3()),
        height = bounds.max.y - bounds.min.y;
      source.traverse((node) => {
        if (!node.isMesh) return;
        const geometry = node.geometry.clone();
        geometry.applyMatrix4(node.matrixWorld);
        geometry.translate(-center.x, -bounds.min.y, -center.z);
        geometry.scale(1 / height, 1 / height, 1 / height);
        const mat = tintedMaterial(node.material, zone),
          mesh = new T.InstancedMesh(geometry, mat, positions.length),
          dummy = new T.Object3D();
        positions.forEach(([x, z, size], i) => {
          dummy.position.set(x, 0, z);
          dummy.scale.setScalar(size);
          dummy.rotation.y = i * 2.4;
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.highCount = positions.length;
        mesh.name = "puff-nature:" + name;
        world.scene.add(mesh);
        world.decorations.push(mesh);
      });
    }
  }
  return true;
}
