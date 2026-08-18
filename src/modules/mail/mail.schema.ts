import { z } from "zod";

export const mailListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** mailId của dòng cuối trang trước (bigint ⇒ chuỗi). */
  cursor: z.string().regex(/^\d+$/).optional(),
  /** Mặc định ẩn thư đã nhận thưởng để hòm thư gọn; bật lên để xem lại lịch sử. */
  includeClaimed: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .default(false),
});
export type MailListQuery = z.infer<typeof mailListQuerySchema>;

export const mailParamsSchema = z.object({
  mailId: z.string().regex(/^\d+$/, "mailId phải là số"),
});
export type MailParams = z.infer<typeof mailParamsSchema>;
