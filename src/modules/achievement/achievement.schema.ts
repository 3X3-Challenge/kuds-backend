import { z } from "zod";

export const achievementParamsSchema = z.object({
  achievementKey: z.string().min(1).max(64),
});
export type AchievementParams = z.infer<typeof achievementParamsSchema>;

/**
 * delta là số nguyên, và có thành tựu đếm bằng đồng ("Tích lũy tiêu 700.000Đ"),
 * nên trần phải rộng. Vẫn có trần: không trần thì một request duy nhất mở khoá
 * được mọi thành tựu.
 */
export const achievementProgressSchema = z.object({
  delta: z.number().int().min(1).max(1_000_000_000),
});
export type AchievementProgressInput = z.infer<typeof achievementProgressSchema>;
