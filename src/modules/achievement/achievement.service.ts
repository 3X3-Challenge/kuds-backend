import * as achievementRepository from "./achievement.repository";
import { prisma } from "../../core/database/prisma";
import { grantRewardLines, snapshotBundle } from "../../common/services/economy.service";
import { ConflictError, NotFoundError, UnprocessableError } from "../../common/errors";
import { toNumber } from "../../common/utils/serialize.util";
import type { AchievementProgressInput } from "./achievement.schema";

export async function listAchievements(playerId: string) {
  const rows = await achievementRepository.listPlayerAchievements(playerId);
  return rows.map((a) => ({
    achievementKey: a.achievementKey,
    progress: toNumber(a.progress),
    unlockedAt: a.unlockedAt,
    claimedAt: a.claimedAt,
  }));
}

export async function addProgress(
  playerId: string,
  achievementKey: string,
  input: AchievementProgressInput,
) {
  return prisma.$transaction(async (tx) => {
    const row = await achievementRepository.addProgress(
      tx,
      playerId,
      achievementKey,
      input.delta,
    );

    // 0 dòng = thành tựu không tồn tại hoặc chưa xuất bản. INSERT ... SELECT rỗng
    // không ghi gì và cũng không báo lỗi, nên phải tự phát hiện ở đây.
    if (!row) {
      throw new NotFoundError("Thành tựu không tồn tại hoặc chưa mở");
    }

    return {
      achievementKey,
      progress: toNumber(row.progress),
      unlockedAt: row.unlocked_at,
    };
  });
}

export async function claimAchievement(playerId: string, achievementKey: string) {
  return prisma.$transaction(async (tx) => {
    const progress = await achievementRepository.findPlayerAchievement(
      tx,
      playerId,
      achievementKey,
    );
    if (!progress) {
      throw new NotFoundError("Chưa có tiến độ cho thành tựu này");
    }
    if (progress.claimedAt) {
      throw new ConflictError("Đã nhận thưởng thành tựu này rồi");
    }
    if (!progress.unlockedAt) {
      throw new UnprocessableError("Thành tựu chưa mở khoá");
    }

    const locked = await achievementRepository.claimAchievement(tx, playerId, achievementKey);
    if (!locked) {
      throw new ConflictError("Đã nhận thưởng thành tựu này rồi");
    }

    const achievement = await achievementRepository.findPublishedAchievement(tx, achievementKey);
    const lines = achievement?.bundleId ? await snapshotBundle(tx, achievement.bundleId) : [];

    const granted = await grantRewardLines(tx, playerId, lines, {
      reason: "thuong_thanh_tuu",
      refType: "player_achievement",
      refId: achievementKey,
      idempotencyKey: `achievement:${playerId}:${achievementKey}`,
    });

    return { achievementKey, rewards: granted };
  });
}
