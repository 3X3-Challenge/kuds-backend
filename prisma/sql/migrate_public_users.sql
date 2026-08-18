-- =============================================================================
--  Chuyển public.users / public.sessions / public.user_progress sang game.*
--
--  Chạy SAU schema.sql, khi ba schema mới đã dựng xong và còn rỗng.
--  Mỗi dòng users → 1 account + 1 auth_identity('username') + 1 auth_credential
--                 + 1 player (kéo theo 2 dòng ví do trigger).
--
--  KHÔNG drop bảng cũ trong lần chạy này. Giữ public.users nguyên vẹn cho tới
--  khi backend đã chuyển hẳn và chạy ổn vài ngày — rollback lúc đó chỉ là đổi
--  lại code, không phải khôi phục dữ liệu.
-- =============================================================================

BEGIN;

-- Bảng bắc cầu: id cũ (text) ↔ uuid mới. Sinh sẵn uuid cho từng user rồi mọi
-- INSERT phía sau đều đọc từ đây — tránh hẳn chuyện phải đoán thứ tự RETURNING
-- của INSERT ... SELECT (Postgres không đảm bảo nó khớp thứ tự đọc).
CREATE TABLE game._migration_user_map (
    old_user_id  text PRIMARY KEY,
    account_id   uuid NOT NULL DEFAULT gen_random_uuid(),
    player_id    uuid NOT NULL DEFAULT gen_random_uuid()
);

INSERT INTO game._migration_user_map (old_user_id)
SELECT id FROM public.users;


-- 0. Kiểm trước khi ghi -------------------------------------------------------
--    public.users chỉ unique trên username. game.player thì unique trên
--    lower(display_name), mà display_name lấy từ displayName (fallback username).
--    Hai user "An" và "an", hoặc displayName của người này trùng username của
--    người kia, sẽ làm bước 4 lỗi. Bắt ở đây để biết chính xác dòng nào.
DO $$
DECLARE
    dup text;
BEGIN
    SELECT string_agg(name, ', ') INTO dup
    FROM (
        SELECT lower(coalesce(nullif(u."displayName", ''), u."username")) AS name
        FROM public.users u
        GROUP BY 1
        HAVING count(*) > 1
    ) d;

    IF dup IS NOT NULL THEN
        RAISE EXCEPTION 'Tên hiển thị trùng nhau (không phân biệt hoa thường): %. '
                        'Sửa public.users.displayName trước rồi chạy lại.', dup;
    END IF;
END;
$$;


-- 1. account -----------------------------------------------------------------
INSERT INTO game.account (account_id, status, created_at, deleted_at)
SELECT
    m.account_id,
    u."status",
    u."createdAt",
    CASE WHEN u."status" = 'deleted' THEN u."updatedAt" END
FROM public.users u
JOIN game._migration_user_map m ON m.old_user_id = u.id;

-- users.status cho phép giá trị nào ngoài active/banned/deleted thì INSERT trên
-- sẽ lỗi CHECK ngay tại đây — đúng ý, đừng nới ràng buộc để cho qua.


-- 2. auth_identity — username là provider duy nhất đang có
INSERT INTO game.auth_identity (provider, subject, account_id, linked_at)
SELECT 'username', u."username", m.account_id, u."createdAt"
FROM public.users u
JOIN game._migration_user_map m ON m.old_user_id = u.id;


-- 3. auth_credential
INSERT INTO game.auth_credential (provider, subject, password_hash, recovery_code_hash, updated_at)
SELECT 'username', u."username", u."passwordHash", u."recoveryCodeHash", u."updatedAt"
FROM public.users u;


-- 4. player
--    displayName NULL thì lấy tạm username. player.display_name là NOT NULL và
--    unique không phân biệt hoa thường, mà username đã unique nên không đụng nhau.
INSERT INTO game.player (player_id, account_id, uid, display_name, avatar_url, created_at)
SELECT
    m.player_id,
    m.account_id,
    u."uid",
    coalesce(nullif(u."displayName", ''), u."username"),
    u."avatarUrl",
    u."createdAt"
FROM public.users u
JOIN game._migration_user_map m ON m.old_user_id = u.id;

-- Trigger player_wallet_seed vừa tạo xong 2 dòng ví cho mỗi người chơi.


-- 5. session — chỉ mang theo phiên còn sống, phiên đã thu hồi/hết hạn thì bỏ.
INSERT INTO game.session (account_id, refresh_token_hash, device_info, created_at, expires_at)
SELECT m.account_id, s."refreshTokenHash", s."deviceInfo", s."createdAt", s."expiresAt"
FROM public.sessions s
JOIN game._migration_user_map m ON m.old_user_id = s."userId"
WHERE s."revokedAt" IS NULL
  AND s."expiresAt" > now();


-- 6. user_progress — KHÔNG chuyển.
--    Bảng này lưu (stageId, score) của bản prototype, không có bảng tương ứng
--    trong lược đồ mới. Nếu stageId thật ra là quest thì viết INSERT riêng vào
--    game.player_quest sau khi đã seed content.quest; còn không thì để nguyên
--    public.user_progress cho tới lúc drop.


-- 7. Đối chiếu. Ba số này phải bằng nhau, khác là dừng lại điều tra.
DO $$
DECLARE
    n_users    bigint;
    n_accounts bigint;
    n_players  bigint;
    n_wallets  bigint;
BEGIN
    SELECT count(*) INTO n_users    FROM public.users;
    SELECT count(*) INTO n_accounts FROM game.account;
    SELECT count(*) INTO n_players  FROM game.player;
    SELECT count(*) INTO n_wallets  FROM game.wallet;

    IF n_users <> n_accounts OR n_users <> n_players THEN
        RAISE EXCEPTION 'Lệch số dòng: users=%, account=%, player=%',
            n_users, n_accounts, n_players;
    END IF;

    IF n_wallets <> n_players * 2 THEN
        RAISE EXCEPTION 'Ví thiếu: player=%, wallet=% (đáng lẽ %)',
            n_players, n_wallets, n_players * 2;
    END IF;

    RAISE NOTICE 'Chuyển xong % tài khoản.', n_users;
END;
$$;

COMMIT;


-- =============================================================================
--  Dọn dẹp — chạy RIÊNG, sau khi backend đã chạy trên bảng mới và ổn định.
--
--    DROP TABLE public.user_progress;
--    DROP TABLE public.sessions;
--    DROP TABLE public.users;
--    DROP TABLE game._migration_user_map;
--
--  Trước khi drop, nhớ backup: pg_dump -t public.users -t public.sessions
-- =============================================================================
