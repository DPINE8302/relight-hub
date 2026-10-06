import QRCode from "qrcode";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "https://relight-web-two.vercel.app";
await mkdir("public/qr", { recursive: true });
for (const [name, route] of [["education", "/play"], ["after-film", "/after"], ["responses", "/wall"]]) {
  const options = { errorCorrectionLevel: "M", margin: 4, width: 1000, color: { dark: "#070b17", light: "#ffffff" } };
  await QRCode.toFile(`public/qr/${name}.png`, `${origin}${route}`, options);
  await writeFile(`public/qr/${name}.svg`, await QRCode.toString(`${origin}${route}`, { ...options, type: "svg" }));
  console.log(`${name}: ${origin}${route}`);
}
