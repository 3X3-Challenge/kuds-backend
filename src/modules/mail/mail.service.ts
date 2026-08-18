import type { Mail } from "@prisma/client";
import * as mailRepository from "./mail.repository";
import { prisma } from "../../core/database/prisma";
import {
  grantRewardLines,
  parseRewardSnapshot,
  type GrantedReward,
} from "../../common/services/economy.service";
import { ConflictError, NotFoundError } from "../../common/errors";
import type { MailListQuery } from "./mail.schema";

function toDto(mail: Mail) {
  return {
    mailId: mail.mailId.toString(),
    templateKey: mail.templateKey,
    title: mail.title,
    sender: mail.sender,
    body: mail.body,
    /** Bản chụp lúc gửi — KHÔNG join ngược về gói thưởng hiện tại. */
    rewards: parseRewardSnapshot(mail.rewardSnapshot),
    sentAt: mail.sentAt,
    readAt: mail.readAt,
    claimedAt: mail.claimedAt,
    expiresAt: mail.expiresAt,
  };
}

export async function listMails(playerId: string, query: MailListQuery) {
  const mails = await mailRepository.listMails(playerId, {
    limit: query.limit,
    cursor: query.cursor ? BigInt(query.cursor) : undefined,
    includeClaimed: query.includeClaimed,
  });

  const items = mails.map(toDto);
  const nextCursor = items.length === query.limit ? items[items.length - 1]!.mailId : null;

  // Mẫu số của "8 / 50" trên thanh tiêu đề Hòm thư. Trước đây MailScreenController
  // hard-code cả tử lẫn mẫu; giờ tử số đến từ đây, mẫu từ player.mailCapacity.
  const total = await mailRepository.countInbox(playerId);

  return { items, nextCursor, total };
}

export async function markRead(playerId: string, mailId: string) {
  await mailRepository.markRead(playerId, BigInt(mailId));
  return { mailId, readAt: new Date() };
}

/**
 * Nhận thưởng của một thư.
 *
 * Thứ tự bắt buộc, cả ba trong CÙNG transaction:
 *   1. đọc thư (lấy bản chụp thưởng)
 *   2. UPDATE ... WHERE claimed_at IS NULL  ← chốt chặn thật sự
 *   3. cộng tiền/vật phẩm
 *
 * Đảo 2 và 3 thì hai lần bấm "Nhận" trùng nhau sẽ cùng qua được bước cộng trước
 * khi bước chốt kịp chạy, và người chơi nhận thưởng hai lần.
 */
export async function claimMail(playerId: string, mailIdRaw: string) {
  const mailId = BigInt(mailIdRaw);

  return prisma.$transaction(async (tx) => {
    const mail = await mailRepository.findMail(tx, playerId, mailId);
    if (!mail) {
      throw new NotFoundError("Không tìm thấy thư");
    }
    if (mail.expiresAt && mail.expiresAt <= new Date()) {
      throw new ConflictError("Thư đã hết hạn");
    }

    const locked = await mailRepository.claimMail(tx, playerId, mailId);
    if (!locked) {
      throw new ConflictError("Thư này đã nhận thưởng rồi");
    }

    const lines = parseRewardSnapshot(mail.rewardSnapshot);
    const granted = await grantRewardLines(tx, playerId, lines, {
      reason: "nhan_thu",
      refType: "mail",
      refId: mailIdRaw,
      // Khoá chống cộng hai lần ở tầng sổ cái. Bước chốt phía trên mới là chính,
      // đây là lớp thứ hai cho trường hợp có ai đó gọi thẳng vào service này.
      idempotencyKey: `mail:${mailIdRaw}`,
    });

    return { mailId: mailIdRaw, rewards: granted };
  });
}

/**
 * "Nhận hết".
 *
 * Toàn bộ trong MỘT transaction: một thư lỗi thì cuộn ngược tất cả. Chấp nhận
 * đánh đổi này thay vì nhận từng thư độc lập, vì người chơi thấy "nhận được 3/7
 * thư" mà không biết 4 thư kia hỏng ở đâu thì tệ hơn là thử lại toàn bộ.
 */
export async function claimAll(playerId: string) {
  return prisma.$transaction(async (tx) => {
    const claimable = await mailRepository.listClaimable(tx, playerId);

    const granted: GrantedReward[] = [];
    const claimedIds: string[] = [];

    for (const mail of claimable) {
      const locked = await mailRepository.claimMail(tx, playerId, mail.mailId);
      // Ai đó vừa nhận thư này ở thiết bị khác giữa lúc mình liệt kê và lúc mình
      // chốt. Bỏ qua, không phải lỗi.
      if (!locked) continue;

      const id = mail.mailId.toString();
      claimedIds.push(id);
      granted.push(
        ...(await grantRewardLines(tx, playerId, parseRewardSnapshot(mail.rewardSnapshot), {
          reason: "nhan_thu",
          refType: "mail",
          refId: id,
          idempotencyKey: `mail:${id}`,
        })),
      );
    }

    return { claimedMailIds: claimedIds, rewards: granted };
  });
}

export async function deleteMail(playerId: string, mailId: string) {
  const result = await mailRepository.softDelete(playerId, BigInt(mailId));
  if (result.count === 0) {
    throw new NotFoundError("Không tìm thấy thư");
  }
  return { mailId, deleted: true };
}

export async function deleteClaimed(playerId: string) {
  const result = await mailRepository.softDeleteClaimed(playerId);
  return { deletedCount: result.count };
}
