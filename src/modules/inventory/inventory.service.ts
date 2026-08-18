import type { EquipSlot } from "@prisma/client";
import * as inventoryRepository from "./inventory.repository";
import { prisma } from "../../core/database/prisma";
import { consumeItem } from "../../common/services/economy.service";
import { NotFoundError, UnprocessableError } from "../../common/errors";
import type { DiscardInput, EquipInput, UseItemInput } from "./inventory.schema";

export async function listInventory(playerId: string) {
  const rows = await inventoryRepository.listInventory(playerId);
  const now = Date.now();
  return rows.map((i) => ({
    itemKey: i.itemKey,
    quantity: i.quantity,
    acquiredAt: i.acquiredAt,
    expiresAt: i.expiresAt,
    /** Hết hạn nhưng chưa bị job dọn — client phải làm mờ chứ không được cho dùng. */
    isExpired: i.expiresAt !== null && i.expiresAt.getTime() <= now,
  }));
}

/**
 * Dùng một vật phẩm tiêu hao.
 *
 * Chỉ TRỪ khỏi túi. Hiệu ứng (hồi thể lực, cho thú cưng ăn...) chưa có bảng nào
 * mô tả trong lược đồ, nên chưa nơi nào áp dụng được — thêm hiệu ứng nghĩa là
 * thêm bảng content.item_effect trước, rồi mới nối vào đây. Client vẫn phải gọi
 * endpoint này để túi đồ đúng, đừng tự trừ ở phía client.
 */
export async function useItem(playerId: string, input: UseItemInput) {
  return prisma.$transaction(async (tx) => {
    const item = await inventoryRepository.findItem(tx, input.itemKey);
    if (!item) {
      throw new NotFoundError(`Vật phẩm không tồn tại: ${input.itemKey}`);
    }
    if (!item.isConsumable) {
      throw new UnprocessableError(`${item.displayName} không phải vật phẩm dùng được`);
    }

    const entry = await inventoryRepository.findEntry(tx, playerId, input.itemKey);
    if (entry?.expiresAt && entry.expiresAt <= new Date()) {
      throw new UnprocessableError(`${item.displayName} đã hết hạn`);
    }

    const remaining = await consumeItem(tx, playerId, input.itemKey, input.quantity);
    return { itemKey: input.itemKey, quantity: remaining };
  });
}

/** Vứt bỏ. Khác useItem ở chỗ không kiểm isConsumable — đồ gì cũng vứt được. */
export async function discardItem(playerId: string, input: DiscardInput) {
  return prisma.$transaction(async (tx) => {
    const remaining = await consumeItem(tx, playerId, input.itemKey, input.quantity);
    return { itemKey: input.itemKey, quantity: remaining };
  });
}

export async function listEquipment(playerId: string) {
  const rows = await inventoryRepository.listEquipment(playerId);
  return rows.map((e) => ({ slot: e.slot, itemKey: e.itemKey }));
}

/**
 * Mặc đồ vào một ô.
 *
 * Mặc đồ KHÔNG trừ khỏi túi — món đồ vẫn nằm trong túi, chỉ là đang được mặc.
 * Đây là lý do DB không tự kiểm được "có món đó trong túi không" (không có khoá
 * ngoại nào từ player_equipment sang inventory), nên phải đọc túi ở đây.
 *
 * Cả ba bước trong một transaction: đọc túi rồi ghi trang bị mà tách rời nhau
 * thì một request vứt đồ chạy xen vào giữa sẽ để lại món đang mặc mà không có
 * trong túi.
 */
export async function equip(playerId: string, slot: EquipSlot, input: EquipInput) {
  return prisma.$transaction(async (tx) => {
    const owned = await inventoryRepository.findEntry(tx, playerId, input.itemKey);
    if (!owned || owned.quantity < 1) {
      throw new UnprocessableError("Không có vật phẩm này trong túi");
    }

    const profile = await inventoryRepository.findEquipmentProfile(tx, input.itemKey);
    if (!profile) {
      throw new UnprocessableError("Vật phẩm này không mặc được");
    }
    if (profile.slot !== slot) {
      throw new UnprocessableError(`Vật phẩm này thuộc ô ${profile.slot}, không phải ô ${slot}`);
    }

    await inventoryRepository.equip(tx, playerId, slot, input.itemKey);
    return { slot, itemKey: input.itemKey };
  });
}

export async function unequip(playerId: string, slot: EquipSlot) {
  await inventoryRepository.unequip(playerId, slot);
  return { slot, itemKey: null };
}
