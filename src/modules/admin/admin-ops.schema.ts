import { z } from "zod";

export const publishSchema = z.object({
  /**
   * Bỏ qua các lỗi tìm thấy lúc kiểm tra và xuất bản bằng mọi giá.
   *
   * Cố ý làm cho khó bấm nhầm: mặc định false, và mọi lần dùng đều nằm trong
   * nhật ký. Có lúc thật sự cần (nội dung sửa dở, cần đẩy gấp một bản vá khác),
   * nhưng phải là một quyết định có ý thức chứ không phải nút bấm quen tay.
   */
  force: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
});
export type PublishInput = z.infer<typeof publishSchema>;

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().regex(/^\d+$/).optional(),
  tableName: z.string().max(64).optional(),
  rowKey: z.string().max(128).optional(),
  adminId: z.string().uuid().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
