import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const file = await open(temporaryPath, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }

  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
