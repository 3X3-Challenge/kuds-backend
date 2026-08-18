import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Biến môi trường dạng "a,b,c" -> ["a","b","c"]. Thiếu hoặc rỗng thì mảng rỗng. */
function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Danh sách origin cho CORS. "*" = cho tất cả (chỉ nên dùng lúc dev). */
function parseOrigins(raw: string | undefined): string[] | true {
  if (!raw || raw.trim() === "*") return true;
  return parseList(raw);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  maxSessionsPerUser: Number(process.env.MAX_SESSIONS_PER_USER ?? 5),
  sessionCleanupIntervalHours: Number(process.env.SESSION_CLEANUP_INTERVAL_HOURS ?? 24),

  /**
   * Các OAuth client ID được chấp nhận trong `aud` của Google ID token. Ngăn cách
   * bằng dấu phẩy vì mỗi nền tảng Unity build ra một client ID riêng (Android,
   * iOS, Web) và tất cả cùng đăng nhập vào một backend.
   *
   * Rỗng thì POST /auth/google trả 503 — thà tắt hẳn cửa còn hơn mở một cửa
   * nhận token của bất kỳ ứng dụng Google nào.
   */
  googleClientIds: parseList(process.env.GOOGLE_CLIENT_IDS),

  /**
   * Bí mật riêng cho token quản trị. Tách khỏi JWT_SECRET có chủ ý: token người
   * chơi và token admin không bao giờ được dùng lẫn nhau, kể cả khi một trong
   * hai bị lộ. Không đặt thì fallback về JWT_SECRET kèm cảnh báo lúc khởi động.
   */
  adminJwtSecret: process.env.ADMIN_JWT_SECRET ?? requireEnv("JWT_SECRET"),
  adminJwtSecretIsShared: !process.env.ADMIN_JWT_SECRET,
  /** Admin không có refresh token — hết hạn là đăng nhập lại. */
  adminTokenTtl: process.env.ADMIN_TOKEN_TTL ?? "8h",

  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
};
