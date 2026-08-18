import { z } from "zod";

/**
 * Số ô đất tối đa. Số ô THẬT do scene quyết định (thứ tự ô trong ruộng), lược đồ
 * không lưu ở đâu cả — nên đây chỉ là trần vệ sinh để không ai ghi plot_index
 * bằng 9 triệu. Đổi bố cục ruộng thì đổi luôn số này.
 */
export const MAX_FARM_PLOTS = 32;

export const plotParamsSchema = z.object({
  plotIndex: z.coerce.number().int().min(0).max(MAX_FARM_PLOTS - 1),
});
export type PlotParams = z.infer<typeof plotParamsSchema>;

export const plantSchema = z.object({
  cropKey: z.string().min(1).max(64),
});
export type PlantInput = z.infer<typeof plantSchema>;
