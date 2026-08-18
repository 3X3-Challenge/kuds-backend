import { z } from "zod";

/**
 * Client gửi kèm version nó đang giữ. Bằng version hiện tại ⇒ 304, khỏi tải lại
 * vài trăm KB danh mục mỗi lần mở game.
 *
 * version là bigint nên nhận CHUỖI, không phải số: qua 2^53 thì z.coerce.number()
 * làm tròn và hai version khác nhau bỗng bằng nhau.
 */
export const catalogQuerySchema = z.object({
  version: z.string().regex(/^\d+$/, "version phải là số nguyên").optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
