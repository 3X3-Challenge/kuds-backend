import { Prisma } from "@prisma/client";
import { prisma } from "../../core/database/prisma";
import { generateUid } from "../../common/utils/uid.util";

export interface CreateUserData {
  username: string;
  passwordHash: string;
  recoveryCodeHash: string;
  displayName?: string;
}

const MAX_UID_ATTEMPTS = 5;

function isUidCollision(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (err.meta?.target as string[] | undefined)?.includes("uid") === true
  );
}

export interface CreateSessionData {
  userId: string;
  refreshTokenHash: string;
  deviceInfo?: string;
  expiresAt: Date;
}

export function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: CreateUserData) {
  for (let attempt = 1; attempt <= MAX_UID_ATTEMPTS; attempt++) {
    try {
      return await prisma.user.create({ data: { ...data, uid: generateUid() } });
    } catch (err) {
      if (!isUidCollision(err) || attempt === MAX_UID_ATTEMPTS) throw err;
    }
  }
  throw new Error("Không thể tạo UID duy nhất sau nhiều lần thử");
}

export function createSession(data: CreateSessionData) {
  return prisma.session.create({ data });
}

export function findSessionByRefreshTokenHash(refreshTokenHash: string) {
  return prisma.session.findUnique({ where: { refreshTokenHash } });
}

/** Rotates a session's refresh token in place (no new row on refresh). */
export function updateSessionToken(
  id: string,
  data: { refreshTokenHash: string; expiresAt: Date; deviceInfo?: string },
) {
  return prisma.session.update({ where: { id }, data });
}

export function countActiveSessions(userId: string) {
  return prisma.session.count({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
}

/** Revokes the oldest active sessions for a user, e.g. to enforce a per-user session cap. */
export async function revokeOldestActiveSessions(userId: string, count: number): Promise<void> {
  if (count <= 0) return;

  const oldest = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    take: count,
    select: { id: true },
  });
  if (oldest.length === 0) return;

  await prisma.session.updateMany({
    where: { id: { in: oldest.map((s) => s.id) } },
    data: { revokedAt: new Date() },
  });
}

/** Deletes revoked or expired sessions; call periodically to keep the table bounded. */
export function deleteStaleSessions() {
  return prisma.session.deleteMany({
    where: {
      OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
  });
}

export function revokeSessionByRefreshTokenHash(refreshTokenHash: string) {
  return prisma.session.updateMany({
    where: { refreshTokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Atomically rotates the user's credentials and force-logs-out every active session. */
export function resetCredentials(
  userId: string,
  data: { passwordHash: string; recoveryCodeHash: string },
) {
  return prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
