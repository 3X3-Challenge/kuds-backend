import { z } from "zod";
import { EquipSlot } from "@prisma/client";

const itemKey = z.string().min(1).max(64);

export const useItemSchema = z.object({
  itemKey,
  quantity: z.number().int().min(1).max(999).default(1),
});
export type UseItemInput = z.infer<typeof useItemSchema>;

export const equipParamsSchema = z.object({
  slot: z.nativeEnum(EquipSlot),
});
export type EquipParams = z.infer<typeof equipParamsSchema>;

export const equipSchema = z.object({
  itemKey,
});
export type EquipInput = z.infer<typeof equipSchema>;

export const discardSchema = z.object({
  itemKey,
  quantity: z.number().int().min(1).max(999).default(1),
});
export type DiscardInput = z.infer<typeof discardSchema>;
