import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

/** Banner đang mở kèm bể quay và bậc sao của từng vật phẩm trong bể. */
export function findOpenBanner(tx: TxClient, bannerKey: string, now: Date) {
  return tx.banner.findFirst({
    where: {
      bannerKey,
      status: "published",
      opensAt: { lte: now },
      OR: [{ closesAt: null }, { closesAt: { gt: now } }],
    },
    include: {
      entries: {
        include: { gachaItem: true },
        orderBy: { gachaItemKey: "asc" },
      },
    },
  });
}

export function listBannerStates(playerId: string) {
  return prisma.bannerState.findMany({
    where: { playerId },
    include: { banner: { select: { bannerKey: true } } },
  });
}

export function findBannerState(tx: TxClient, playerId: string, bannerId: bigint) {
  return tx.bannerState.findUnique({
    where: { playerId_bannerId: { playerId, bannerId } },
  });
}

export interface BannerCounters {
  pullsTotal: number;
  since5Star: number;
  since4Star: number;
}

/** Ghi lại bộ đếm pity sau cả loạt quay. upsert vì lần quay đầu tiên chưa có dòng. */
export function saveBannerState(
  tx: TxClient,
  playerId: string,
  bannerId: bigint,
  counters: BannerCounters,
) {
  return tx.bannerState.upsert({
    where: { playerId_bannerId: { playerId, bannerId } },
    create: { playerId, bannerId, ...counters },
    update: counters,
  });
}

export interface PullRecord {
  playerId: string;
  bannerId: bigint;
  gachaItemKey: string;
  rarity: number;
  wasPity: boolean;
  rngSeed: bigint;
  idempotencyKey: string;
}

export function createPulls(tx: TxClient, records: PullRecord[]) {
  return tx.gachaPull.createMany({ data: records });
}

/**
 * Tra các lượt quay đã ghi cho một khoá idempotency.
 *
 * Loạt 10 lần dùng khoá `<key>#0`..`<key>#9`, nên tra bằng tiền tố. Có kết quả
 * nghĩa là cú bấm này đã xử lý xong rồi — phát lại kết quả cũ, KHÔNG quay lại
 * và KHÔNG trừ tiền lần nữa.
 */
export function findPullsByIdempotencyKey(tx: TxClient, playerId: string, key: string) {
  return tx.gachaPull.findMany({
    where: { playerId, idempotencyKey: { startsWith: `${key}#` } },
    orderBy: { pullId: "asc" },
  });
}

export function listHistory(playerId: string, limit: number, cursor?: bigint) {
  return prisma.gachaPull.findMany({
    where: { playerId, ...(cursor ? { pullId: { lt: cursor } } : {}) },
    orderBy: { pullId: "desc" },
    take: limit,
  });
}
