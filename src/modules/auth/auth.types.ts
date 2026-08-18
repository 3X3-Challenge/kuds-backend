export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Hồ sơ người chơi trả về sau khi đăng nhập. Không bao giờ chứa hash nào. */
export interface PublicPlayer {
  playerId: string;
  accountId: string;
  /** Mã 12 số người chơi đọc cho CSKH. */
  uid: string;
  /** Tên đăng nhập (auth_identity.subject của provider 'username'). */
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  exp: number;
}

/** Một dòng đọc từ câu tra cứu đăng nhập gộp account + identity + credential + player. */
export interface LoginRow {
  provider: string;
  subject: string;
  account_id: string;
  password_hash: string;
  recovery_code_hash: string;
  status: string;
  banned_until: Date | null;
  player_id: string | null;
  uid: string | null;
  display_name: string | null;
  avatar_url: string | null;
  level: number | null;
  exp: number | null;
}
