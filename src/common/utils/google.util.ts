import { createPublicKey, type JsonWebKey, type KeyObject } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { ServiceUnavailableError, UnauthorizedError } from "../errors";

/**
 * Xác minh Google ID token do client gửi lên.
 *
 * Không kéo google-auth-library về: việc cần làm chỉ là lấy khoá công khai của
 * Google rồi verify chữ ký RS256 — `jsonwebtoken` (đã có sẵn) làm vế sau, và
 * `createPublicKey({ format: "jwk" })` của Node làm vế đầu mà không cần thư viện
 * nào đổi JWK sang PEM. Phần duy nhất phải tự viết là bộ nhớ đệm JWKS bên dưới.
 *
 * Luật bất di bất dịch của file này: danh tính CHỈ đến từ payload đi ra khỏi
 * jwt.verify. Token là chuỗi người lạ gửi lên — jwt.decode được không có nghĩa
 * là thật, nên `sub` đọc bằng decode không bao giờ được dùng để tra tài khoản.
 */

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Google phát cả hai dạng `iss`; token thật có thể mang bất kỳ dạng nào. */
const GOOGLE_ISSUERS: [string, string] = ["https://accounts.google.com", "accounts.google.com"];

/** Google hay trả max-age vài giờ; con số này chỉ dùng khi header thiếu/hỏng. */
const DEFAULT_CACHE_MS = 60 * 60 * 1000;

/**
 * Chặn dò khoá: một `kid` lạ được phép kéo theo đúng một lượt tải JWKS trong
 * khoảng này. Không có nó thì ai đó bắn liên tục token mang kid bịa ra là biến
 * server thành máy dội request vào Google.
 *
 * Một phút là chỗ đứng giữa hai phía: đủ để trần tải là 1 lượt/phút dù bị dội
 * bao nhiêu kid rác, mà cửa sổ "Google vừa xoay khoá, người chơi thật bị từ
 * chối" cũng chỉ dài một phút.
 */
const REFETCH_COOLDOWN_MS = 60 * 1000;

const FETCH_TIMEOUT_MS = 5000;

/** Cùng một câu cho mọi kiểu token hỏng — chi tiết chỉ có ích cho người giả mạo. */
const INVALID_TOKEN = "Google ID token không hợp lệ";

type GoogleJwk = JsonWebKey & { kid?: string };

let cachedKeys: GoogleJwk[] = [];
let cacheExpiresAt = 0;
let lastFetchAt = 0;
/** Gộp các lượt tải song song: 100 request cùng lúc chỉ được gọi Google một lần. */
let inflight: Promise<void> | null = null;

function parseMaxAgeMs(cacheControl: string | null): number {
  const match = cacheControl?.match(/max-age=(\d+)/);
  if (!match) return DEFAULT_CACHE_MS;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_CACHE_MS;
}

async function fetchJwks(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(JWKS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new ServiceUnavailableError("Không kết nối được tới Google để xác minh đăng nhập");
  }

  if (!response.ok) {
    throw new ServiceUnavailableError("Google không trả về khoá xác minh, thử lại sau");
  }

  const body = (await response.json().catch(() => null)) as { keys?: GoogleJwk[] } | null;
  if (!Array.isArray(body?.keys) || body.keys.length === 0) {
    throw new ServiceUnavailableError("Google không trả về khoá xác minh, thử lại sau");
  }

  // Chỉ ghi đè cache khi đã chắc chắn có khoá: một lượt tải hỏng không được xoá
  // bộ khoá đang dùng được.
  cachedKeys = body.keys;
  cacheExpiresAt = Date.now() + parseMaxAgeMs(response.headers.get("cache-control"));
  lastFetchAt = Date.now();
}

function refreshJwks(): Promise<void> {
  if (!inflight) {
    inflight = fetchJwks().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function findVerifyKey(kid: string): Promise<KeyObject | null> {
  if (Date.now() >= cacheExpiresAt) {
    try {
      await refreshJwks();
    } catch (err) {
      // Khoá cũ vẫn verify được cho tới khi Google thực sự xoay khoá, mà hết hạn
      // cache không có nghĩa là đã xoay. Thà chạy tiếp bằng bộ khoá quá hạn còn
      // hơn chặn sạch đăng nhập chỉ vì Google chớp một nhịp. Không còn khoá nào
      // trong tay thì mới chịu thua.
      if (cachedKeys.length === 0) throw err;
    }
  }

  let jwk = cachedKeys.find((key) => key.kid === kid);

  // Google xoay khoá theo kiểu chồng lấn và không báo trước. Một kid lạ khi cache
  // còn hạn thường nghĩa là khoá vừa đổi, nên tải lại — nhưng chỉ khi đã qua
  // cooldown, xem REFETCH_COOLDOWN_MS.
  if (!jwk && Date.now() - lastFetchAt > REFETCH_COOLDOWN_MS) {
    await refreshJwks();
    jwk = cachedKeys.find((key) => key.kid === kid);
  }

  if (!jwk) return null;

  try {
    return createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    return null;
  }
}

/** Những trường của Google ID token mà backend này thực sự dùng. */
export interface GoogleProfile {
  /** `sub` — định danh vĩnh viễn của tài khoản Google. Đây là thứ lưu vào auth_identity.subject. */
  subject: string;
  /** Tên hiển thị Google gợi ý. Có thể thiếu nếu client không xin scope `profile`. */
  name: string | null;
  pictureUrl: string | null;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (env.googleClientIds.length === 0) {
    throw new ServiceUnavailableError("Đăng nhập Google chưa được cấu hình trên máy chủ");
  }

  // decode chỉ để biết phải lấy khoá nào. Mọi thứ khác trong header/payload ở
  // bước này đều chưa đáng tin.
  const decoded = jwt.decode(idToken, { complete: true });
  if (decoded?.header.alg !== "RS256" || !decoded.header.kid) {
    throw new UnauthorizedError(INVALID_TOKEN);
  }

  const key = await findVerifyKey(decoded.header.kid);
  if (!key) {
    throw new UnauthorizedError(INVALID_TOKEN);
  }

  let payload: jwt.JwtPayload;
  try {
    // `audience` là chốt chặn quan trọng nhất ở đây: thiếu nó thì một ID token
    // hợp lệ do BẤT KỲ ứng dụng Google nào khác phát ra cũng đăng nhập được vào
    // game này. `algorithms` chặn trò đổi alg sang HS256/none.
    payload = jwt.verify(idToken, key, {
      algorithms: ["RS256"],
      issuer: GOOGLE_ISSUERS,
      // Đã chặn mảng rỗng ở đầu hàm; kiểu tuple là thứ jsonwebtoken đòi, không
      // phải một điều kiện mới.
      audience: env.googleClientIds as [string, ...string[]],
      clockTolerance: 5,
    }) as jwt.JwtPayload;
  } catch {
    throw new UnauthorizedError(INVALID_TOKEN);
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new UnauthorizedError(INVALID_TOKEN);
  }

  return {
    subject: payload.sub,
    name: typeof payload.name === "string" ? payload.name : null,
    pictureUrl: typeof payload.picture === "string" ? payload.picture : null,
  };
}
