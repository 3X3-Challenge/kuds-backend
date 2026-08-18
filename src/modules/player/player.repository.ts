import { prisma } from "../../core/database/prisma";

export function findPlayer(playerId: string) {
  return prisma.player.findUnique({ where: { playerId } });
}

export function listWallets(playerId: string) {
  return prisma.wallet.findMany({
    where: { playerId },
    orderBy: { currency: "asc" },
  });
}

export function findSave(playerId: string) {
  return prisma.playerSave.findUnique({ where: { playerId } });
}

export interface SaveInput {
  sceneName: string;
  posX: number;
  posY: number;
  posZ: number;
  yaw: number;
  dayTime: number;
}

/**
 * Ghi điểm lưu. upsert vì dòng player_save không được tạo cùng lúc với player:
 * người chơi mới chưa đi đâu thì chưa có gì để lưu, và bắt tồn tại sẵn một dòng
 * (0,0,0) sẽ khiến "chưa từng chơi" và "đang đứng ở gốc toạ độ" không phân biệt được.
 */
export function upsertSave(playerId: string, data: SaveInput) {
  return prisma.playerSave.upsert({
    where: { playerId },
    create: { playerId, ...data },
    update: data,
  });
}

export function listInventory(playerId: string) {
  return prisma.inventory.findMany({
    where: { playerId },
    orderBy: { itemKey: "asc" },
  });
}

export function listEquipment(playerId: string) {
  return prisma.playerEquipment.findMany({
    where: { playerId },
    orderBy: { slot: "asc" },
  });
}

export function listQuestProgress(playerId: string) {
  return prisma.playerQuest.findMany({
    where: { playerId },
    include: { objectives: { orderBy: { ordinal: "asc" } } },
    orderBy: { questKey: "asc" },
  });
}

export function listAchievementProgress(playerId: string) {
  return prisma.playerAchievement.findMany({
    where: { playerId },
    orderBy: { achievementKey: "asc" },
  });
}

export function listFarmPlots(playerId: string) {
  return prisma.farmPlot.findMany({
    where: { playerId },
    orderBy: { plotIndex: "asc" },
  });
}

export function listCodexUnlocks(playerId: string) {
  return prisma.codexUnlock.findMany({
    where: { playerId },
    select: { entryKey: true },
    orderBy: { entryKey: "asc" },
  });
}

/** Thư chưa đọc và thư còn thưởng chưa nhận — hai con số cho hai huy hiệu khác nhau. */
export function countMailBadges(playerId: string) {
  return prisma.$transaction([
    prisma.mail.count({ where: { playerId, readAt: null, deletedAt: null } }),
    prisma.mail.count({
      where: { playerId, claimedAt: null, deletedAt: null, bundleId: { not: null } },
    }),
  ]);
}

/**
 * Sổ cái, mới nhất trước, phân trang bằng con trỏ.
 *
 * Con trỏ là entryId chứ không phải OFFSET: sổ chỉ ghi thêm nên OFFSET sẽ nhảy
 * cóc khi có dòng mới chèn vào lúc người chơi đang lật trang.
 */
export function listLedger(playerId: string, limit: number, cursor?: bigint) {
  return prisma.currencyLedger.findMany({
    where: { playerId, ...(cursor ? { entryId: { lt: cursor } } : {}) },
    orderBy: { entryId: "desc" },
    take: limit,
  });
}
