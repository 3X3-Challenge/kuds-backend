-- =============================================================================
--  Mật khẩu cho tài khoản quản trị.
--
--  admin.admin_user dựng ra chỉ có email + role vì lúc đó chưa quyết đăng nhập
--  bằng gì. Trang quản trị (kuds-frontend) cần đăng nhập email + mật khẩu, nên
--  thêm password_hash ở đây.
--
--  NOT NULL không kèm DEFAULT chạy được vì bảng đang rỗng. Nếu về sau bảng đã có
--  dòng thì phải thêm nullable → backfill → SET NOT NULL, ba bước.
--
--  KHÔNG có bảng phiên cho admin: token quản trị là JWT thuần, sống ADMIN_TOKEN_TTL
--  (mặc định 8h) rồi bắt đăng nhập lại. Đổi ADMIN_JWT_SECRET là vô hiệu hoá tất cả.
-- =============================================================================

ALTER TABLE admin.admin_user
    ADD COLUMN password_hash text NOT NULL,
    ADD COLUMN display_name  text NOT NULL DEFAULT '',
    ADD COLUMN last_login_at timestamptz;

COMMENT ON COLUMN admin.admin_user.password_hash IS
    'bcrypt. Không bao giờ trả về qua API, kể cả cho chính chủ.';

-- Đăng nhập gõ email hoa thường lẫn lộn là chuyện thường. UNIQUE(email) sẵn có
-- vẫn phân biệt hoa thường, nên thêm index này để tra cứu không phân biệt và
-- chặn luôn hai tài khoản "A@x.com" / "a@x.com".
CREATE UNIQUE INDEX admin_user_email_ci ON admin.admin_user (lower(email));
