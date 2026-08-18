import { randomInt } from "node:crypto";
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
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../common/errors";
import { verifyGoogleIdToken, type GoogleProfile } from "../../common/utils/google.util";
import { env } from "../../config/env";
import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  ResetPasswordInput,
  UpdateProfileInput,
  GoogleLoginInput,
} from "./auth.schema";
import type { AuthTokens, LoginRow, PublicPlayer } from "./auth.types";

/**
 * Phát cặp token cho một account. Vượt trần phiên thì thu hồi phiên CŨ NHẤT chứ
 * không từ chối đăng nhập: người chơi đổi máy liên tục vẫn vào được, chỉ máy bỏ
 * lâu nhất bị đá.
 */
async function issueSession(
  accountId: string,
  playerId: string,
  deviceInfo?: string,
): Promise<AuthTokens> {
  const activeCount = await authRepository.countActiveSessions(accountId);
  if (activeCount >= env.maxSessionsPerUser) {
    await authRepository.revokeOldestActiveSessions(
      accountId,
      activeCount - env.maxSessionsPerUser + 1,
    );
  }

  const refreshToken = generateRefreshToken();
  await authRepository.createSession({
    accountId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    deviceInfo,
    expiresAt: refreshTokenExpiryDate(),
  });

  return { accessToken: signAccessToken(playerId, accountId), refreshToken };
}

/**
 * Tài khoản bị cấm / đã xoá thì chặn ngay tại cửa. Hạn cấm đã qua vẫn cho vào —
 * cấm có thời hạn tự hết mà không cần job nào chạy để gỡ.
 */
function assertAccountUsable(status: string, bannedUntil: Date | null): void {
  if (status === "deleted") {
    throw new UnauthorizedError("Tài khoản không tồn tại");
  }
  if (status === "banned") {
    if (!bannedUntil) {
      throw new ForbiddenError("Tài khoản đã bị khoá vĩnh viễn");
    }
    if (bannedUntil > new Date()) {
      throw new ForbiddenError(
        `Tài khoản bị khoá tới ${bannedUntil.toISOString()}`,
      );
    }
  }
}

function toPublicPlayer(row: LoginRow): PublicPlayer {
  return {
    playerId: row.player_id!,
    accountId: row.account_id,
    uid: row.uid!,
    username: row.subject,
    displayName: row.display_name!,
    avatarUrl: row.avatar_url,
    level: row.level!,
    exp: row.exp!,
  };
}

/** Bản đọc từ model Prisma `Player`, dùng cho các lối vào không đi qua LoginRow. */
interface PlayerRecord {
  playerId: string;
  accountId: string;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  exp: number;
}

/**
 * username rỗng là hợp lệ: tài khoản chỉ gắn Google thì không có identity
 * 'username' nào để lấy tên đăng nhập.
 */
function toPublicPlayerFromRecord(player: PlayerRecord, username: string | null): PublicPlayer {
  return {
    playerId: player.playerId,
    accountId: player.accountId,
    uid: player.uid,
    username: username ?? "",
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    level: player.level,
    exp: player.exp,
  };
}

export async function register(input: RegisterInput, deviceInfo?: string) {
  const recoveryCode = generateRecoveryCode();

  let created;
  try {
    created = await authRepository.createAccount({
      username: input.username,
      passwordHash: await hashPassword(input.password),
      recoveryCodeHash: await hashRecoveryCode(recoveryCode),
      displayName: input.displayName ?? input.username,
    });
  } catch (err) {
    // Kiểm trước bằng SELECT rồi mới INSERT vẫn thua cuộc đua giữa hai request;
    // để unique index của DB phán, rồi dịch lỗi nó trả về.
    const target = authRepository.uniqueViolationTarget(err);
    if (target !== null) {
      if (target.includes("display_name") || target.includes("player_name")) {
        throw new ConflictError("Tên hiển thị đã có người dùng");
      }
      throw new ConflictError("Username đã tồn tại");
    }
    throw err;
  }

  const tokens = await issueSession(created.accountId, created.playerId, deviceInfo);

  const player: PublicPlayer = {
    playerId: created.playerId,
    accountId: created.accountId,
    uid: created.uid,
    username: input.username,
    displayName: created.displayName,
    avatarUrl: created.avatarUrl,
    level: 1,
    exp: 0,
  };

  return {
    player,
    // Hiện đúng một lần — client BẮT BUỘC phải bắt người chơi lưu lại ngay đây.
    recoveryCode,
    ...tokens,
  };
}

export async function login(input: LoginInput, deviceInfo?: string) {
  const [row] = await authRepository.findLoginByUsername(input.username);

  // Sai tên và sai mật khẩu trả cùng một câu: phân biệt là biếu không cho kẻ
  // dò tài khoản danh sách username có thật.
  if (!row) {
    throw new UnauthorizedError("Sai username hoặc mật khẩu");
  }

  const valid = await verifyPassword(input.password, row.password_hash);
  if (!valid) {
    throw new UnauthorizedError("Sai username hoặc mật khẩu");
  }

  assertAccountUsable(row.status, row.banned_until);

  // LEFT JOIN nên player_id có thể NULL: account tồn tại mà chưa có nhân vật.
  // Không xảy ra với luồng đăng ký hiện tại, nhưng sẽ xảy ra nếu sau này tách
  // bước tạo nhân vật ra khỏi bước tạo tài khoản.
  if (!row.player_id) {
    throw new NotFoundError("Tài khoản chưa có nhân vật");
  }

  const tokens = await issueSession(row.account_id, row.player_id, deviceInfo);
  await authRepository.touchLastLogin(row.account_id);

  return { player: toPublicPlayer(row), ...tokens };
}

// --- Đăng nhập bằng Google ------------------------------------------------

/** Khớp trần của `displayName` trong auth.schema.ts và cột game.player.display_name. */
const DISPLAY_NAME_MAX = 64;
const AVATAR_URL_MAX = 512;
const DEFAULT_DISPLAY_NAME = "Người chơi";
const MAX_DISPLAY_NAME_ATTEMPTS = 5;

/**
 * Tên Google là tên thật, mà lower(display_name) là unique index — "Nguyễn Văn A"
 * đụng nhau là chuyện sẽ xảy ra, không phải có thể. Hàm này chỉ lo dọn chuỗi cho
 * vừa cột; gỡ đụng độ là việc của vòng thử lại trong createGooglePlayer.
 */
function baseDisplayName(name: string | null): string {
  const cleaned = (name ?? "").trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned.slice(0, DISPLAY_NAME_MAX) : DEFAULT_DISPLAY_NAME;
}

/**
 * Ảnh đại diện Google chỉ nhận khi là https và đủ ngắn. `picture` nằm trong một
 * token đã verify nên không phải người lạ bịa ra, nhưng nó vẫn là URL mà client
 * sẽ tải về và trang quản trị sẽ hiển thị — không đáng để tin mù quáng.
 */
function safeAvatarUrl(url: string | null): string | null {
  if (!url || url.length > AVATAR_URL_MAX) return null;
  return url.startsWith("https://") ? url : null;
}

type GoogleIdentityRecord = NonNullable<
  Awaited<ReturnType<typeof authRepository.findGoogleIdentity>>
>;

/** Đường vào cho identity Google ĐÃ tồn tại — giống hệt phần đuôi của login(). */
async function resumeGoogleSession(identity: GoogleIdentityRecord, deviceInfo?: string) {
  const { account } = identity;
  assertAccountUsable(account.status, account.bannedUntil);

  if (!account.player) {
    throw new NotFoundError("Tài khoản chưa có nhân vật");
  }

  const tokens = await issueSession(account.accountId, account.player.playerId, deviceInfo);
  await authRepository.touchLastLogin(account.accountId);

  // Một account gắn được CẢ username lẫn Google. Hồ sơ trả về phải mang đúng tên
  // đăng nhập đó, không phải chuỗi rỗng.
  const username = await authRepository.findUsernameByAccount(account.accountId);

  return { player: toPublicPlayerFromRecord(account.player, username), ...tokens };
}

/** Tạo tài khoản Google, gắn số phía sau tên khi tên Google đã có người dùng. */
async function createGooglePlayer(profile: GoogleProfile) {
  const base = baseDisplayName(profile.name);
  const avatarUrl = safeAvatarUrl(profile.pictureUrl);

  for (let attempt = 1; attempt <= MAX_DISPLAY_NAME_ATTEMPTS; attempt++) {
    // Cắt bớt 5 ký tự để chừa chỗ cho " 1234" mà vẫn nằm trong DISPLAY_NAME_MAX.
    const displayName =
      attempt === 1 ? base : `${base.slice(0, DISPLAY_NAME_MAX - 5)} ${randomInt(1000, 10000)}`;

    try {
      return await authRepository.createGoogleAccount({
        subject: profile.subject,
        displayName,
        avatarUrl,
      });
    } catch (err) {
      const target = authRepository.uniqueViolationTarget(err);
      const nameTaken =
        target !== null && (target.includes("display_name") || target.includes("player_name"));
      if (!nameTaken || attempt === MAX_DISPLAY_NAME_ATTEMPTS) throw err;
    }
  }

  throw new Error("Không tạo được tên hiển thị chưa bị trùng");
}

/**
 * Đăng nhập bằng Google. Client tự lấy ID token qua SDK của Google rồi gửi lên;
 * ở đây chỉ còn việc verify chữ ký (xem common/utils/google.util.ts) rồi đổi
 * `sub` lấy cặp token của game.
 *
 * Chưa có identity thì TẠO LUÔN tài khoản + nhân vật thay vì báo lỗi: người bấm
 * "Đăng nhập với Google" không phân biệt đăng ký với đăng nhập, và Google đã trả
 * lời sẵn thứ duy nhất mà bước đăng ký cần hỏi — cái tên.
 *
 * Không có recoveryCode trong phản hồi: tài khoản Google không có gì để khôi phục
 * ở phía game, mất tài khoản Google thì lấy lại ở phía Google.
 */
export async function loginWithGoogle(input: GoogleLoginInput, deviceInfo?: string) {
  const profile = await verifyGoogleIdToken(input.idToken);

  const existing = await authRepository.findGoogleIdentity(profile.subject);
  if (existing) {
    return { ...(await resumeGoogleSession(existing, deviceInfo)), isNewAccount: false };
  }

  let created;
  try {
    created = await createGooglePlayer(profile);
  } catch (err) {
    // Hai thiết bị đăng nhập lần đầu cùng lúc: thằng thua cuộc đua đụng khoá chính
    // (provider, subject). Identity kia vừa tạo xong nên đọc lại là vào được bình
    // thường — người chơi tuyệt đối không được thấy 409 ở đây.
    if (authRepository.uniqueViolationTarget(err) === null) throw err;
    const raced = await authRepository.findGoogleIdentity(profile.subject);
    if (!raced) throw err;
    return { ...(await resumeGoogleSession(raced, deviceInfo)), isNewAccount: false };
  }

  const tokens = await issueSession(created.accountId, created.playerId, deviceInfo);

  return {
    player: toPublicPlayerFromRecord(
      {
        playerId: created.playerId,
        accountId: created.accountId,
        uid: created.uid,
        displayName: created.displayName,
        avatarUrl: created.avatarUrl,
        level: 1,
        exp: 0,
      },
      null,
    ),
    ...tokens,
    /** Cờ để client bật màn hình chào mừng / hướng dẫn lần đầu. */
    isNewAccount: true,
  };
}

export async function refresh(input: RefreshInput, deviceInfo?: string): Promise<AuthTokens> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  const session = await authRepository.findSessionByRefreshTokenHash(tokenHash);

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token không hợp lệ hoặc đã hết hạn");
  }

  // Access token mang playerId, mà phiên chỉ biết accountId — phải tra lại.
  const player = await authRepository.findPlayerByAccountId(session.accountId);
  if (!player) {
    throw new NotFoundError("Tài khoản chưa có nhân vật");
  }
  assertAccountUsable(player.account.status, player.account.bannedUntil);

  const refreshToken = generateRefreshToken();
  await authRepository.updateSessionToken(session.sessionId, {
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiryDate(),
    deviceInfo,
  });

  return {
    accessToken: signAccessToken(player.playerId, session.accountId),
    refreshToken,
  };
}

export async function logout(input: RefreshInput): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await authRepository.revokeSessionByRefreshTokenHash(tokenHash);
}

/** Dọn phiên đã thu hồi/hết hạn. Chạy theo lịch, xem src/server.ts. */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await authRepository.deleteStaleSessions();
  return result.count;
}

export async function resetPassword(input: ResetPasswordInput) {
  const [row] = await authRepository.findLoginByUsername(input.username);
  if (!row) {
    throw new UnauthorizedError("Recovery code không hợp lệ");
  }

  const valid = await verifyRecoveryCode(input.recoveryCode, row.recovery_code_hash);
  if (!valid) {
    throw new UnauthorizedError("Recovery code không hợp lệ");
  }

  // Mã cũ đã dùng là đốt luôn, phát mã mới. Dùng lại được một mã nghĩa là ai
  // chụp màn hình lần đăng ký sẽ chiếm được tài khoản mãi mãi.
  const newRecoveryCode = generateRecoveryCode();
  await authRepository.resetCredentials(row.subject, row.account_id, {
    passwordHash: await hashPassword(input.newPassword),
    recoveryCodeHash: await hashRecoveryCode(newRecoveryCode),
  });

  return { recoveryCode: newRecoveryCode };
}

export async function getCurrentPlayer(playerId: string): Promise<PublicPlayer> {
  const player = await authRepository.findPlayerById(playerId);
  if (!player) {
    throw new NotFoundError("Không tìm thấy nhân vật");
  }

  const username = await authRepository.findUsernameByAccount(player.accountId);

  return toPublicPlayerFromRecord(player, username);
}

export async function updateProfile(playerId: string, input: UpdateProfileInput) {
  try {
    const player = await authRepository.updatePlayerProfile(playerId, {
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
    });
    return {
      playerId: player.playerId,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
    };
  } catch (err) {
    if (authRepository.uniqueViolationTarget(err) !== null) {
      throw new ConflictError("Tên hiển thị đã có người dùng");
    }
    throw err;
  }
}
