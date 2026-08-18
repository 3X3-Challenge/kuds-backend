import { z } from "zod";
import { CurrencyCode } from "@prisma/client";

export const playerListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /** Khớp uid (12 số) hoặc tên hiển thị. */
  q: z.string().trim().max(64).optional(),
  status: z.enum(["active", "banned", "deleted"]).optional(),
});
export type PlayerListQuery = z.infer<typeof playerListQuerySchema>;

export const playerIdParamsSchema = z.object({
  playerId: z.string().uuid("playerId phải là UUID"),
});
export type PlayerIdParams = z.infer<typeof playerIdParamsSchema>;

export const banSchema = z.object({
  /** null = cấm vĩnh viễn. Ràng buộc bên SQL: chỉ account bị cấm mới được mang hạn cấm. */
  bannedUntil: z.coerce.date().nullable().default(null),
  reason: z.string().trim().min(1).max(500),
});
export type BanInput = z.infer<typeof banSchema>;

export const adjustCurrencySchema = z.object({
  currency: z.nativeEnum(CurrencyCode),
  /** Âm là trừ, dương là cộng. Không nhận 0 — CHECK (delta <> 0) bên SQL. */
  delta: z.number().int().refine((v) => v !== 0, "delta phải khác 0"),
  reason: z.string().trim().min(1).max(500),
});
export type AdjustCurrencyInput = z.infer<typeof adjustCurrencySchema>;

export const grantItemSchema = z.object({
  itemKey: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(9999),
});
export type GrantItemInput = z.infer<typeof grantItemSchema>;

/**
 * Thư GM.
 *
 * Phần thưởng KHÔNG nhập tự do được — phải trỏ tới một gói thưởng có sẵn qua
 * `bundleKey`. Đó là ràng buộc của lược đồ, không phải lựa chọn thiết kế ở đây:
 *
 *   CHECK ((bundle_id IS NULL) = (reward_snapshot IS NULL))
 *   CHECK (claimed_at IS NULL OR bundle_id IS NOT NULL)
 *
 * Postgres từ chối thẳng một lá thư có bản chụp thưởng mà không có gói nguồn.
 * Lý do đứng sau nó: `reward_snapshot` là thứ TRẢ cho người chơi, còn `bundle_id`
 * là thứ trả lời được "phần thưởng này từ đâu ra" khi cần đối soát sáu tháng sau.
 * Thưởng gõ tay thẳng vào thư sẽ không có câu trả lời đó.
 *
 * Nên muốn gửi một combo thưởng mới: tạo gói ở /admin/content/reward-bundles
 * trước, rồi gửi thư trỏ vào nó.
 */
export const sendMailSchema = z
  .object({
    /**
     * Danh sách playerId nhận thư. Bỏ trống + broadcast = true ⇒ gửi cho tất cả.
     * Bắt khai báo broadcast tường minh: gửi nhầm cho toàn server không có nút
     * hoàn tác.
     */
    playerIds: z.array(z.string().uuid()).max(500).default([]),
    broadcast: z.boolean().default(false),
    title: z.string().trim().min(1).max(200),
    sender: z.string().trim().max(128).default("Ban Quản Trị"),
    /** Hỗ trợ token {player_name} như mẫu thư. */
    body: z.string().trim().max(4000).default(""),
    /** null = thư thông báo thuần, không đính kèm gì. */
    bundleKey: z.string().min(1).max(64).nullable().default(null),
    /** Số ngày sống của thư. null = không hết hạn. */
    expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  })
  .refine((v) => v.broadcast || v.playerIds.length > 0, {
    message: "Phải chọn ít nhất một người chơi, hoặc bật broadcast",
    path: ["playerIds"],
  })
  .refine((v) => !(v.broadcast && v.playerIds.length > 0), {
    message: "broadcast và playerIds loại trừ nhau",
    path: ["broadcast"],
  });
export type SendMailInput = z.infer<typeof sendMailSchema>;
