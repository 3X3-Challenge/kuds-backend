import type { EquipSlot } from "@prisma/client";
import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export function listInventory(playerId: string) {
  return prisma.inventory.findMany({
    where: { playerId },
    orderBy: { itemKey: "asc" },
  });
}

export function findEntry(tx: TxClient, playerId: string, itemKey: string) {
  return tx.inventory.findUnique({
    where: { playerId_itemKey: { playerId, itemKey } },
  });
}

export function findItem(tx: TxClient, itemKey: string) {
  return tx.item.findUnique({ where: { itemKey } });
}

/** Hồ sơ trang bị quyết định món này mặc được vào ô nào. Không có hồ sơ = không mặc được. */
export function findEquipmentProfile(tx: TxClient, itemKey: string) {
  return tx.equipmentProfile.findUnique({ where: { itemKey } });
}

export function listEquipment(playerId: string) {
  return prisma.playerEquipment.findMany({
    where: { playerId },
    orderBy: { slot: "asc" },
  });
}

/**
 * Mặc đồ. Khoá chính là (player, slot) nên upsert thay thế luôn món đang mặc ở
 * ô đó — không cần bước cởi riêng, và không có khoảnh khắc nào ô bị trống giữa
 * chừng.
 *
 * Khoá ngoại ghép (item_key, slot) → equipment_profile ép luôn "đúng đồ, đúng ô"
 * ở tầng DB; kiểm ở service chỉ để trả về thông báo tiếng Việt tử tế hơn 500.
 */
export function equip(tx: TxClient, playerId: string, slot: EquipSlot, itemKey: string) {
  return tx.playerEquipment.upsert({
    where: { playerId_slot: { playerId, slot } },
    create: { playerId, slot, itemKey },
    update: { itemKey },
  });
}

/** deleteMany chứ không delete: cởi một ô đang trống là hành động vô hại, không phải lỗi 404. */
export function unequip(playerId: string, slot: EquipSlot) {
  return prisma.playerEquipment.deleteMany({ where: { playerId, slot } });
}
