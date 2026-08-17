import * as authRepository from "./auth.repository";
import {
  hashPassword,
  verifyPassword,
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "../../common/utils/password.util";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
} from "../../common/utils/token.util";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../common/errors";
import { env } from "../../config/env";
import type { RegisterInput, LoginInput, RefreshInput, ResetPasswordInput } from "./auth.schema";
import type { AuthTokens, PublicUser } from "./auth.types";

async function issueSession(userId: string, deviceInfo?: string): Promise<AuthTokens> {
  const activeCount = await authRepository.countActiveSessions(userId);
  if (activeCount >= env.maxSessionsPerUser) {
    await authRepository.revokeOldestActiveSessions(
      userId,
      activeCount - env.maxSessionsPerUser + 1,
    );
  }

  const refreshToken = generateRefreshToken();
  await authRepository.createSession({
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    deviceInfo,
    expiresAt: refreshTokenExpiryDate(),
  });

  return { accessToken: signAccessToken(userId), refreshToken };
}

export async function register(input: RegisterInput, deviceInfo?: string) {
  const existing = await authRepository.findUserByUsername(input.username);
  if (existing) {
    throw new ConflictError("Username đã tồn tại");
  }

  const recoveryCode = generateRecoveryCode();
  const user = await authRepository.createUser({
    username: input.username,
    passwordHash: await hashPassword(input.password),
    recoveryCodeHash: await hashRecoveryCode(recoveryCode),
    displayName: input.displayName,
  });

  const tokens = await issueSession(user.id, deviceInfo);
  const publicUser: PublicUser = {
    id: user.id,
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
  };

  return {
    user: publicUser,
    // Shown exactly once — the caller must prompt the user to save this now.
    recoveryCode,
    ...tokens,
  };
}

export async function login(input: LoginInput, deviceInfo?: string) {
  const user = await authRepository.findUserByUsername(input.username);
  if (!user || user.status !== "active") {
    throw new UnauthorizedError("Sai username hoặc mật khẩu");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Sai username hoặc mật khẩu");
  }

  const tokens = await issueSession(user.id, deviceInfo);
  const publicUser: PublicUser = {
    id: user.id,
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
  };

  return { user: publicUser, ...tokens };
}

export async function refresh(input: RefreshInput, deviceInfo?: string): Promise<AuthTokens> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  const session = await authRepository.findSessionByRefreshTokenHash(tokenHash);

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token không hợp lệ hoặc đã hết hạn");
  }

  // Rotate in place: same session row gets a new token instead of a new row per refresh.
  const refreshToken = generateRefreshToken();
  await authRepository.updateSessionToken(session.id, {
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiryDate(),
    deviceInfo,
  });

  return { accessToken: signAccessToken(session.userId), refreshToken };
}

export async function logout(input: RefreshInput): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await authRepository.revokeSessionByRefreshTokenHash(tokenHash);
}

/** Deletes revoked/expired session rows. Intended to run on a periodic schedule. */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await authRepository.deleteStaleSessions();
  return result.count;
}

export async function resetPassword(input: ResetPasswordInput) {
  const user = await authRepository.findUserByUsername(input.username);
  if (!user) {
    throw new UnauthorizedError("Recovery code không hợp lệ");
  }

  const valid = await verifyRecoveryCode(input.recoveryCode, user.recoveryCodeHash);
  if (!valid) {
    throw new UnauthorizedError("Recovery code không hợp lệ");
  }

  const newRecoveryCode = generateRecoveryCode();
  await authRepository.resetCredentials(user.id, {
    passwordHash: await hashPassword(input.newPassword),
    recoveryCodeHash: await hashRecoveryCode(newRecoveryCode),
  });

  return { recoveryCode: newRecoveryCode };
}

export async function getCurrentUser(userId: string) {
  const user = await authRepository.findUserById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  return {
    id: user.id,
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}
