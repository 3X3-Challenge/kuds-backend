import { Prisma } from "@prisma/client";
import { prisma } from "../../core/database/prisma";
import { generateUid } from "../../common/utils/uid.util";
import type { LoginRow } from "./auth.types";

const USERNAME_PROVIDER = "username";
const GOOGLE_PROVIDER = "google";
const MAX_UID_ATTEMPTS = 5;

export interface CreateAccountData {
  username: string;
  passwordHash: string;
  recoveryCodeHash: string;
  displayName: string;
}

export interface CreatedAccount {
  accountId: string;
  playerId: string;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CreateGoogleAccountData {
  /** `sub` của Google, đã qua verifyGoogleIdToken. */
  subject: string;
  displayName: string;
  avatarUrl: string | null;
}

/** P2002 nào cũng là "trùng", nhưng trùng CỘT NÀO quyết định thông báo cho người dùng. */
export function uniqueViolationTarget(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  const target = err.meta?.target;
  if (Array.isArray(target)) return target.join(",");
  return typeof target === "string" ? target : "";
}

/**
 * Tra cứu đăng nhập bằng MỘT câu: identity + credential + account + player.
 *
 * Viết raw thay vì Prisma vì unique index là `lower(subject)` — Prisma chỉ sinh
 * được `subject = $1` (phân biệt hoa thường) hoặc `mode: 'insensitive'` (dịch ra
 * ILIKE, không dùng được index đó). Người gõ "An" ở máy này và "an" ở máy khác
 * phải vào cùng một tài khoản, và phải vào bằng index chứ không quét cả bảng.
 */
export function findLoginByUsername(username: string) {
  return prisma.$queryRaw<LoginRow[]>`
    SELECT ai.provider,
           ai.subject,
           ai.account_id::text        AS account_id,
           ac.password_hash,
           ac.recovery_code_hash,
           a.status,
           a.banned_until,
           p.player_id::text          AS player_id,
           p.uid,
           p.display_name,
           p.avatar_url,
           p.level,
           p.exp
      FROM game.auth_identity ai
      JOIN game.auth_credential ac
        ON ac.provider = ai.provider AND ac.subject = ai.subject
      JOIN game.account a
        ON a.account_id = ai.account_id
      LEFT JOIN game.player p
        ON p.account_id = a.account_id
     WHERE ai.provider = ${USERNAME_PROVIDER}
       AND lower(ai.subject) = lower(${username})
  `;
}

/**
 * Chạy một hàm tạo nhân vật với uid ngẫu nhiên, thử lại khi đụng uid.
 *
 * uid là 12 số ngẫu nhiên nên có thể đụng nhau. Chỉ bắt ĐÚNG va chạm uid —
 * trùng username hay trùng display_name phải nổi lên cho service dịch thành
 * thông báo riêng, thử lại chỉ tổ trùng tiếp.
 */
async function createWithUniqueUid<T>(create: (uid: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_UID_ATTEMPTS; attempt++) {
    try {
      return await create(generateUid());
    } catch (err) {
      const target = uniqueViolationTarget(err);
      if (target === null || !target.includes("uid") || attempt === MAX_UID_ATTEMPTS) throw err;
    }
  }
  throw new Error("Không thể tạo UID duy nhất sau nhiều lần thử");
}

/**
 * Đăng ký: account → auth_identity → auth_credential → player, một transaction.
 * Nửa chừng lỗi mà không cuộn ngược thì để lại một account không đăng nhập được
 * và một username bị chiếm chỗ vĩnh viễn.
 */
export function createAccount(data: CreateAccountData): Promise<CreatedAccount> {
  return createWithUniqueUid((uid) =>
    prisma.$transaction(async (tx) => {
      const account = await tx.account.create({ data: {} });

      await tx.authIdentity.create({
        data: {
          provider: USERNAME_PROVIDER,
          subject: data.username,
          accountId: account.accountId,
          credential: {
            create: {
              passwordHash: data.passwordHash,
              recoveryCodeHash: data.recoveryCodeHash,
            },
          },
        },
      });

      // Trigger game.player_wallet_seed tạo sẵn dòng ví cho mọi loại tiền ngay
      // sau INSERT này, nên không chỗ nào phải ON CONFLICT lúc cộng tiền.
      const player = await tx.player.create({
        data: {
          accountId: account.accountId,
          uid,
          displayName: data.displayName,
        },
      });

      return {
        accountId: account.accountId,
        playerId: player.playerId,
        uid: player.uid,
        displayName: player.displayName,
        avatarUrl: player.avatarUrl,
      };
    }),
  );
}

// --- Google ---------------------------------------------------------------

/**
 * Tra identity Google. Đi thẳng khoá chính (provider, subject) nên không cần
 * raw SQL như bên username — `sub` của Google là chuỗi số, so sánh đúng từng ký
 * tự mới là đúng, không có chuyện hoa thường.
 */
export function findGoogleIdentity(subject: string) {
  return prisma.authIdentity.findUnique({
    where: { provider_subject: { provider: GOOGLE_PROVIDER, subject } },
    include: { account: { include: { player: true } } },
  });
}

/**
 * Đăng nhập Google lần đầu: account → auth_identity → player, một transaction.
 *
 * KHÔNG có dòng auth_credential — `CHECK (provider = 'username')` bên SQL cấm,
 * và đúng như vậy: tài khoản Google không có mật khẩu để lưu, cũng không có
 * recovery code (mất tài khoản Google thì lấy lại ở phía Google).
 */
export function createGoogleAccount(data: CreateGoogleAccountData): Promise<CreatedAccount> {
  return createWithUniqueUid((uid) =>
    prisma.$transaction(async (tx) => {
      const account = await tx.account.create({ data: {} });

      await tx.authIdentity.create({
        data: {
          provider: GOOGLE_PROVIDER,
          subject: data.subject,
          accountId: account.accountId,
        },
      });

      const player = await tx.player.create({
        data: {
          accountId: account.accountId,
          uid,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        },
      });

      return {
        accountId: account.accountId,
        playerId: player.playerId,
        uid: player.uid,
        displayName: player.displayName,
        avatarUrl: player.avatarUrl,
      };
    }),
  );
}

export function findPlayerById(playerId: string) {
  return prisma.player.findUnique({
    where: { playerId },
    include: { account: true },
  });
}

/** Phiên chỉ lưu accountId, nhưng access token mang playerId — refresh phải tra qua đây. */
export function findPlayerByAccountId(accountId: string) {
  return prisma.player.findUnique({
    where: { accountId },
    include: { account: true },
  });
}

/** Tên đăng nhập gắn với account, để trả kèm hồ sơ. */
export async function findUsernameByAccount(accountId: string): Promise<string | null> {
  const identity = await prisma.authIdentity.findFirst({
    where: { accountId, provider: USERNAME_PROVIDER },
    select: { subject: true },
  });
  return identity?.subject ?? null;
}

export function updatePlayerProfile(
  playerId: string,
  data: { displayName?: string; avatarUrl?: string | null },
) {
  return prisma.player.update({ where: { playerId }, data });
}

export function touchLastLogin(accountId: string) {
  return prisma.account.update({
    where: { accountId },
    data: { lastLoginAt: new Date() },
  });
}

// --- Phiên đăng nhập ------------------------------------------------------

export interface CreateSessionData {
  accountId: string;
  refreshTokenHash: string;
  deviceInfo?: string;
  expiresAt: Date;
}

export function createSession(data: CreateSessionData) {
  return prisma.gameSession.create({ data });
}

export function findSessionByRefreshTokenHash(refreshTokenHash: string) {
  return prisma.gameSession.findUnique({ where: { refreshTokenHash } });
}

/** Xoay token tại chỗ: mỗi lần refresh KHÔNG đẻ thêm dòng phiên mới. */
export function updateSessionToken(
  sessionId: string,
  data: { refreshTokenHash: string; expiresAt: Date; deviceInfo?: string },
) {
  return prisma.gameSession.update({ where: { sessionId }, data });
}

export function countActiveSessions(accountId: string) {
  return prisma.gameSession.count({
    where: { accountId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
}

export async function revokeOldestActiveSessions(accountId: string, count: number): Promise<void> {
  if (count <= 0) return;

  const oldest = await prisma.gameSession.findMany({
    where: { accountId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    take: count,
    select: { sessionId: true },
  });
  if (oldest.length === 0) return;

  await prisma.gameSession.updateMany({
    where: { sessionId: { in: oldest.map((s) => s.sessionId) } },
    data: { revokedAt: new Date() },
  });
}

export function deleteStaleSessions() {
  return prisma.gameSession.deleteMany({
    where: {
      OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
  });
}

export function revokeSessionByRefreshTokenHash(refreshTokenHash: string) {
  return prisma.gameSession.updateMany({
    where: { refreshTokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Đổi mật khẩu VÀ thu hồi mọi phiên đang sống, một transaction. Người vừa lấy
 * lại được tài khoản phải đá được kẻ đang chiếm ra khỏi mọi thiết bị — làm hai
 * bước rời nhau thì kẻ kia còn nguyên refresh token trong khoảng giữa.
 */
export function resetCredentials(
  username: string,
  accountId: string,
  data: { passwordHash: string; recoveryCodeHash: string },
) {
  return prisma.$transaction([
    prisma.authCredential.update({
      where: { provider_subject: { provider: USERNAME_PROVIDER, subject: username } },
      data,
    }),
    prisma.gameSession.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
