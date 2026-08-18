import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export function listPlayerQuests(playerId: string) {
  return prisma.playerQuest.findMany({
    where: { playerId },
    include: { objectives: { orderBy: { ordinal: "asc" } } },
    orderBy: { questKey: "asc" },
  });
}

/** Chỉ nhiệm vụ đã xuất bản mới nhận được. Bản nháp tồn tại nhưng vô hình với người chơi. */
export function findPublishedQuest(tx: TxClient, questKey: string) {
  return tx.quest.findFirst({
    where: { questKey, status: "published" },
    include: { objectives: { orderBy: { ordinal: "asc" } } },
  });
}

export function findPlayerQuest(tx: TxClient, playerId: string, questKey: string) {
  return tx.playerQuest.findUnique({
    where: { playerId_questKey: { playerId, questKey } },
    include: { objectives: true },
  });
}

/**
 * Nhận nhiệm vụ: tạo dòng PlayerQuest kèm đủ dòng tiến độ cho mọi mục tiêu.
 *
 * Tạo sẵn dòng progress = 0 thay vì đẻ ra lúc báo tiến độ đầu tiên: bảng tiến
 * độ có khoá ngoại ghép trỏ về quest_objective, nên tạo sẵn cũng là kiểm luôn
 * rằng mọi ordinal đều có thật ngay tại lúc nhận, chứ không để lộ ra giữa chừng.
 *
 * HAI câu lệnh chứ không phải một nested create, vì cột `quest_key` của
 * player_quest_objective nằm trong CẢ HAI khoá ngoại ghép của bảng:
 *
 *   FOREIGN KEY (player_id, quest_key) → game.player_quest
 *   FOREIGN KEY (quest_key, ordinal)   → content.quest_objective
 *
 * Prisma coi mọi cột thuộc một quan hệ là do quan hệ đó quản, nên trong nested
 * create nó từ chối thẳng tên cột ("Unknown argument `quest_key`") và cũng không
 * suy ra được giá trị cho quan hệ thứ hai. `createMany` thì làm việc trên cột
 * thuần nên ghi được — vẫn cùng transaction, nên vẫn nguyên tử.
 */
export async function acceptQuest(
  tx: TxClient,
  playerId: string,
  questKey: string,
  ordinals: number[],
) {
  const playerQuest = await tx.playerQuest.create({
    data: { playerId, questKey },
  });

  if (ordinals.length > 0) {
    await tx.playerQuestObjective.createMany({
      data: ordinals.map((ordinal) => ({ playerId, questKey, ordinal, progress: 0 })),
    });
  }

  return {
    ...playerQuest,
    objectives: ordinals.map((ordinal) => ({ playerId, questKey, ordinal, progress: 0 })),
  };
}

/**
 * Cộng tiến độ một mục tiêu, chặn trên ở targetCount.
 *
 * LEAST(...) chặn ngay trong SQL: để tiến độ vượt mục tiêu thì màn hình nhiệm vụ
 * hiện "5/3", và mọi phép so sánh "đã xong chưa" phải dùng >= thay vì = ở mọi
 * chỗ về sau. Chặn một lần ở đây rẻ hơn.
 */
export function addProgress(
  tx: TxClient,
  playerId: string,
  questKey: string,
  ordinal: number,
  delta: number,
) {
  return tx.$executeRaw`
    UPDATE game.player_quest_objective pqo
       SET progress = LEAST(pqo.progress + ${delta}::integer, qo.target_count)
      FROM content.quest_objective qo
     WHERE qo.quest_key = pqo.quest_key
       AND qo.ordinal   = pqo.ordinal
       AND pqo.player_id = ${playerId}::uuid
       AND pqo.quest_key = ${questKey}
       AND pqo.ordinal   = ${ordinal}::smallint
  `;
}

/** Còn mục tiêu nào chưa đạt đủ target_count không. 0 ⇒ nhiệm vụ đã xong. */
export async function countUnfinishedObjectives(
  tx: TxClient,
  playerId: string,
  questKey: string,
): Promise<number> {
  const rows = await tx.$queryRaw<{ remaining: bigint }[]>`
    SELECT count(*) AS remaining
      FROM game.player_quest_objective pqo
      JOIN content.quest_objective qo
        ON qo.quest_key = pqo.quest_key AND qo.ordinal = pqo.ordinal
     WHERE pqo.player_id = ${playerId}::uuid
       AND pqo.quest_key = ${questKey}
       AND pqo.progress < qo.target_count
  `;
  return Number(rows[0]?.remaining ?? 0n);
}

/** Chuyển sang 'hoàn thành'. Có điều kiện status hiện tại để không ghi đè 'đã nhận thưởng'. */
export function markCompleted(tx: TxClient, playerId: string, questKey: string) {
  return tx.playerQuest.updateMany({
    where: { playerId, questKey, status: "dang_lam" },
    data: { status: "hoan_thanh", completedAt: new Date() },
  });
}

/**
 * Chốt quyền nhận thưởng nhiệm vụ — cùng cơ chế với thư: điều kiện nằm trong
 * WHERE, count === 1 mới được cộng thưởng.
 */
export async function claimQuest(
  tx: TxClient,
  playerId: string,
  questKey: string,
): Promise<boolean> {
  const result = await tx.playerQuest.updateMany({
    where: { playerId, questKey, status: "hoan_thanh" },
    data: { status: "da_nhan_thuong", claimedAt: new Date() },
  });
  return result.count === 1;
}

/**
 * Nhiệm vụ đã xuất bản mà người chơi CHƯA nhận và đủ điều kiện mở.
 *
 * "Đủ điều kiện" = không đòi nhiệm vụ trước, hoặc nhiệm vụ trước đã hoàn thành.
 * Tính bằng SQL thay vì kéo cả hai danh sách về Node rồi lọc: số nhiệm vụ sẽ
 * lớn dần theo từng chương, còn câu này vẫn là một lượt đi-về.
 */
export function listAvailableQuestKeys(playerId: string) {
  return prisma.$queryRaw<{ quest_key: string }[]>`
    SELECT q.quest_key
      FROM content.quest q
     WHERE q.status = 'published'
       AND NOT EXISTS (
             SELECT 1 FROM game.player_quest pq
              WHERE pq.player_id = ${playerId}::uuid AND pq.quest_key = q.quest_key
           )
       AND (
             q.requires_quest IS NULL
             OR EXISTS (
                  SELECT 1 FROM game.player_quest pq
                   WHERE pq.player_id = ${playerId}::uuid
                     AND pq.quest_key = q.requires_quest
                     AND pq.status IN ('hoan_thanh', 'da_nhan_thuong')
                )
           )
     ORDER BY q.chapter, q.sort_order, q.quest_key
  `;
}
