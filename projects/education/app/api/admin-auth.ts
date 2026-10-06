import { timingSafeEqual } from "node:crypto";
export function adminAllowed(request: Request) {
  const expected = process.env.WALL_ADMIN_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  return Boolean(expected && supplied && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}
