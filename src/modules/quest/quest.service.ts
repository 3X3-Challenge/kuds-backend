import * as questRepository from "./quest.repository";
import { prisma } from "../../core/database/prisma";
import { grantRewardLines, snapshotBundle } from "../../common/services/economy.service";
import { ConflictError, NotFoundError, UnprocessableError } from "../../common/errors";
import type { QuestProgressInput } from "./quest.schema";

export async function listQuests(playerId: string) {
  const [progress, available] = await Promise.all([
    questRepository.listPlayerQuests(playerId),
    questRepository.listAvailableQuestKeys(playerId),
  ]);

  return {
    quests: progress.map((q) => ({
      questKey: q.questKey,
      status: q.status,
      startedAt: q.startedAt,
      completedAt: q.completedAt,
      claimedAt: q.claimedAt,
      objectives: q.objectives.map((o) => ({ ordinal: o.ordinal, progress: o.progress })),
    })),
    /** Nhiệm vụ mở khoá nhưng chưa nhận — nguồn của dấu chấm than trên đầu NPC. */
    availableQuestKeys: available.map((a) => a.quest_key),
  };
}

export async function acceptQuest(playerId: string, questKey: string) {
  return prisma.$transaction(async (tx) => {
    const quest = await questRepository.findPublishedQuest(tx, questKey);
    if (!quest) {
      throw new NotFoundError("Nhiệm vụ không tồn tại hoặc chưa mở");
    }

    const existing = await questRepository.findPlayerQuest(tx, playerId, questKey);
    if (existing) {
      throw new ConflictError("Đã nhận nhiệm vụ này rồi");
    }

    // Điều kiện tiên quyết. DB chỉ chặn được nhiệm vụ tự trỏ chính nó; chuỗi phụ
    // thuộc phải kiểm ở đây, nếu không người chơi gọi thẳng API là nhảy cóc được
    // cả chương.
    if (quest.requiresQuest) {
      const required = await questRepository.findPlayerQuest(tx, playerId, quest.requiresQuest);
      const done =
        required?.status === "hoan_thanh" || required?.status === "da_nhan_thuong";
      if (!done) {
        throw new UnprocessableError(`Phải hoàn thành nhiệm vụ ${quest.requiresQuest} trước`);
      }
    }

    const created = await questRepository.acceptQuest(
      tx,
      playerId,
      questKey,
      quest.objectives.map((o) => o.ordinal),
    );

    // Nhiệm vụ không có mục tiêu nào (nhiệm vụ "đọc thoại") xong ngay lúc nhận.
    if (quest.objectives.length === 0) {
      await questRepository.markCompleted(tx, playerId, questKey);
    }

    return {
      questKey,
      status: quest.objectives.length === 0 ? "hoan_thanh" : created.status,
      objectives: created.objectives.map((o) => ({ ordinal: o.ordinal, progress: o.progress })),
    };
  });
}

/**
 * Báo tiến độ.
 *
 * Sau khi cộng thì hỏi lại DB "còn mục tiêu nào chưa đủ không" thay vì tự cộng
 * trong Node: hai request báo tiến độ song song đều đọc được tiến độ trước khi
 * request kia ghi, và cả hai cùng kết luận sai. Câu đếm chạy sau mọi UPDATE
 * trong cùng transaction nên nó thấy trạng thái đã ổn định.
 */
export async function addProgress(
  playerId: string,
  questKey: string,
  input: QuestProgressInput,
) {
  return prisma.$transaction(async (tx) => {
    const playerQuest = await questRepository.findPlayerQuest(tx, playerId, questKey);
    if (!playerQuest) {
      throw new NotFoundError("Chưa nhận nhiệm vụ này");
    }
    if (playerQuest.status !== "dang_lam") {
      throw new ConflictError("Nhiệm vụ đã hoàn thành");
    }

    for (const objective of input.objectives) {
      const affected = await questRepository.addProgress(
        tx,
        playerId,
        questKey,
        objective.ordinal,
        objective.delta,
      );
      if (affected === 0) {
        throw new UnprocessableError(`Nhiệm vụ này không có mục tiêu số ${objective.ordinal}`);
      }
    }

    const remaining = await questRepository.countUnfinishedObjectives(tx, playerId, questKey);
    if (remaining === 0) {
      await questRepository.markCompleted(tx, playerId, questKey);
    }

    const updated = await questRepository.findPlayerQuest(tx, playerId, questKey);
    return {
      questKey,
      status: updated!.status,
      objectives: updated!.objectives
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((o) => ({ ordinal: o.ordinal, progress: o.progress })),
    };
  });
}

export async function claimQuest(playerId: string, questKey: string) {
  return prisma.$transaction(async (tx) => {
    const playerQuest = await questRepository.findPlayerQuest(tx, playerId, questKey);
    if (!playerQuest) {
      throw new NotFoundError("Chưa nhận nhiệm vụ này");
    }
    if (playerQuest.status === "da_nhan_thuong") {
      throw new ConflictError("Đã nhận thưởng nhiệm vụ này rồi");
    }
    if (playerQuest.status !== "hoan_thanh") {
      throw new UnprocessableError("Nhiệm vụ chưa hoàn thành");
    }

    const locked = await questRepository.claimQuest(tx, playerId, questKey);
    if (!locked) {
      throw new ConflictError("Đã nhận thưởng nhiệm vụ này rồi");
    }

    const quest = await questRepository.findPublishedQuest(tx, questKey);
    // Chụp gói thưởng ngay lúc nhận. Nhiệm vụ không có bundleId (nhiệm vụ dẫn
    // truyện) thì mảng rỗng — hợp lệ, không phải lỗi.
    const lines = quest?.bundleId ? await snapshotBundle(tx, quest.bundleId) : [];

    const granted = await grantRewardLines(tx, playerId, lines, {
      reason: "thuong_nhiem_vu",
      refType: "player_quest",
      refId: questKey,
      idempotencyKey: `quest:${playerId}:${questKey}`,
    });

    return { questKey, status: "da_nhan_thuong", rewards: granted };
  });
}
