import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export function listPlayerAchievements(playerId: string) {
  return prisma.playerAchievement.findMany({
    where: { playerId },
    orderBy: { achievementKey: "asc" },
  });
}

export function findPublishedAchievement(tx: TxClient, achievementKey: string) {
  return tx.achievement.findFirst({
    where: { achievementKey, status: "published" },
  });
}

export function findPlayerAchievement(tx: TxClient, playerId: string, achievementKey: string) {
  return tx.playerAchievement.findUnique({
    where: { playerId_achievementKey: { playerId, achievementKey } },
  });
}

/**
 * Cộng tiến độ, tạo dòng nếu chưa có, chặn trên ở target_count, và đặt
 * unlocked_at đúng lần chạm mốc đầu tiên — tất cả trong MỘT câu.
 *
 * Khác nhiệm vụ (dòng tiến độ tạo sẵn lúc nhận), thành tựu không có bước "nhận"
 * nên dòng phải đẻ ra ở lần báo tiến độ đầu tiên. Tách thành SELECT-rồi-INSERT
 * thì hai request đầu tiên chạy song song sẽ cùng thấy "chưa có" và cùng INSERT,
 * một trong hai ăn lỗi khoá chính. ON CONFLICT dồn cả hai trường hợp vào một câu.
 *
 * `unlocked_at` chỉ ghi khi đang NULL: mở khoá lại lần nữa không được phép làm
 * mới mốc thời gian đã có.
 */
export async function addProgress(
  tx: TxClient,
  playerId: string,
  achievementKey: string,
  delta: number,
): Promise<{ progress: bigint; unlocked_at: Date | null } | undefined> {
  const rows = await tx.$queryRaw<{ progress: bigint; unlocked_at: Date | null }[]>`
    INSERT INTO game.player_achievement (player_id, achievement_key, progress, unlocked_at)
    SELECT ${playerId}::uuid,
           a.achievement_key,
           LEAST(${delta}::bigint, a.target_count),
           CASE WHEN LEAST(${delta}::bigint, a.target_count) >= a.target_count
                THEN now() END
      FROM content.achievement a
     WHERE a.achievement_key = ${achievementKey}
       AND a.status = 'published'
    ON CONFLICT (player_id, achievement_key) DO UPDATE
       SET progress = LEAST(
                        game.player_achievement.progress + EXCLUDED.progress,
                        (SELECT target_count FROM content.achievement
                          WHERE achievement_key = EXCLUDED.achievement_key)
                      ),
           unlocked_at = COALESCE(
                           game.player_achievement.unlocked_at,
                           CASE WHEN LEAST(
                                      game.player_achievement.progress + EXCLUDED.progress,
                                      (SELECT target_count FROM content.achievement
                                        WHERE achievement_key = EXCLUDED.achievement_key)
                                    ) >= (SELECT target_count FROM content.achievement
                                           WHERE achievement_key = EXCLUDED.achievement_key)
                                THEN now() END
                         )
    RETURNING progress, unlocked_at
  `;
  return rows[0];
}

/**
 * Chốt quyền nhận thưởng thành tựu. `unlocked_at IS NOT NULL AND claimed_at IS
 * NULL` nằm trong WHERE — cùng cơ chế với thư và nhiệm vụ.
 */
export async function claimAchievement(
  tx: TxClient,
  playerId: string,
  achievementKey: string,
): Promise<boolean> {
  const result = await tx.playerAchievement.updateMany({
    where: { playerId, achievementKey, unlockedAt: { not: null }, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  return result.count === 1;
}
