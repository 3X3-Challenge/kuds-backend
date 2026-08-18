import { z } from "zod";

export const submitArtworkSchema = z.object({
  patternKey: z.string().min(1).max(64),
  /** 0–100, khớp CHECK bên SQL. */
  score: z.number().int().min(0).max(100),
  /**
   * Nét vẽ để dựng lại bức tranh trong sổ tay. Bỏ trống = chỉ lưu điểm.
   * Chặn kích thước ở tầng Fastify (bodyLimit), không phải ở đây.
   */
  strokes: z.unknown().optional(),
});
export type SubmitArtworkInput = z.infer<typeof submitArtworkSchema>;

export const artworkQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().regex(/^\d+$/).optional(),
});
export type ArtworkQuery = z.infer<typeof artworkQuerySchema>;
