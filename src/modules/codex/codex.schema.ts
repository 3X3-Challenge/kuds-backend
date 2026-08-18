import { z } from "zod";

export const codexParamsSchema = z.object({
  entryKey: z.string().min(1).max(64),
});
export type CodexParams = z.infer<typeof codexParamsSchema>;
