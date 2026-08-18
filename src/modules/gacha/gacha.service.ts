import { randomBytes } from "node:crypto";
import * as gachaRepository from "./gacha.repository";
import { prisma } from "../../core/database/prisma";
import { debitCurrency, grantItem } from "../../common/services/economy.service";
import { NotFoundError, UnprocessableError } from "../../common/errors";
import type { HistoryQuery, PullInput } from "./gacha.schema";

/** Một ứng viên trong bể quay, đã gộp trọng số với bậc sao. */
interface PoolEntry {
  gachaItemKey: string;
  rarity: number;
  weight: number;
  grantsItemKey: string | null;
}

interface PullOutcome {
  gachaItemKey: string;
  rarity: number;
  wasPity: boolean;
  rngSeed: bigint;
  grantsItemKey: string | null;
}

/**
 * Hạt ngẫu nhiên 63 bit, lấy từ node:crypto.
 *
 * Math.random() bị loại thẳng: nó là PRNG không mật mã, trạng thái nội bộ suy ra
 * được từ vài kết quả liên tiếp, và ở đây kết quả quy ra tiền thật.
 *
 * Hạt được LƯU cùng mỗi lượt quay. Đó không phải trang trí: khi người chơi khiếu
 * nại "tôi quay 90 lần không ra", hạt + cấu hình banner tại thời điểm đó dựng
 * lại được chính xác kết quả. Không có nó thì chỉ còn cách tin nhau.
 */
function nextSeed(): bigint {
  return BigInt(`0x${randomBytes(8).toString("hex")}`) & 0x7fffffffffffffffn;
}

/**
 * Chọn một mục từ bể theo trọng số, dùng hạt đã cho.
 *
 * Hoàn toàn tất định: cùng hạt + cùng bể ⇒ cùng kết quả. Đây là điều kiện để
 * rngSeed dựng lại được lịch sử.
 */
function pickWeighted(pool: PoolEntry[], seed: bigint): PoolEntry {
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let roll = Number(seed % BigInt(total));
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  // Chỉ tới đây được nếu total sai lệch giữa hai vòng lặp, tức là bug.
  return pool[pool.length - 1]!;
}

/**
 * Một lượt quay.
 *
 * Về tỉ lệ nền: lược đồ KHÔNG lưu tỉ lệ theo bậc sao ở đâu cả — chỉ có
 * banner_entry.weight và ghi chú "tỉ lệ thật = weight / SUM(weight) trong cùng
 * bậc sao". Nên ở đây trọng số được coi là TOÀN CỤC: quay theo trọng số trên cả
 * bể, và bậc sao là hệ quả của việc trúng vật phẩm nào. Muốn ép tỉ lệ 5 sao =
 * 0,6% thì đặt trọng số sao cho đúng, hoặc thêm bảng tỉ lệ theo bậc rồi sửa
 * hàm này.
 *
 * Bảo hiểm (pity) đè lên trên: đủ số lần chưa ra thì THU HẸP bể xuống đúng bậc
 * đó rồi mới quay theo trọng số. Thu hẹp chứ không ép cứng một món, để trong
 * cùng bậc vẫn còn ngẫu nhiên.
 */
function rollOnce(
  pool: PoolEntry[],
  counters: { since5Star: number; since4Star: number },
  pity5: number,
  pity4: number,
): PullOutcome {
  const seed = nextSeed();

  const due5 = counters.since5Star + 1 >= pity5;
  const due4 = counters.since4Star + 1 >= pity4;

  let candidates = pool;
  let wasPity = false;

  if (due5) {
    const fiveStars = pool.filter((e) => e.rarity >= 5);
    // Banner không có món 5 sao nào thì bảo hiểm 5 sao vô nghĩa — bỏ qua chứ
    // không nổ, vì đó là cấu hình của admin chứ không phải lỗi của người chơi.
    if (fiveStars.length > 0) {
      candidates = fiveStars;
      wasPity = true;
    }
  } else if (due4) {
    const fourPlus = pool.filter((e) => e.rarity >= 4);
    if (fourPlus.length > 0) {
      candidates = fourPlus;
      wasPity = true;
    }
  }

  const picked = pickWeighted(candidates, seed);
  return {
    gachaItemKey: picked.gachaItemKey,
    rarity: picked.rarity,
    wasPity,
    rngSeed: seed,
    grantsItemKey: picked.grantsItemKey,
  };
}

export async function listBannerStates(playerId: string) {
  const states = await gachaRepository.listBannerStates(playerId);
  return states.map((s) => ({
    bannerKey: s.banner.bannerKey,
    pullsTotal: s.pullsTotal,
    since5Star: s.since5Star,
    since4Star: s.since4Star,
  }));
}

/**
 * Quay gacha.
 *
 * Thứ tự trong transaction, không được đổi:
 *   1. tra khoá idempotency → có rồi thì phát lại kết quả cũ, KHÔNG trừ tiền
 *   2. trừ tiền (WHERE balance >= cost, không đủ thì dừng ngay tại đây)
 *   3. quay, ghi gacha_pull (unique (player, idempotency_key) là lớp chặn cuối)
 *   4. cộng vật phẩm vào túi
 *   5. ghi lại bộ đếm pity
 *
 * Bước 1 giải quyết lần gửi lại SAU KHI đã xong. Bước 3 giải quyết hai request
 * chạy ĐỒNG THỜI: câu INSERT thứ hai ăn lỗi trùng và cả transaction cuộn ngược,
 * kể cả phần trừ tiền.
 */
export async function pull(playerId: string, bannerKey: string, input: PullInput) {
  return prisma.$transaction(async (tx) => {
    const banner = await gachaRepository.findOpenBanner(tx, bannerKey, new Date());
    if (!banner) {
      throw new NotFoundError("Banner không tồn tại hoặc đã đóng");
    }

    const replay = await gachaRepository.findPullsByIdempotencyKey(
      tx,
      playerId,
      input.idempotencyKey,
    );
    if (replay.length > 0) {
      return {
        bannerKey,
        replayed: true,
        results: replay.map((p) => ({
          gachaItemKey: p.gachaItemKey,
          rarity: p.rarity,
          wasPity: p.wasPity,
        })),
        balanceAfter: null as number | null,
      };
    }

    const pool: PoolEntry[] = banner.entries
      .filter((e) => e.weight > 0)
      .map((e) => ({
        gachaItemKey: e.gachaItemKey,
        rarity: e.gachaItem.rarity,
        weight: e.weight,
        grantsItemKey: e.gachaItem.grantsItemKey,
      }));

    if (pool.length === 0) {
      throw new UnprocessableError("Banner này chưa có vật phẩm nào");
    }

    const balanceAfter = await debitCurrency(
      tx,
      playerId,
      banner.costCurrency,
      banner.costAmount * input.count,
      {
        reason: "quay_gacha",
        refType: "banner",
        refId: bannerKey,
        idempotencyKey: `gacha:${input.idempotencyKey}`,
      },
    );

    const state = await gachaRepository.findBannerState(tx, playerId, banner.bannerId);
    const counters = {
      pullsTotal: state?.pullsTotal ?? 0,
      since5Star: state?.since5Star ?? 0,
      since4Star: state?.since4Star ?? 0,
    };

    const outcomes: PullOutcome[] = [];
    for (let i = 0; i < input.count; i++) {
      const outcome = rollOnce(pool, counters, banner.pity5Star, banner.pity4Star);
      outcomes.push(outcome);

      // Bộ đếm cập nhật NGAY sau mỗi lượt, không phải sau cả loạt: trong một loạt
      // 10 lần, lượt thứ 3 ra 5 sao thì lượt thứ 4 phải bắt đầu đếm lại từ 0.
      counters.pullsTotal += 1;
      counters.since5Star = outcome.rarity >= 5 ? 0 : counters.since5Star + 1;
      counters.since4Star = outcome.rarity >= 4 ? 0 : counters.since4Star + 1;
    }

    await gachaRepository.createPulls(
      tx,
      outcomes.map((o, i) => ({
        playerId,
        bannerId: banner.bannerId,
        gachaItemKey: o.gachaItemKey,
        // Chép rarity vào dòng lịch sử. Admin hạ bậc sao một món về sau không
        // được phép làm sai lệch lịch sử đã quay.
        rarity: o.rarity,
        wasPity: o.wasPity,
        rngSeed: o.rngSeed,
        idempotencyKey: `${input.idempotencyKey}#${i}`,
      })),
    );

    // Gộp theo item trước khi cộng: quay 10 lần trúng cùng một món thì cộng một
    // lần 3 cái, thay vì ba lần 1 cái — mỗi lần cộng đều đặt lại hạn sử dụng.
    const grants = new Map<string, number>();
    for (const o of outcomes) {
      if (o.grantsItemKey) {
        grants.set(o.grantsItemKey, (grants.get(o.grantsItemKey) ?? 0) + 1);
      }
    }
    for (const [itemKey, amount] of grants) {
      await grantItem(tx, playerId, itemKey, amount);
    }

    await gachaRepository.saveBannerState(tx, playerId, banner.bannerId, counters);

    return {
      bannerKey,
      replayed: false,
      results: outcomes.map((o) => ({
        gachaItemKey: o.gachaItemKey,
        rarity: o.rarity,
        wasPity: o.wasPity,
      })),
      balanceAfter,
      pityState: {
        pullsTotal: counters.pullsTotal,
        since5Star: counters.since5Star,
        since4Star: counters.since4Star,
      },
    };
  });
}

export async function listHistory(playerId: string, query: HistoryQuery) {
  const cursor = query.cursor ? BigInt(query.cursor) : undefined;
  const rows = await gachaRepository.listHistory(playerId, query.limit, cursor);

  const items = rows.map((p) => ({
    pullId: p.pullId.toString(),
    gachaItemKey: p.gachaItemKey,
    rarity: p.rarity,
    wasPity: p.wasPity,
    pulledAt: p.pulledAt,
  }));

  return {
    items,
    nextCursor: items.length === query.limit ? items[items.length - 1]!.pullId : null,
  };
}
