/**
 * Kiểm tra verifyGoogleIdToken bằng một cặp khoá RSA tự sinh + fetch giả lập.
 * Không chạm mạng, không chạm DB, không cần .env — chạy được ở mọi máy.
 *
 *   npx tsx scripts/google-token-check.mts
 *
 * Phần đáng lo nhất của đăng nhập Google là chỗ này: nhận nhầm một token là hợp
 * lệ nghĩa là cho người lạ vào tài khoản người khác. Các ca "phải bị từ chối"
 * bên dưới quan trọng hơn hẳn các ca "phải chấp nhận".
 *
 * Thứ tự các nhóm KHÔNG đổi được: cache JWKS nằm trong module và chỉ trống đúng
 * một lần, nên ca "chưa có khoá nào trong tay" bắt buộc phải chạy đầu tiên.
 */
process.env.GOOGLE_CLIENT_IDS =
  "client-android.apps.googleusercontent.com,client-ios.apps.googleusercontent.com";

import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid-1";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

let fetchCalls = 0;
let jwksOk = true;
/** max-age=0 làm cache hết hạn ngay lập tức — cách duy nhất ép nhánh "cache cũ" chạy. */
let maxAge = 0;

globalThis.fetch = (async () => {
  fetchCalls++;
  return {
    ok: jwksOk,
    headers: new Headers({ "cache-control": `public, max-age=${maxAge}` }),
    json: async () => ({ keys: [jwk] }),
  } as Response;
}) as typeof fetch;

const { verifyGoogleIdToken } = await import("../src/common/utils/google.util.js");

const BASE = {
  iss: "https://accounts.google.com",
  aud: "client-android.apps.googleusercontent.com",
  sub: "104729384756102938475",
  name: "Nguyễn Văn A",
  picture: "https://lh3.googleusercontent.com/a/abc123",
};

function sign(claims: Record<string, unknown>, options: jwt.SignOptions = {}) {
  return jwt.sign(claims, privateKey, {
    algorithm: "RS256",
    keyid: KID,
    expiresIn: "1h",
    ...options,
  });
}

let passed = 0;
let failed = 0;

function ghiNhan(ok: boolean, label: string, chiTiet = "") {
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${chiTiet ? ` -> ${chiTiet}` : ""}`);
    failed++;
  }
}

async function expectOk(
  label: string,
  token: string,
  check: (profile: Awaited<ReturnType<typeof verifyGoogleIdToken>>) => boolean,
) {
  try {
    const profile = await verifyGoogleIdToken(token);
    ghiNhan(check(profile), label, JSON.stringify(profile));
  } catch (err) {
    ghiNhan(false, label, `ném lỗi: ${(err as Error).message}`);
  }
}

async function expectReject(label: string, token: string, expectedStatus = 401) {
  try {
    await verifyGoogleIdToken(token);
    ghiNhan(false, label, "ĐÃ CHẤP NHẬN token lẽ ra phải từ chối");
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    ghiNhan(status === expectedStatus, label, `mong ${expectedStatus}, nhận ${status}`);
  }
}

console.log("\n== Google không trả lời, chưa có khoá nào trong tay ==");
jwksOk = false;
await expectReject("503 chứ không phải 401 — lỗi ở server, không phải ở token", sign(BASE), 503);

console.log("\n== Google im lặng nhưng cache còn khoá cũ ==");
jwksOk = true;
await expectOk("tải được khoá lần đầu", sign(BASE), (p) => p.subject === BASE.sub);
jwksOk = false;
await expectOk(
  "cache hết hạn + Google im lặng -> vẫn dùng khoá cũ, không chặn đăng nhập",
  sign(BASE),
  (p) => p.subject === BASE.sub,
);

jwksOk = true;
maxAge = 3600;

console.log("\n== Token hợp lệ ==");
await expectOk(
  "token đúng -> trả về sub/name/picture",
  sign(BASE),
  (p) => p.subject === BASE.sub && p.name === "Nguyễn Văn A" && p.pictureUrl === BASE.picture,
);
await expectOk(
  "aud là client thứ hai trong danh sách",
  sign({ ...BASE, aud: "client-ios.apps.googleusercontent.com" }),
  (p) => p.subject === BASE.sub,
);
await expectOk(
  "iss dạng không có https://",
  sign({ ...BASE, iss: "accounts.google.com" }),
  (p) => p.subject === BASE.sub,
);
await expectOk(
  "thiếu name/picture -> null chứ không vỡ",
  sign({ iss: BASE.iss, aud: BASE.aud, sub: BASE.sub }),
  (p) => p.name === null && p.pictureUrl === null,
);

console.log("\n== Token phải bị từ chối ==");
await expectReject(
  "aud của ứng dụng Google KHÁC",
  sign({ ...BASE, aud: "ke-tan-cong.apps.googleusercontent.com" }),
);
await expectReject("iss giả mạo", sign({ ...BASE, iss: "https://accounts.evil.com" }));
await expectReject("đã hết hạn", sign(BASE, { expiresIn: "-1h" }));
await expectReject(
  "ký bằng khoá RSA khác",
  jwt.sign(BASE, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey, {
    algorithm: "RS256",
    keyid: KID,
    expiresIn: "1h",
  }),
);
await expectReject("đổi alg sang HS256 (algorithm confusion)",
  jwt.sign(BASE, "bi-mat-bia-ra", { algorithm: "HS256", keyid: KID, expiresIn: "1h" }),
);
await expectReject(
  "alg none",
  `${Buffer.from(JSON.stringify({ alg: "none", kid: KID })).toString("base64url")}.${Buffer.from(
    JSON.stringify(BASE),
  ).toString("base64url")}.`,
);
await expectReject("chuỗi rác", "khong-phai-jwt");

console.log("\n== Cache & cooldown ==");
const callsTruoc = fetchCalls;
await expectReject("kid lạ -> 401", sign(BASE, { keyid: "kid-khong-ton-tai" }));
ghiNhan(
  fetchCalls === callsTruoc,
  "kid lạ trong cooldown không kéo theo lượt tải JWKS nào",
  `đã tải thêm ${fetchCalls - callsTruoc} lượt`,
);

console.log(`\nSố lượt gọi JWKS: ${fetchCalls} (ít hơn hẳn số token đã kiểm -> cache có tác dụng)`);
console.log(`\nPASS ${passed} / FAIL ${failed}`);
process.exit(failed === 0 ? 0 : 1);
