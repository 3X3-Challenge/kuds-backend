import { z } from "zod";
import { PublishStatus } from "@prisma/client";

export const resourceParamsSchema = z.object({
  resource: z.string().min(1).max(64),
});
export type ResourceParams = z.infer<typeof resourceParamsSchema>;

export const resourceIdParamsSchema = z.object({
  resource: z.string().min(1).max(64),
  /** Khoá chuỗi hoặc số tuỳ bảng — tầng repository ép kiểu theo sổ đăng ký. */
  id: z.string().min(1).max(128),
});
export type ResourceIdParams = z.infer<typeof resourceIdParamsSchema>;

/**
 * Trang quản trị dùng OFFSET chứ không con trỏ như phía game: bảng danh mục có
 * số dòng nhỏ và cố định, còn admin cần nhảy thẳng tới trang 7 và thấy tổng số.
 */
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /** Bỏ trống = xem tất cả, kể cả bản nháp và bản lưu trữ. */
  status: z.nativeEnum(PublishStatus).optional(),
  q: z.string().trim().max(128).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
