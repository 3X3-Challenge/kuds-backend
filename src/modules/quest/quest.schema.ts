import { z } from "zod";

export const questParamsSchema = z.object({
  questKey: z.string().min(1).max(64),
});
export type QuestParams = z.infer<typeof questParamsSchema>;

/**
 * Báo tiến độ. Nhận NHIỀU mục tiêu một lần vì một hành động trong game thường
 * đẩy nhiều mục tiêu cùng lúc (nhặt dừa nước vừa tính "thu thập" vừa tính
 * "sở hữu").
 *
 * `delta` chứ không phải giá trị tuyệt đối: client gửi "vừa nhặt thêm 1" chứ
 * không gửi "tôi đang có 3". Gửi tuyệt đối là mời client tự khai tiến độ.
 */
export const questProgressSchema = z.object({
  objectives: z
    .array(
      z.object({
        ordinal: z.number().int().min(0).max(32767),
        delta: z.number().int().min(1).max(100000),
      }),
    )
    .min(1)
    .max(16),
});
export type QuestProgressInput = z.infer<typeof questProgressSchema>;
