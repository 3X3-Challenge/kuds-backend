import type { Prisma } from "@prisma/client";
import * as playerAdminRepository from "./admin-player.repository";
import { snapshot, writeAudit } from "./admin-audit.service";
import { prisma } from "../../core/database/prisma";
import { creditCurrency, debitCurrency, grantItem } from "../../common/services/economy.service";
import { NotFoundError, UnprocessableError } from "../../common/errors";
import { toNumber } from "../../common/utils/serialize.util";
import type { ActorInfo } from "./admin-content.service";
import type {
  AdjustCurrencyInput,
  BanInput,
  GrantItemInput,
  PlayerListQuery,
  SendMailInput,
} from "./admin-player.schema";

export async function listPlayers(query: PlayerListQuery) {
  const { rows, total } = await playerAdminRepository.listPlayers(query);

  return {
    items: rows.map((p) => ({
      playerId: p.playerId,
      accountId: p.accountId,
      uid: p.uid,
      displayName: p.displayName,
      level: p.level,
      exp: p.exp,
      createdAt: p.createdAt,
      status: p.account.status,
      bannedUntil: p.account.bannedUntil,
      lastLoginAt: p.account.lastLoginAt,
      wallets: p.wallets.map((w) => ({ currency: w.currency, balance: toNumber(w.balance) })),
    })),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function findPlayer(playerId: string) {
  const player = await playerAdminRepository.findPlayer(playerId);
  if (!player) {
    throw new NotFoundError("Không tìm thấy người chơi");
  }
  return snapshot(player);
}

/**
 * Cấm hoặc gỡ cấm.
 *
 * Ghi nhật ký với lý do — bảng nào đụng tới tiền hoặc tới quyền chơi thì phải
 * biết ai làm, làm gì, vì sao. Lý do là bắt buộc ở tầng schema.
 */
export async function setBan(
  playerId: string,
  banned: boolean,
  input: BanInput,
  actor: ActorInfo,
) {
  return prisma.$transaction(async (tx) => {
    const player = await playerAdminRepository.findPlayerBrief(tx, playerId);
    if (!player) {
      throw new NotFoundError("Không tìm thấy người chơi");
    }

    const [account] = await playerAdminRepository.setBan(
      tx,
      player.accountId,
      banned,
      input.bannedUntil,
    );

    await writeAudit(tx, {
      adminId: actor.admin.adminId,
      action: "update",
      tableName: "game.account",
      rowKey: player.accountId,
      after: {
        status: account.status,
        bannedUntil: account.bannedUntil,
        reason: input.reason,
        playerUid: player.uid,
      },
      ipAddress: actor.ipAddress,
    });

    return {
      playerId,
      status: account.status,
      bannedUntil: account.bannedUntil,
    };
  });
}

/**
 * Cộng/trừ tiền bằng tay (GM).
 *
 * Đi qua đúng cùng đường mà game đi: creditCurrency/debitCurrency, nên vẫn sinh
 * dòng game.currency_ledger với reason 'gm_dieu_chinh'. Job đối soát hằng đêm
 * kiểm `wallet.balance = SUM(ledger.delta)`, và một câu UPDATE tay lên bảng ví
 * sẽ làm nó kêu vào sáng hôm sau — đúng như nó phải thế.
 */
export async function adjustCurrency(
  playerId: string,
  input: AdjustCurrencyInput,
  actor: ActorInfo,
) {
  return prisma.$transaction(async (tx) => {
    const player = await playerAdminRepository.findPlayerBrief(tx, playerId);
    if (!player) {
      throw new NotFoundError("Không tìm thấy người chơi");
    }

    const ref = {
      reason: "gm_dieu_chinh" as const,
      refType: "admin_user",
      refId: actor.admin.adminId,
      // Có mốc thời gian nên hai lần điều chỉnh giống hệt nhau vẫn khác khoá.
      // Không có phần này thì admin không cộng được 100 hoa sen hai lần liên tiếp.
      idempotencyKey: `gm:${actor.admin.adminId}:${playerId}:${Date.now()}`,
    };

    const balance =
      input.delta > 0
        ? await creditCurrency(tx, playerId, input.currency, input.delta, ref)
        : await debitCurrency(tx, playerId, input.currency, -input.delta, ref);

    await writeAudit(tx, {
      adminId: actor.admin.adminId,
      action: "update",
      tableName: "game.wallet",
      rowKey: `${playerId}:${input.currency}`,
      after: {
        currency: input.currency,
        delta: input.delta,
        balanceAfter: balance,
        reason: input.reason,
        playerUid: player.uid,
      },
      ipAddress: actor.ipAddress,
    });

    return { playerId, currency: input.currency, balance };
  });
}

export async function grantItemToPlayer(
  playerId: string,
  input: GrantItemInput,
  actor: ActorInfo,
) {
  return prisma.$transaction(async (tx) => {
    const player = await playerAdminRepository.findPlayerBrief(tx, playerId);
    if (!player) {
      throw new NotFoundError("Không tìm thấy người chơi");
    }

    const quantity = await grantItem(tx, playerId, input.itemKey, input.quantity);

    await writeAudit(tx, {
      adminId: actor.admin.adminId,
      action: "update",
      tableName: "game.inventory",
      rowKey: `${playerId}:${input.itemKey}`,
      after: {
        itemKey: input.itemKey,
        granted: input.quantity,
        quantityAfter: quantity,
        playerUid: player.uid,
      },
      ipAddress: actor.ipAddress,
    });

    return { playerId, itemKey: input.itemKey, quantity };
  });
}

/**
 * Gửi thư GM.
 *
 * Nội dung chữ ghi thẳng vào bảng mail (không qua template_key). Phần thưởng thì
 * CHỤP LẠI từ gói thưởng ngay tại thời điểm gửi và lưu vào reward_snapshot — đó
 * mới là thứ trả cho người chơi lúc bấm "Nhận". bundleId lưu kèm chỉ để tra ngược
 * nguồn gốc; admin sửa gói thưởng ngày mai không đổi được thư gửi hôm nay.
 *
 * Người chơi đầy hòm thư sẽ KHÔNG nhận được — câu INSERT lọc sẵn theo
 * mail_capacity. Số trả về là số thư THẬT SỰ gửi được, có thể nhỏ hơn số người
 * được chọn, và chênh lệch đó chính là số người bị bỏ qua.
 */
export async function sendMail(input: SendMailInput, actor: ActorInfo) {
  return prisma.$transaction(async (tx) => {
    let bundleId: bigint | null = null;
    let rewardSnapshot: Prisma.InputJsonValue | null = null;

    if (input.bundleKey) {
      const bundle = await playerAdminRepository.findBundleByKey(tx, input.bundleKey);
      if (!bundle) {
        throw new NotFoundError(`Gói thưởng không tồn tại: ${input.bundleKey}`);
      }
      // Gói rỗng sẽ tạo ra thư "có đính kèm" mà bấm Nhận không được gì. Chặn ở
      // đây vì CHECK bên SQL không phân biệt được mảng rỗng với mảng có dòng.
      if (bundle.lines.length === 0) {
        throw new UnprocessableError(`Gói thưởng "${input.bundleKey}" không có dòng thưởng nào`);
      }

      bundleId = bundle.bundleId;
      rewardSnapshot = bundle.lines.map((l) => ({
        currency: l.currency,
        itemKey: l.itemKey,
        amount: l.amount,
      })) as unknown as Prisma.InputJsonValue;
    }

    const content = {
      title: input.title,
      sender: input.sender,
      body: input.body,
      bundleId,
      rewardSnapshot,
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null,
    };

    const sent = input.broadcast
      ? await playerAdminRepository.broadcastMail(tx, content)
      : await playerAdminRepository.sendMailTo(tx, input.playerIds, content);

    await writeAudit(tx, {
      adminId: actor.admin.adminId,
      action: "insert",
      tableName: "game.mail",
      rowKey: input.broadcast ? "broadcast" : input.playerIds.join(","),
      after: {
        title: input.title,
        sender: input.sender,
        bundleKey: input.bundleKey,
        rewards: rewardSnapshot,
        broadcast: input.broadcast,
        targetCount: input.broadcast ? null : input.playerIds.length,
        sentCount: sent,
      },
      ipAddress: actor.ipAddress,
    });

    return {
      sentCount: sent,
      /** Chênh lệch với sentCount = số người bị bỏ qua vì hòm thư đã đầy. */
      requestedCount: input.broadcast ? null : input.playerIds.length,
    };
  });
}
