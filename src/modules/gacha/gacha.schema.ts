import { z } from "zod";

export const bannerParamsSchema = z.object({
  bannerKey: z.string().min(1).max(64),
});
export type BannerParams = z.infer<typeof bannerParamsSchema>;

export const pullSchema = z.object({
  /** Đúng hai nút trong game: quay 1 và quay 10. */
  count: z.union([z.literal(1), z.literal(10)]).default(1),
  /**
   * BẮT BUỘC, khác mọi endpoint khác.
   *
   * Quay gacha tốn tiền có thể là tiền thật. Mạng chập chờn khiến client gửi lại
   * request là chuyện xảy ra hằng ngày, và không có khoá này thì lần gửi lại
   * trừ tiền lần hai. Client sinh một UUID cho MỖI lần người chơi bấm nút, và
   * dùng lại đúng chuỗi đó cho mọi lần thử lại của cùng cú bấm ấy.
   */
  idempotencyKey: z.string().min(8).max(128),
});
export type PullInput = z.infer<typeof pullSchema>;

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().regex(/^\d+$/).optional(),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
