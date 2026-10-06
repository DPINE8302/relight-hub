import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Verifies create, durable write, atomic rename, and cleanup within the exact runtime root. */
export async function probeAtomicWritableRoot(root: string): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const probeId = `${process.pid}-${randomUUID()}`;
  const pendingPath = join(root, `.relight-storage-probe-${probeId}.pending`);
  const committedPath = join(root, `.relight-storage-probe-${probeId}.committed`);
  let file: Awaited<ReturnType<typeof open>> | null = null;
  try {
    file = await open(pendingPath, "wx", 0o600);
    await file.writeFile("RELight storage probe\n", "utf8");
    await file.sync();
    await file.close();
    file = null;
    await rename(pendingPath, committedPath);
    await unlink(committedPath);
  } finally {
    await file?.close().catch(() => undefined);
    await unlink(pendingPath).catch(() => undefined);
    await unlink(committedPath).catch(() => undefined);
  }
}

export async function probeAtomicWritableRoots(roots: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(roots.map((root) => probeAtomicWritableRoot(root)));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}
