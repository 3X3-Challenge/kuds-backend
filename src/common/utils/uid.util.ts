import { randomInt } from "node:crypto";

/** Player-facing display ID, e.g. "000000000001". Distinct from the internal UUID `id`. */
export function generateUid(): string {
  return randomInt(0, 1_000_000_000_000).toString().padStart(12, "0");
}
