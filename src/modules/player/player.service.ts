import * as playerRepository from "./player.repository";
import { NotFoundError } from "../../common/errors";
import { toNumber } from "../../common/utils/serialize.util";
import type { LedgerQuery, SaveInput } from "./player.schema";
import type {
  FarmPlotDto,
  LedgerEntryDto,
  PlayerStateDto,
  SaveDto,
  WalletDto,
} from "./player.types";

export async function listWallets(playerId: string): Promise<WalletDto[]> {
  const wallets = await playerRepository.listWallets(playerId);
  return wallets.map((w) => ({ currency: w.currency, balance: toNumber(w.balance) }));
}

export async function getSave(playerId: string): Promise<SaveDto | null> {
  const save = await playerRepository.findSave(playerId);
  if (!save) return null;
  return {
    sceneName: save.sceneName,
    posX: save.posX,
    posY: save.posY,
    posZ: save.posZ,
    yaw: save.yaw,
    dayTime: save.dayTime,
    updatedAt: save.updatedAt,
  };
}

/**
 * Ghi điểm lưu.
 *
 * yaw chuẩn hoá về [0, 360) tại đây thay vì tin client: quay tròn nhiều vòng
 * trong một phiên chơi dài làm giá trị phình to, và `real` mất dần độ chính xác
 * theo độ lớn — tới vài triệu độ thì bước nhỏ nhất đã lớn hơn một độ.
 */
export async function saveState(playerId: string, input: SaveInput): Promise<SaveDto> {
  const yaw = ((input.yaw % 360) + 360) % 360;
  const save = await playerRepository.upsertSave(playerId, { ...input, yaw });
  return {
    sceneName: save.sceneName,
    posX: save.posX,
    posY: save.posY,
    posZ: save.posZ,
    yaw: save.yaw,
    dayTime: save.dayTime,
    updatedAt: save.updatedAt,
  };
}

export async function listLedger(playerId: string, query: LedgerQuery) {
  const cursor = query.cursor ? BigInt(query.cursor) : undefined;
  const rows = await playerRepository.listLedger(playerId, query.limit, cursor);

  const entries: LedgerEntryDto[] = rows.map((e) => ({
    entryId: e.entryId.toString(),
    currency: e.currency,
    delta: toNumber(e.delta),
    balanceAfter: toNumber(e.balanceAfter),
    reason: e.reason,
    refType: e.refType,
    refId: e.refId,
    createdAt: e.createdAt,
  }));

  // Trang đầy ⇒ có thể còn nữa. Trang vơi ⇒ chắc chắn hết, khỏi gọi thêm lượt rỗng.
  const nextCursor = entries.length === query.limit ? entries[entries.length - 1]!.entryId : null;
  return { entries, nextCursor };
}

/**
 * Toàn bộ trạng thái người chơi trong một lần gọi.
 *
 * Tám truy vấn chạy song song. Chúng độc lập nhau nên không có lý do nào để
 * nối tiếp — và với DB ở Singapore thì mỗi lượt đi-về là vài chục ms cộng dồn
 * thẳng vào thời gian màn hình chờ.
 */
export async function getState(playerId: string): Promise<PlayerStateDto> {
  const player = await playerRepository.findPlayer(playerId);
  if (!player) {
    throw new NotFoundError("Không tìm thấy nhân vật");
  }

  const [
    wallets,
    save,
    inventory,
    equipment,
    quests,
    achievements,
    farmPlots,
    codexUnlocks,
    mailBadges,
  ] = await Promise.all([
    playerRepository.listWallets(playerId),
    playerRepository.findSave(playerId),
    playerRepository.listInventory(playerId),
    playerRepository.listEquipment(playerId),
    playerRepository.listQuestProgress(playerId),
    playerRepository.listAchievementProgress(playerId),
    playerRepository.listFarmPlots(playerId),
    playerRepository.listCodexUnlocks(playerId),
    playerRepository.countMailBadges(playerId),
  ]);

  const now = Date.now();

  return {
    playerId: player.playerId,
    uid: player.uid,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    level: player.level,
    exp: player.exp,
    mailCapacity: player.mailCapacity,
    createdAt: player.createdAt,

    wallets: wallets.map((w) => ({ currency: w.currency, balance: toNumber(w.balance) })),

    save: save
      ? {
          sceneName: save.sceneName,
          posX: save.posX,
          posY: save.posY,
          posZ: save.posZ,
          yaw: save.yaw,
          dayTime: save.dayTime,
          updatedAt: save.updatedAt,
        }
      : null,

    inventory: inventory.map((i) => ({
      itemKey: i.itemKey,
      quantity: i.quantity,
      acquiredAt: i.acquiredAt,
      expiresAt: i.expiresAt,
    })),

    equipment: equipment.map((e) => ({ slot: e.slot, itemKey: e.itemKey })),

    quests: quests.map((q) => ({
      questKey: q.questKey,
      status: q.status,
      startedAt: q.startedAt,
      completedAt: q.completedAt,
      claimedAt: q.claimedAt,
      objectives: q.objectives.map((o) => ({ ordinal: o.ordinal, progress: o.progress })),
    })),

    achievements: achievements.map((a) => ({
      achievementKey: a.achievementKey,
      progress: toNumber(a.progress),
      unlockedAt: a.unlockedAt,
      claimedAt: a.claimedAt,
    })),

    farmPlots: farmPlots.map(
      (p): FarmPlotDto => ({
        plotIndex: p.plotIndex,
        cropKey: p.cropKey,
        plantedAt: p.plantedAt,
        readyAt: p.readyAt,
        waterCount: p.waterCount,
        isReady: p.readyAt !== null && p.readyAt.getTime() <= now,
      }),
    ),

    codexUnlocks: codexUnlocks.map((c) => c.entryKey),
    unreadMailCount: mailBadges[0],
    unclaimedMailCount: mailBadges[1],
  };
}
