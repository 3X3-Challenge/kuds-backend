import { Prisma } from "@prisma/client";
import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export interface ListOptions {
  limit: number;
  cursor?: bigint;
  includeClaimed: boolean;
}

/** Thư đã xoá mềm không bao giờ hiện lại — deletedAt: null có mặt ở mọi truy vấn dưới đây. */
export function listMails(playerId: string, options: ListOptions) {
  return prisma.mail.findMany({
    where: {
      playerId,
      deletedAt: null,
      ...(options.includeClaimed ? {} : { claimedAt: null }),
      ...(options.cursor ? { mailId: { lt: options.cursor } } : {}),
    },
    orderBy: { mailId: "desc" },
    take: options.limit,
  });
}

export function countInbox(playerId: string) {
  return prisma.mail.count({ where: { playerId, deletedAt: null } });
}

export function findMail(tx: TxClient, playerId: string, mailId: bigint) {
  return tx.mail.findFirst({ where: { mailId, playerId, deletedAt: null } });
}

/** Đánh dấu đã đọc. updateMany (không phải update) để đọc lại thư đã đọc là no-op, không 404. */
export function markRead(playerId: string, mailId: bigint) {
  return prisma.mail.updateMany({
    where: { mailId, playerId, deletedAt: null, readAt: null },
    data: { readAt: new Date() },
  });
}

/**
 * Chốt quyền nhận thưởng.
 *
 * ĐÂY là chốt chặn chống nhận hai lần, không phải câu lệnh cộng tiền phía sau.
 * `claimed_at IS NULL` nằm trong WHERE nên hai request song song thì chỉ một câu
 * khớp dòng; câu kia trả count = 0 và người gọi dừng lại trước khi cộng gì.
 * Postgres khoá dòng trong suốt UPDATE nên không có khe hở giữa đọc và ghi.
 *
 * Đặt luôn readAt: nhận thưởng mà thư còn "chưa đọc" là vô nghĩa.
 */
export async function claimMail(tx: TxClient, playerId: string, mailId: bigint): Promise<boolean> {
  const now = new Date();
  const result = await tx.mail.updateMany({
    where: {
      mailId,
      playerId,
      deletedAt: null,
      claimedAt: null,
      // Thư quá hạn thì không nhận được nữa. NULL = không hết hạn.
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { claimedAt: now, readAt: now },
  });
  return result.count === 1;
}

/**
 * Thư còn thưởng chưa nhận, phục vụ nút "Nhận hết".
 *
 * Lọc theo rewardSnapshot chứ không theo bundleId: thư GM soạn tay có thưởng
 * nhưng bundleId NULL, và bản chụp mới là thứ thật sự được trả cho người chơi.
 */
export function listClaimable(tx: TxClient, playerId: string) {
  const now = new Date();
  return tx.mail.findMany({
    where: {
      playerId,
      deletedAt: null,
      claimedAt: null,
      rewardSnapshot: { not: Prisma.DbNull },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { mailId: "asc" },
  });
}

/** Xoá mềm: nút "Xoá" ở hòm thư chỉ đặt deletedAt, dòng vẫn ở lại để đối soát. */
export function softDelete(playerId: string, mailId: bigint) {
  return prisma.mail.updateMany({
    where: { mailId, playerId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

/**
 * Xoá hàng loạt thư đã nhận thưởng — nút "Xoá thư đã nhận".
 * Thư còn thưởng chưa nhận KHÔNG bị đụng tới, kể cả người chơi bấm nhầm.
 */
export function softDeleteClaimed(playerId: string) {
  return prisma.mail.updateMany({
    where: { playerId, deletedAt: null, claimedAt: { not: null } },
    data: { deletedAt: new Date() },
  });
}
