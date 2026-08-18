import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { env } from "../../config/env";

export interface AccessTokenPayload {
  /** game.player.player_id */
  sub: string;
  /** game.account.account_id */
  acc: string;
}

export function signAccessToken(playerId: string, accountId: string): string {
  return jwt.sign({ sub: playerId, acc: accountId } satisfies AccessTokenPayload, env.jwtSecret, {
    expiresIn: env.accessTokenTtl as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
}

export interface AdminTokenPayload {
  /** admin.admin_user.admin_id */
  sub: string;
  email: string;
  role: "viewer" | "editor" | "publisher";
}

/**
 * Token quản trị ký bằng bí mật KHÁC token người chơi, nên một token người chơi
 * không bao giờ verify được ở cửa admin dù có sửa payload thế nào.
 */
export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, env.adminJwtSecret, {
    expiresIn: env.adminTokenTtl as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, env.adminJwtSecret) as AdminTokenPayload;
}

/** Opaque, high-entropy refresh token. Only its SHA-256 hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiryDate(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.refreshTokenTtlDays);
  return expires;
}
