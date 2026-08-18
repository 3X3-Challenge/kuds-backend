import { z } from "zod";

/**
 * Điểm lưu do client gửi lên. Chặn NaN/Infinity: cột là `real` của Postgres,
 * nhận được NaN thì mọi phép so sánh vị trí về sau đều trả false và nhân vật
 * "biến mất" theo cách không debug nổi.
 */
const coord = z.number().finite();

export const saveSchema = z.object({
  sceneName: z.string().min(1).max(64).default("MainScene"),
  posX: coord.default(0),
  posY: coord.default(0),
  posZ: coord.default(0),
  /** Độ. Nhận mọi giá trị rồi tự chuẩn hoá về [0, 360) ở service. */
  yaw: coord.default(0),
  /** DayNightCycle.timeOfDay — đúng thang 0–24 của script, không phải giờ thực. */
  dayTime: z.number().finite().min(0).max(24).default(0),
});
export type SaveInput = z.infer<typeof saveSchema>;

export const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** entryId của dòng cuối trang trước. bigint nên nhận chuỗi. */
  cursor: z.string().regex(/^\d+$/).optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
