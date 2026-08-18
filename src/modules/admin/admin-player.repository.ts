import { Prisma } from "@prisma/client";
import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export interface PlayerListParams {
  limit: number;
  offset: number;
  q?: string;
  status?: string;
}

export async function listPlayers(params: PlayerListParams) {
  const where: Prisma.PlayerWhereInput = {
    ...(params.status ? { account: { status: params.status } } : {}),
    ...(params.q
      ? {
          OR: [
            { uid: { contains: params.q } },
            { displayName: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.player.findMany({
      where,
      include: {
        account: { select: { accountId: true, status: true, bannedUntil: true, lastLoginAt: true } },
        wallets: true,
      },
      orderBy: { createdAt: "desc" },
      skip: params.offset,
      take: params.limit,
    }),
    prisma.player.count({ where }),
  ]);

  return { rows, total };
}

export function findPlayer(playerId: string) {
  return prisma.player.findUnique({
    where: { playerId },
    include: {
      account: true,
      wallets: true,
      inventory: { orderBy: { itemKey: "asc" } },
      equipment: true,
      quests: true,
      achievements: true,
      save: true,
    },
  });
}

export function findPlayerBrief(tx: TxClient, playerId: string) {
  return tx.player.findUnique({
    where: { playerId },
    select: { playerId: true, accountId: true, uid: true, displayName: true },
  });
}

/**
 * Cấm / gỡ cấm.
 *
 * Hai CHECK bên SQL ràng buộc chặt cặp (status, banned_until):
 *   CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
 *   CHECK (status = 'banned' OR banned_until IS NULL)
 * Nên gỡ cấm BẮT BUỘC phải xoá banned_until cùng lúc, không thể làm hai bước.
 *
 * Cấm xong thu hồi luôn mọi phiên: để nguyên thì kẻ bị cấm vẫn chơi tiếp bằng
 * access token đang cầm cho tới khi nó hết hạn.
 */
export function setBan(
  tx: TxClient,
  accountId: string,
  banned: boolean,
  bannedUntil: Date | null,
) {
  return Promise.all([
    tx.account.update({
      where: { accountId },
      data: {
        status: banned ? "banned" : "active",
        bannedUntil: banned ? bannedUntil : null,
      },
    }),
    banned
      ? tx.gameSession.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      : Promise.resolve(null),
  ]);
}

export interface MailContent {
  title: string;
  sender: string;
  body: string;
  /**
   * bundleId và rewardSnapshot đi thành CẶP, luôn cùng NULL hoặc cùng có giá trị.
   * CHECK ((bundle_id IS NULL) = (reward_snapshot IS NULL)) bên SQL từ chối mọi
   * tổ hợp nửa vời, nên đừng tách hai trường này ra thành hai tham số rời.
   */
  bundleId: bigint | null;
  rewardSnapshot: Prisma.InputJsonValue | null;
  expiresAt: Date | null;
}

/**
 * Gửi thư cho một danh sách người chơi cụ thể.
 *
 * Lọc theo sức chứa hòm thư ngay trong câu INSERT: người đầy hòm thì không nhận,
 * và số dòng thật sự chèn cho biết ai bị bỏ qua. Kiểm bằng SELECT rồi INSERT sẽ
 * sai khi người chơi vừa nhận thư khác trong lúc đó.
 */
export async function sendMailTo(
  tx: TxClient,
  playerIds: string[],
  content: MailContent,
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO game.mail (player_id, title, sender, body, bundle_id, reward_snapshot, expires_at)
    SELECT p.player_id,
           ${content.title},
           ${content.sender},
           ${content.body},
           ${content.bundleId}::bigint,
           ${content.rewardSnapshot === null ? null : JSON.stringify(content.rewardSnapshot)}::jsonb,
           ${content.expiresAt}::timestamptz
      FROM game.player p
     WHERE p.player_id = ANY(${playerIds}::uuid[])
       AND (
             SELECT count(*) FROM game.mail m
              WHERE m.player_id = p.player_id AND m.deleted_at IS NULL
           ) < p.mail_capacity
  `;
}

/** Gửi cho toàn bộ người chơi còn hoạt động. Cùng luật sức chứa như trên. */
export async function broadcastMail(tx: TxClient, content: MailContent): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO game.mail (player_id, title, sender, body, bundle_id, reward_snapshot, expires_at)
    SELECT p.player_id,
           ${content.title},
           ${content.sender},
           ${content.body},
           ${content.bundleId}::bigint,
           ${content.rewardSnapshot === null ? null : JSON.stringify(content.rewardSnapshot)}::jsonb,
           ${content.expiresAt}::timestamptz
      FROM game.player p
      JOIN game.account a ON a.account_id = p.account_id
     WHERE a.status = 'active'
       AND (
             SELECT count(*) FROM game.mail m
              WHERE m.player_id = p.player_id AND m.deleted_at IS NULL
           ) < p.mail_capacity
  `;
}

export function countActivePlayers() {
  return prisma.player.count({ where: { account: { status: "active" } } });
}

/** Tra gói thưởng theo khoá tự nhiên, kèm các dòng thưởng để chụp lại. */
export function findBundleByKey(tx: TxClient, bundleKey: string) {
  return tx.rewardBundle.findUnique({
    where: { bundleKey },
    include: { lines: { orderBy: { ordinal: "asc" } } },
  });
}
