-- =============================================================================
--  Dựng ba schema content / game / admin.
--
--  Nội dung lấy nguyên từ prisma/sql/schema.sql, chỉ gỡ BEGIN;/COMMIT; vì Prisma
--  đã tự bọc migration trong transaction. KHÔNG đụng tới public.users/sessions/
--  user_progress — hai bảng đó còn sống cho tới khi module auth chuyển sang
--  game.account (xem prisma/sql/migrate_public_users.sql).
-- =============================================================================

-- =============================================================================
--  KÝ ỨC DI SẢN — Lược đồ cơ sở dữ liệu (bản đã chỉnh)
--  PostgreSQL 16
--
--  Chạy từ trên xuống là dựng xong toàn bộ. Thứ tự đã sắp theo phụ thuộc khoá
--  ngoại, không cần chạy lại lần hai.
--
--  Ba schema:
--    content — danh mục tĩnh. Người chơi chơi thì dữ liệu ở đây không đổi.
--    game    — trạng thái người chơi. Chỉ server được ghi.
--    admin   — người quản trị và nhật ký thao tác.
--
--  Chiều phụ thuộc: game → content. Không bao giờ ngược lại.
--
--  Đã chuyển public.users/sessions sang game.* — xem migrate_public_users.sql.
-- =============================================================================


CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE SCHEMA content;
CREATE SCHEMA game;
CREATE SCHEMA admin;

COMMENT ON SCHEMA content IS 'Danh mục tĩnh, phiên bản theo build hoặc theo lần xuất bản.';
COMMENT ON SCHEMA game    IS 'Trạng thái người chơi, server độc quyền ghi.';
COMMENT ON SCHEMA admin   IS 'Tài khoản quản trị và nhật ký thao tác.';


-- =============================================================================
--  0. HÀM DÙNG CHUNG
-- =============================================================================

-- DEFAULT now() chỉ chạy lúc INSERT. Không có trigger này thì mọi cột updated_at
-- đứng yên mãi mãi ở thời điểm tạo dòng, và trang quản trị không biết ai sửa gần nhất.
CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


-- =============================================================================
--  1. KIỂU DÙNG CHUNG
-- =============================================================================

-- Đúng ba danh mục thật. BagCategoryBar.Category.TatCa = 0 là BỘ LỌC GIAO DIỆN,
-- không phải danh mục vật phẩm — tuyệt đối không lưu xuống đây. Map thẳng số
-- nguyên enum của C# sang bảng này sẽ lệch đúng một bậc trên cả 32 vật phẩm.
CREATE TYPE content.item_category AS ENUM ('trang_bi', 'thuc_pham', 'dung_cu');

-- hoa sen  = tiền nạp   (icon hud_icon_hoa_sen, hiện trên thẻ ở màn Nạp)
-- lồng đèn = tiền mềm   (icon hud_icon_long_den, phần thưởng thư / nhiệm vụ)
CREATE TYPE content.currency_code AS ENUM ('hoa_sen', 'long_den');

-- Suy từ nhãn phân loại của gacha: "Trang phục cực phẩm", "Gia sản cấp gia tiên".
CREATE TYPE content.item_grade AS ENUM ('thuong', 'quy', 'cuc_pham', 'gia_tien');

CREATE TYPE content.equip_slot AS ENUM ('non', 'ao', 'tay', 'chan', 'phu_kien');

-- Năm tab của ShopTabBar.Tab, đúng thứ tự trái sang phải.
CREATE TYPE content.shop_tab AS ENUM (
    'nap', 'nap_dau_cuc_hoi', 'goi_uu_dai', 'doi_qua_nap', 'goi_tai_nguyen'
);

-- Bảng nào ở "lớp tải lúc chạy" thì mang cột status kiểu này: admin sửa bản
-- nháp thoải mái, chỉ 'published' mới ra tới người chơi.
--
-- 'archived' là NÚT XOÁ DUY NHẤT của trang quản trị. DELETE thật sẽ bị khoá
-- ngoại của dữ liệu người chơi chặn lại — xem mục 17.
CREATE TYPE content.publish_status AS ENUM ('draft', 'published', 'archived');

-- Dùng chung cho mục tiêu nhiệm vụ lẫn điều kiện thành tựu.
CREATE TYPE content.objective_kind AS ENUM (
    'thu_thap',        -- nhặt / thu thập N vật phẩm
    'giao_vat_pham',   -- mang N vật phẩm tới một NPC
    'noi_chuyen_npc',
    'cho_thu_cung_an',
    'thu_hoach',
    've_tranh_kieng',
    'tieu_tien',
    'so_huu_vat_pham'  -- đang giữ tối thiểu N (ví dụ "10 nội thất cấp gia tiên")
);


-- =============================================================================
--  2. CONTENT — VẬT PHẨM
-- =============================================================================

CREATE TABLE content.item (
    item_key       text PRIMARY KEY CHECK (item_key ~ '^[a-z0-9_]+$'),
    display_name   text    NOT NULL,
    description    text    NOT NULL DEFAULT '',
    category       content.item_category NOT NULL,
    grade          content.item_grade    NOT NULL DEFAULT 'thuong',
    stack_max      integer NOT NULL DEFAULT 999 CHECK (stack_max > 0),
    is_equippable  boolean NOT NULL DEFAULT false,
    is_consumable  boolean NOT NULL DEFAULT false,
    shelf_life     interval,
    status         content.publish_status NOT NULL DEFAULT 'draft',
    sort_order     integer NOT NULL DEFAULT 0,
    updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  content.item IS
    'Nguồn: UIBagScreenBuilder.BagItems (32 dòng).';
COMMENT ON COLUMN content.item.item_key IS
    'Khớp tên sprite bag_item_<item_key>.png. Ví dụ co_dau_nhon, ca_rot.';
COMMENT ON COLUMN content.item.description IS
    'Dòng mô tả trong khung chi tiết. Rỗng thì client ẩn dòng và dời gạch ngang lên.';
COMMENT ON COLUMN content.item.shelf_life IS
    'NULL = không hết hạn. Nguồn của thư hệ thống "Nhắc nhở vật phẩm hết hạn".';
COMMENT ON COLUMN content.item.status IS
    'Vật phẩm đã vào túi ai đó thì không xoá được nữa — chuyển archived. Client '
    'vẫn phải hiển thị được item archived đang nằm trong túi cũ.';

-- KHÔNG lưu ở đây: AnhTam, AnhKichThuoc, AnhGocXoay và mọi số đo Figma khác.
-- Đó là bố cục, thuộc về prefab, không phải thuộc tính vật phẩm.

CREATE INDEX item_by_category ON content.item (category, sort_order);
CREATE INDEX item_live ON content.item (category, sort_order) WHERE status = 'published';

CREATE TRIGGER item_touch BEFORE UPDATE ON content.item
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE content.equipment_profile (
    item_key  text  PRIMARY KEY REFERENCES content.item ON DELETE CASCADE,
    slot      content.equip_slot NOT NULL,
    stats     jsonb NOT NULL DEFAULT '{}',
    -- Thừa về mặt lý thuyết (item_key đã là PK) nhưng game.player_equipment cần
    -- nó làm đích cho khoá ngoại ghép, để DB tự ép "đúng đồ, đúng ô".
    UNIQUE (item_key, slot)
);

COMMENT ON COLUMN content.equipment_profile.stats IS
    'Ví dụ {"toc_do_thu_hoach": 1.15, "so_o_tuoi_them": 1}.';


CREATE TABLE content.crop (
    crop_key          text     PRIMARY KEY,
    seed_item_key     text     NOT NULL REFERENCES content.item,
    harvest_item_key  text     NOT NULL REFERENCES content.item,
    grow_seconds      integer  NOT NULL CHECK (grow_seconds > 0),
    water_stages      smallint NOT NULL DEFAULT 1 CHECK (water_stages >= 0),
    yield_min         smallint NOT NULL DEFAULT 1 CHECK (yield_min > 0),
    yield_max         smallint NOT NULL DEFAULT 1,
    CHECK (yield_max >= yield_min),
    CHECK (seed_item_key <> harvest_item_key)
);

COMMENT ON TABLE content.crop IS
    'Tám vật phẩm Thực phẩm hiện có đều là nông sản, nhưng repo CHƯA có vật phẩm '
    'hạt giống tương ứng. Phải thêm 8 item hạt giống trước khi seed bảng này.';


-- Mẫu tranh cho minigame trong TranhKiengRoom.
CREATE TABLE content.tranh_kieng_pattern (
    pattern_key   text     PRIMARY KEY,
    display_name  text     NOT NULL,
    difficulty    smallint NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
    outline       jsonb,
    sort_order    integer  NOT NULL DEFAULT 0
);


-- =============================================================================
--  3. CONTENT — GÓI PHẦN THƯỞNG
--
--  Thư, nhiệm vụ, thành tựu và gói nạp đều trả thưởng. Thay vì lặp cột
--  "thưởng gì / bao nhiêu" ở bốn chỗ, tất cả trỏ về đây.
-- =============================================================================

CREATE TABLE content.reward_bundle (
    bundle_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bundle_key  text   NOT NULL UNIQUE,
    note        text
);

COMMENT ON COLUMN content.reward_bundle.bundle_key IS
    'Khoá tự nhiên để file seed và các môi trường khác nhau tham chiếu ổn định.';


CREATE TABLE content.reward_line (
    bundle_id  bigint   NOT NULL REFERENCES content.reward_bundle ON DELETE CASCADE,
    ordinal    smallint NOT NULL,
    currency   content.currency_code,
    item_key   text     REFERENCES content.item,
    amount     integer  NOT NULL CHECK (amount > 0),
    PRIMARY KEY (bundle_id, ordinal),
    -- Một dòng thưởng: hoặc tiền, hoặc vật phẩm. Không bao giờ cả hai, không bao giờ trống.
    CHECK ((currency IS NOT NULL) <> (item_key IS NOT NULL))
);

-- Hai dòng "500 hoa sen" trong cùng một gói là lỗi nhập liệu, không phải ý đồ.
-- Gộp lại thành một dòng amount = 1000.
CREATE UNIQUE INDEX reward_line_one_per_currency
    ON content.reward_line (bundle_id, currency) WHERE currency IS NOT NULL;
CREATE UNIQUE INDEX reward_line_one_per_item
    ON content.reward_line (bundle_id, item_key) WHERE item_key IS NOT NULL;


-- =============================================================================
--  4. CONTENT — GACHA
-- =============================================================================

CREATE TABLE content.gacha_item (
    gacha_item_key   text     PRIMARY KEY,
    display_name     text     NOT NULL,
    subtitle         text     NOT NULL DEFAULT '',
    description      text     NOT NULL,
    quote            text     NOT NULL DEFAULT '',
    rarity           smallint NOT NULL CHECK (rarity BETWEEN 3 AND 5),
    grants_item_key  text     REFERENCES content.item
);

COMMENT ON TABLE  content.gacha_item IS
    'Nguồn: UIGachaScreenBuilder.GachaItems.';
COMMENT ON COLUMN content.gacha_item.subtitle IS
    'Dòng phân loại nhỏ dưới tên. Rỗng ⇒ client ẩn dòng (như "Giếng ước nguyện").';
COMMENT ON COLUMN content.gacha_item.quote IS
    'Câu trích dẫn đè lên ảnh. Rỗng ⇒ client ẩn cả chữ lẫn bóng đổ của nó.';
COMMENT ON COLUMN content.gacha_item.rarity IS
    'Quyết định sprite dãy sao gacha_sao_<rarity>.png. Hiện chỉ dùng 4 và 5.';


CREATE TABLE content.banner (
    banner_id      bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    banner_key     text     NOT NULL UNIQUE,
    display_name   text     NOT NULL,
    status         content.publish_status NOT NULL DEFAULT 'draft',
    cost_currency  content.currency_code  NOT NULL DEFAULT 'hoa_sen',
    cost_amount    integer  NOT NULL CHECK (cost_amount > 0),
    pity_5_star    smallint NOT NULL DEFAULT 90 CHECK (pity_5_star > 0),
    pity_4_star    smallint NOT NULL DEFAULT 10 CHECK (pity_4_star > 0),
    opens_at       timestamptz NOT NULL,
    closes_at      timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (closes_at IS NULL OR closes_at > opens_at),
    CHECK (pity_4_star < pity_5_star)
);

-- Đối xứng với shop_product_live: màn Gacha cũng chỉ hỏi "banner nào đang mở".
CREATE INDEX banner_live ON content.banner (opens_at DESC) WHERE status = 'published';

CREATE TRIGGER banner_touch BEFORE UPDATE ON content.banner
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE content.banner_entry (
    banner_id       bigint  NOT NULL REFERENCES content.banner ON DELETE CASCADE,
    gacha_item_key  text    NOT NULL REFERENCES content.gacha_item,
    weight          integer NOT NULL CHECK (weight > 0),
    is_featured     boolean NOT NULL DEFAULT false,
    PRIMARY KEY (banner_id, gacha_item_key)
);

COMMENT ON COLUMN content.banner_entry.weight IS
    'Trọng số thô. Tỉ lệ thật = weight / SUM(weight) trong cùng bậc sao.';


-- =============================================================================
--  5. CONTENT — CỬA HÀNG
-- =============================================================================

CREATE TABLE content.shop_product (
    product_id        bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_key       text    NOT NULL UNIQUE,
    tab               content.shop_tab NOT NULL,
    display_name      text    NOT NULL DEFAULT '',

    -- Nhánh tiền thật. VND không có đơn vị lẻ nên lưu integer đồng.
    -- Cùng một gói bán được qua CẢ HAI đường: IAP (cần store_sku) và PayOS
    -- (không cần gì cả). Đường nào được dùng là chuyện của từng đơn hàng, xem
    -- game.purchase_order.provider — không phải thuộc tính của gói.
    store_sku         text,
    price_vnd         integer CHECK (price_vnd > 0),
    -- Nội dung chuyển khoản hiện trên app ngân hàng khi quét QR PayOS. NULL thì
    -- server tự sinh từ product_key.
    transfer_note     text CHECK (transfer_note IS NULL OR length(transfer_note) <= 25),

    -- Nhánh tiền trong game (hai tab cuối).
    price_currency    content.currency_code,
    price_amount      integer CHECK (price_amount > 0),

    bundle_id         bigint  NOT NULL REFERENCES content.reward_bundle,
    bonus_multiplier  numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (bonus_multiplier >= 1),
    once_per_account  boolean NOT NULL DEFAULT false,

    status            content.publish_status NOT NULL DEFAULT 'draft',
    sort_order        integer NOT NULL DEFAULT 0,
    active_from       timestamptz NOT NULL DEFAULT now(),
    active_to         timestamptz,
    updated_at        timestamptz NOT NULL DEFAULT now(),

    -- Bán bằng tiền thật XOR tiền trong game, không lẫn lộn.
    CHECK ((price_vnd IS NOT NULL) <> (price_currency IS NOT NULL)),
    CHECK ((price_currency IS NULL) = (price_amount IS NULL)),
    -- SKU và nội dung chuyển khoản chỉ có nghĩa với gói tiền thật, nhưng KHÔNG
    -- bắt buộc — gói chỉ bán qua PayOS thì không có SKU nào để điền. Bản trước
    -- ép ((price_vnd IS NULL) = (store_sku IS NULL)), tức là khoá cứng vào IAP.
    CHECK (store_sku     IS NULL OR price_vnd IS NOT NULL),
    CHECK (transfer_note IS NULL OR price_vnd IS NOT NULL),
    CHECK (active_to IS NULL OR active_to > active_from)
);

COMMENT ON TABLE content.shop_product IS
    'Nguồn: UIShopScreenBuilder.TopupPacks. Giá trong Figma là chuỗi định dạng '
    'không nhất quán ("7.000VND" dính liền, "25.000 VND" có dấu cách) — ở đây '
    'lưu số nguyên, việc format là của client.';
COMMENT ON COLUMN content.shop_product.store_sku IS
    'SKU đã đăng ký ở Google Play Console / App Store Connect. Admin KHÔNG tự tạo '
    'được điểm giá mới; đăng ký sẵn trọn dải giá ngay lần nộp đầu. NULL = gói này '
    'chỉ bán qua PayOS.';
COMMENT ON COLUMN content.shop_product.transfer_note IS
    'PayOS giới hạn description khoảng 25 ký tự vì nó chính là nội dung chuyển '
    'khoản. Kiểm lại con số này với tài liệu PayOS hiện hành trước khi lên '
    'production; giới hạn đổi thì sửa CHECK ở đây.';
COMMENT ON COLUMN content.shop_product.bonus_multiplier IS
    'Huy hiệu x2 ở tab "Nạp đầu cực hời". Đọc từ đây, không hard-code theo chỉ số.';
COMMENT ON COLUMN content.shop_product.once_per_account IS
    'Chép sang purchase_order.is_once lúc đặt đơn; unique index bên đó mới là thứ '
    'thật sự ép. Ở đây chỉ là cấu hình.';

-- Truy vấn nóng của màn Nạp.
CREATE INDEX shop_product_live ON content.shop_product (tab, sort_order)
    WHERE status = 'published';

CREATE TRIGGER shop_product_touch BEFORE UPDATE ON content.shop_product
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
--  6. CONTENT — NPC, NHIỆM VỤ, THÀNH TỰU, THƯ, SỔ TAY
-- =============================================================================

CREATE TABLE content.npc (
    npc_key       text PRIMARY KEY,
    display_name  text NOT NULL,
    scene_name    text NOT NULL DEFAULT 'MainScene'
);


CREATE TABLE content.quest (
    quest_key       text    PRIMARY KEY,
    title           text    NOT NULL,
    summary         text    NOT NULL,
    chapter         smallint NOT NULL DEFAULT 1,
    requires_quest  text    REFERENCES content.quest,
    bundle_id       bigint  REFERENCES content.reward_bundle,
    status          content.publish_status NOT NULL DEFAULT 'draft',
    sort_order      integer NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (requires_quest IS NULL OR requires_quest <> quest_key)
);

COMMENT ON TABLE content.quest IS 'Nguồn: UIScreenBuilder.HudQuests.';
COMMENT ON COLUMN content.quest.requires_quest IS
    'CHECK chỉ chặn tự trỏ mình. Vòng A→B→A phải kiểm ở tầng nhập liệu — DB '
    'không tự phát hiện được chu trình.';

CREATE TRIGGER quest_touch BEFORE UPDATE ON content.quest
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE content.quest_objective (
    quest_key     text     NOT NULL REFERENCES content.quest ON DELETE CASCADE,
    ordinal       smallint NOT NULL,
    kind          content.objective_kind NOT NULL,
    target_key    text,
    target_count  integer  NOT NULL DEFAULT 1 CHECK (target_count > 0),
    PRIMARY KEY (quest_key, ordinal)
);

COMMENT ON COLUMN content.quest_objective.target_key IS
    'item_key / npc_key / crop_key / pattern_key — tuỳ theo kind. Không đặt FK '
    'được vì trỏ nhiều bảng; validate ở tầng nhập liệu.';


CREATE TABLE content.achievement (
    achievement_key  text   PRIMARY KEY,
    title            text   NOT NULL,
    description      text   NOT NULL,
    kind             content.objective_kind NOT NULL,
    target_key       text,
    target_count     bigint NOT NULL CHECK (target_count > 0),
    bundle_id        bigint REFERENCES content.reward_bundle,
    status           content.publish_status NOT NULL DEFAULT 'draft',
    sort_order       integer NOT NULL DEFAULT 0,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN content.achievement.target_count IS
    'bigint vì "Tích lũy tiêu 700.000Đ" đếm bằng đồng, tràn int rất nhanh.';

CREATE TRIGGER achievement_touch BEFORE UPDATE ON content.achievement
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE content.mail_template (
    template_key  text   PRIMARY KEY,
    title         text   NOT NULL,
    sender        text   NOT NULL DEFAULT '',
    body          text   NOT NULL DEFAULT '',
    bundle_id     bigint REFERENCES content.reward_bundle,
    ttl           interval,
    status        content.publish_status NOT NULL DEFAULT 'draft',
    updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN content.mail_template.title IS
    'Giữ nguyên cặp ngoặc vuông "[Thư cá nhân]" — client tự bỏ khi hiện tiêu đề bên phải.';
COMMENT ON COLUMN content.mail_template.body IS
    'Dùng token {player_name}. Việc escape < > cho TMP rich text là của client, '
    'không nhét &lt; &gt; vào dữ liệu.';

CREATE TRIGGER mail_template_touch BEFORE UPDATE ON content.mail_template
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE content.codex_entry (
    entry_key   text PRIMARY KEY,
    title       text NOT NULL,
    body        text NOT NULL,
    category    text NOT NULL,
    status      content.publish_status NOT NULL DEFAULT 'draft',
    sort_order  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE content.codex_entry IS
    'Sổ tay di sản sau nút hud_guidebook. Ví dụ category: tranh_kieng, long_den, cu_lao.';


-- =============================================================================
--  7. CONTENT — TRẠNG THÁI XUẤT BẢN
-- =============================================================================

-- Đúng một dòng. Bấm "Xuất bản" ở trang quản trị thì tăng version.
-- Client gửi kèm version đang giữ; bằng nhau thì server trả 304, khỏi tải lại.
CREATE TABLE content.config_state (
    id            boolean PRIMARY KEY DEFAULT true CHECK (id),
    version       bigint  NOT NULL DEFAULT 1,
    published_at  timestamptz NOT NULL DEFAULT now(),
    published_by  uuid
);


-- =============================================================================
--  8. ADMIN
-- =============================================================================

CREATE TABLE admin.admin_user (
    admin_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email      text NOT NULL UNIQUE,
    role       text NOT NULL CHECK (role IN ('viewer', 'editor', 'publisher')),
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN admin.admin_user.role IS
    'viewer chỉ xem; editor sửa được bản nháp; chỉ publisher mới bấm được Xuất bản.';

ALTER TABLE content.config_state
    ADD CONSTRAINT config_state_published_by_fkey
    FOREIGN KEY (published_by) REFERENCES admin.admin_user;


-- Bảng nào đụng tới tiền thì phải biết ai đổi, đổi từ gì sang gì, lúc nào.
CREATE TABLE admin.audit_log (
    log_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id    uuid   NOT NULL REFERENCES admin.admin_user,
    action      text   NOT NULL CHECK (action IN ('insert','update','delete','publish')),
    table_name  text   NOT NULL,
    row_key     text   NOT NULL,
    before      jsonb,
    after       jsonb,
    ip_address  inet,
    acted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_by_row ON admin.audit_log (table_name, row_key, acted_at DESC);
CREATE INDEX audit_log_by_admin ON admin.audit_log (admin_id, acted_at DESC);


-- =============================================================================
--  9. GAME — TÀI KHOẢN, ĐĂNG NHẬP, NHÂN VẬT
--
--  Thay thế public.users + public.sessions của backend hiện tại. Cấu trúc ba
--  tầng: account (danh tính) → auth_identity (các cách đăng nhập) → player
--  (nhân vật trong game). Mật khẩu nằm ở auth_credential, tách khỏi identity
--  vì chỉ đúng một provider có mật khẩu.
-- =============================================================================

CREATE TABLE game.account (
    account_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status         text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'banned', 'deleted')),
    banned_until   timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_login_at  timestamptz,
    -- Xoá mềm. Xem mục 17 — hard delete sẽ bị purchase_order chặn.
    deleted_at     timestamptz,
    CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
    CHECK (status = 'banned' OR banned_until IS NULL)
);

COMMENT ON COLUMN game.account.banned_until IS
    'NULL khi status = ''banned'' nghĩa là cấm vĩnh viễn. Ràng buộc chỉ chặn '
    'chiều ngược lại: tài khoản không bị cấm thì không được mang hạn cấm.';


CREATE TABLE game.auth_identity (
    provider    text NOT NULL
                     CHECK (provider IN ('username','device','google','apple','email')),
    subject     text NOT NULL,
    account_id  uuid NOT NULL REFERENCES game.account ON DELETE CASCADE,
    linked_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

CREATE INDEX auth_identity_by_account ON game.auth_identity (account_id);

-- Một tài khoản chỉ được có tối đa một identity mỗi provider — không thể vừa
-- gắn hai tài khoản Google khác nhau vào cùng một account.
CREATE UNIQUE INDEX auth_identity_one_per_provider
    ON game.auth_identity (account_id, provider);

-- Tên đăng nhập phân biệt hoa thường là nguồn của mọi vụ "tôi gõ đúng mà không vào được".
CREATE UNIQUE INDEX auth_identity_username_ci
    ON game.auth_identity (lower(subject)) WHERE provider = 'username';

COMMENT ON TABLE game.auth_identity IS
    'Một tài khoản gắn được nhiều cách đăng nhập: chơi thử bằng device rồi nâng '
    'lên Google mà không mất tiến trình.';


-- Chỉ provider 'username' mới có mật khẩu. Google/Apple/device không có gì để lưu.
CREATE TABLE game.auth_credential (
    provider            text NOT NULL,
    subject             text NOT NULL,
    password_hash       text NOT NULL,
    recovery_code_hash  text NOT NULL,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject),
    FOREIGN KEY (provider, subject) REFERENCES game.auth_identity ON DELETE CASCADE,
    CHECK (provider = 'username')
);

COMMENT ON TABLE game.auth_credential IS
    'Không có email nên không reset qua mail được: recovery_code_hash là đường '
    'cứu duy nhất. Mã gốc trả về đúng một lần lúc đăng ký / lúc reset.';

CREATE TRIGGER auth_credential_touch BEFORE UPDATE ON game.auth_credential
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE game.session (
    session_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          uuid NOT NULL REFERENCES game.account ON DELETE CASCADE,
    refresh_token_hash  text NOT NULL UNIQUE,
    device_info         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL,
    revoked_at          timestamptz,
    CHECK (expires_at > created_at)
);

-- Truy vấn duy nhất chạy mỗi lần refresh token: phiên nào của account này còn sống.
CREATE INDEX session_active ON game.session (account_id) WHERE revoked_at IS NULL;

COMMENT ON COLUMN game.session.refresh_token_hash IS
    'SHA-256 của refresh token. Token thô không bao giờ chạm tới DB.';


CREATE TABLE game.player (
    player_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id     uuid NOT NULL UNIQUE REFERENCES game.account ON DELETE CASCADE,
    uid            text NOT NULL UNIQUE CHECK (uid ~ '^[0-9]{12}$'),
    display_name   text NOT NULL,
    avatar_url     text,
    level          smallint NOT NULL DEFAULT 1 CHECK (level > 0),
    exp            integer  NOT NULL DEFAULT 0 CHECK (exp >= 0),
    mail_capacity  smallint NOT NULL DEFAULT 50 CHECK (mail_capacity > 0),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX player_name_unique ON game.player (lower(display_name));

COMMENT ON COLUMN game.player.uid IS
    'Mã 12 số hiện cho người chơi xem và đọc cho CSKH. Khác player_id (uuid nội bộ) '
    'vì uuid không đọc qua điện thoại được.';
COMMENT ON COLUMN game.player.display_name IS
    'Thay cho token {player_name} trong thân thư.';
COMMENT ON COLUMN game.player.mail_capacity IS
    'Mẫu số của "8 / 50" trên thanh tiêu đề Hòm thư. Hiện đang hard-code trong '
    'MailScreenController (mailCount = 8, mailCapacity = 50).';


-- SceneFlow đang giữ tư thế quay về trong biến static — mất sạch khi thoát game.
CREATE TABLE game.player_save (
    player_id   uuid PRIMARY KEY REFERENCES game.player ON DELETE CASCADE,
    scene_name  text NOT NULL DEFAULT 'MainScene',
    pos_x       real NOT NULL DEFAULT 0,
    pos_y       real NOT NULL DEFAULT 0,
    pos_z       real NOT NULL DEFAULT 0,
    yaw         real NOT NULL DEFAULT 0,
    day_time    real NOT NULL DEFAULT 0 CHECK (day_time >= 0 AND day_time < 24),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN game.player_save.day_time IS 'Giờ trong ngày của DayNightCycle, 0–24.';

CREATE TRIGGER player_save_touch BEFORE UPDATE ON game.player_save
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
--  10. GAME — VÍ & SỔ CÁI
--
--  wallet là số dư hiện tại, currency_ledger là sổ chỉ-ghi-thêm. Mọi thay đổi
--  số dư phải kèm một dòng sổ TRONG CÙNG TRANSACTION. Lệch nhau nghĩa là có bug,
--  và sổ cho biết bug ở đâu.
-- =============================================================================

CREATE TABLE game.wallet (
    player_id  uuid   NOT NULL REFERENCES game.player ON DELETE CASCADE,
    currency   content.currency_code NOT NULL,
    balance    bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
    PRIMARY KEY (player_id, currency)
);


-- Tạo sẵn đủ dòng ví cho mọi loại tiền ngay khi có nhân vật. Không có cái này
-- thì mọi chỗ cộng/trừ tiền đều phải viết ON CONFLICT DO UPDATE, và sẽ có một
-- chỗ nào đó quên.
CREATE FUNCTION game.seed_wallet() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO game.wallet (player_id, currency)
    SELECT NEW.player_id, c
      FROM unnest(enum_range(NULL::content.currency_code)) AS c;
    RETURN NEW;
END;
$$;

CREATE TRIGGER player_wallet_seed AFTER INSERT ON game.player
    FOR EACH ROW EXECUTE FUNCTION game.seed_wallet();

COMMENT ON FUNCTION game.seed_wallet() IS
    'Thêm loại tiền mới vào enum thì hàm này tự bắt kịp cho người chơi mới, nhưng '
    'người chơi CŨ vẫn thiếu dòng — nhớ chạy backfill trong cùng migration đó.';


CREATE TYPE game.ledger_reason AS ENUM (
    'nap_tien', 'mua_hang', 'quay_gacha', 'nhan_thu',
    'thuong_nhiem_vu', 'thuong_thanh_tuu', 'ban_vat_pham',
    'hoan_tien', 'gm_dieu_chinh'
);


CREATE TABLE game.currency_ledger (
    entry_id         bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id        uuid   NOT NULL REFERENCES game.player ON DELETE CASCADE,
    currency         content.currency_code NOT NULL,
    delta            bigint NOT NULL CHECK (delta <> 0),
    balance_after    bigint NOT NULL CHECK (balance_after >= 0),
    reason           game.ledger_reason NOT NULL,
    ref_type         text,
    ref_id           text,
    idempotency_key  text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    -- ref_type mà không có ref_id thì dòng sổ vô dụng lúc đi truy vết.
    CHECK ((ref_type IS NULL) = (ref_id IS NULL))
);

-- Bấm "Nhận" hai lần vì mạng lag thì KHÔNG được cộng tiền hai lần. Unique index
-- này biến lần gọi lại thứ hai thành lỗi trùng, để tầng trên trả lại kết quả cũ.
CREATE UNIQUE INDEX ledger_idempotent ON game.currency_ledger (player_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX ledger_by_player ON game.currency_ledger (player_id, created_at DESC);

-- Job đối soát hằng đêm quét theo cặp này; không có index thì nó seq-scan cả bảng.
CREATE INDEX ledger_reconcile ON game.currency_ledger (player_id, currency);

COMMENT ON COLUMN game.currency_ledger.ref_type IS
    'purchase_order | mail | gacha_pull | player_quest | player_achievement';


-- =============================================================================
--  11. GAME — TÚI ĐỒ & TRANG BỊ
-- =============================================================================

-- Xoá hẳn dòng khi quantity về 0. BagScreenController chỉ bật đúng số ô có vật
-- phẩm (slotRoots[i].SetActive(i < items.Length)), nên truy vấn "vật phẩm của
-- tôi" không bao giờ phải lọc bỏ số lượng 0.
CREATE TABLE game.inventory (
    player_id    uuid    NOT NULL REFERENCES game.player ON DELETE CASCADE,
    item_key     text    NOT NULL REFERENCES content.item,
    quantity     integer NOT NULL CHECK (quantity > 0),
    acquired_at  timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz,
    PRIMARY KEY (player_id, item_key)
);

COMMENT ON COLUMN game.inventory.expires_at IS
    'MỘT dòng cho mỗi (player, item) nên KHÔNG lưu hạn theo từng lô. Quy tắc: mỗi '
    'lần nhận thêm, server đặt lại acquired_at = now() và expires_at = now() + '
    'content.item.shelf_life (NULL nếu shelf_life NULL). Nhận thêm là gia hạn cả '
    'chồng. Rộng lượng với người chơi, nhưng nhất quán — khác với lấy hạn sớm '
    'nhất, vốn sẽ đốt oan phần vừa nhận.';

CREATE INDEX inventory_expiring ON game.inventory (expires_at)
    WHERE expires_at IS NOT NULL;


CREATE TABLE game.player_equipment (
    player_id  uuid NOT NULL REFERENCES game.player ON DELETE CASCADE,
    slot       content.equip_slot NOT NULL,
    item_key   text NOT NULL,
    PRIMARY KEY (player_id, slot),
    -- Khoá ngoại ghép: ép luôn hai điều kiện — item phải là đồ trang bị được
    -- (có dòng trong equipment_profile) VÀ phải đúng ô của nó. FK trỏ thẳng
    -- content.item thì không cản được việc nhét ca_rot vào ô 'non'.
    FOREIGN KEY (item_key, slot)
        REFERENCES content.equipment_profile (item_key, slot)
);

COMMENT ON TABLE game.player_equipment IS
    'DB không kiểm được "món đó có trong túi không" — đó là việc của transaction '
    'mặc đồ, đọc game.inventory trước khi ghi vào đây.';


-- =============================================================================
--  12. GAME — HÒM THƯ
-- =============================================================================

-- Chép nội dung ra khỏi template ngay lúc gửi: sửa văn bản mẫu về sau không
-- được phép làm đổi thư người chơi đã nhận.
CREATE TABLE game.mail (
    mail_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id        uuid   NOT NULL REFERENCES game.player ON DELETE CASCADE,
    template_key     text   REFERENCES content.mail_template,
    title            text   NOT NULL,
    sender           text   NOT NULL DEFAULT '',
    body             text   NOT NULL DEFAULT '',
    bundle_id        bigint REFERENCES content.reward_bundle,
    reward_snapshot  jsonb,
    sent_at          timestamptz NOT NULL DEFAULT now(),
    read_at          timestamptz,
    claimed_at       timestamptz,
    expires_at       timestamptz,
    deleted_at       timestamptz,
    -- Không thể nhận thưởng của một lá thư không có đính kèm.
    CHECK (claimed_at IS NULL OR bundle_id IS NOT NULL),
    -- Có đính kèm thì bắt buộc có bản chụp, nếu không nguyên tắc "chép ra khỏi
    -- template" chỉ đúng với phần chữ.
    CHECK ((bundle_id IS NULL) = (reward_snapshot IS NULL))
);

COMMENT ON COLUMN game.mail.reward_snapshot IS
    'Bản chụp content.reward_line lúc gửi: [{"currency":"hoa_sen","amount":100},'
    '{"item_key":"ca_rot","amount":3}]. Đây mới là thứ trả cho người chơi. '
    'bundle_id giữ lại chỉ để tra cứu nguồn gốc — admin sửa gói thưởng ngày mai '
    'không được đổi thư gửi hôm qua.';

CREATE INDEX mail_inbox ON game.mail (player_id, sent_at DESC)
    WHERE deleted_at IS NULL;

-- Phục vụ nút "Nhận hết".
CREATE INDEX mail_unclaimed ON game.mail (player_id)
    WHERE claimed_at IS NULL AND deleted_at IS NULL;


-- =============================================================================
--  13. GAME — GACHA
-- =============================================================================

CREATE TABLE game.banner_state (
    player_id     uuid   NOT NULL REFERENCES game.player ON DELETE CASCADE,
    banner_id     bigint NOT NULL REFERENCES content.banner,
    pulls_total   integer NOT NULL DEFAULT 0 CHECK (pulls_total >= 0),
    since_5_star  integer NOT NULL DEFAULT 0 CHECK (since_5_star >= 0),
    since_4_star  integer NOT NULL DEFAULT 0 CHECK (since_4_star >= 0),
    PRIMARY KEY (player_id, banner_id)
);


-- Chỉ ghi thêm, không sửa không xoá. rng_seed để dựng lại được đúng kết quả khi
-- người chơi khiếu nại — với gacha có tiền thật, đây không phải tính năng phụ.
CREATE TABLE game.gacha_pull (
    pull_id          bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id        uuid     NOT NULL REFERENCES game.player ON DELETE CASCADE,
    banner_id        bigint   NOT NULL REFERENCES content.banner,
    gacha_item_key   text     NOT NULL REFERENCES content.gacha_item,
    rarity           smallint NOT NULL CHECK (rarity BETWEEN 3 AND 5),
    was_pity         boolean  NOT NULL DEFAULT false,
    rng_seed         bigint   NOT NULL,
    idempotency_key  text     NOT NULL,
    pulled_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX gacha_pull_idempotent ON game.gacha_pull (player_id, idempotency_key);
CREATE INDEX gacha_pull_history ON game.gacha_pull (player_id, pulled_at DESC);


-- =============================================================================
--  14. GAME — ĐƠN NẠP
--
--  Ba cổng thanh toán, một bảng đơn: PayOS (chuyển khoản / VietQR) và IAP của
--  Google Play / App Store. Cổng nào là thuộc tính của TỪNG ĐƠN, không phải của
--  gói hàng — cùng một gói x560 bán được qua cả hai đường.
-- =============================================================================

-- 'cancelled' và 'expired' là của PayOS: người chơi bấm huỷ ở trang thanh toán,
-- hoặc để link quá hạn. Nhét cả hai vào 'failed' thì mất hẳn khả năng trả lời
-- câu hỏi "bao nhiêu người bỏ giữa chừng" — số liệu quan trọng nhất của màn Nạp.
--
-- LƯU Ý cho lần sau: enum này đang được TẠO MỚI nên thêm giá trị thoải mái. Một
-- khi đã chạy trên production thì phải dùng ALTER TYPE ... ADD VALUE, và giá trị
-- mới KHÔNG dùng được trong cùng transaction vừa thêm nó — phải tách hai lần chạy.
CREATE TYPE game.order_status AS ENUM (
    'pending', 'paid', 'delivered', 'failed', 'cancelled', 'expired', 'refunded'
);


-- PayOS định danh đơn bằng orderCode: một SỐ NGUYÊN dương, không phải uuid. Bắt
-- đầu từ 100000000 cho ra mã 9 chữ số trông như mã đơn hàng thật, và không lộ
-- "đây là đơn thứ 3 của cả hệ thống".
CREATE SEQUENCE game.payos_order_code_seq AS bigint
    START WITH 100000000
    MAXVALUE 9007199254740991;   -- trần số nguyên an toàn của JavaScript

COMMENT ON SEQUENCE game.payos_order_code_seq IS
    'orderCode phải là duy nhất VĨNH VIỄN trên mỗi merchant PayOS — tái sử dụng '
    'một mã cũ sẽ bị từ chối. Không bao giờ CYCLE, không bao giờ reset khi làm '
    'lại dữ liệu test trên cùng tài khoản merchant.';


CREATE TABLE game.purchase_order (
    order_id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    -- KHÔNG cascade: hồ sơ tài chính phải sống lâu hơn nhân vật. Đây chính là lý
    -- do account chỉ được xoá mềm.
    player_id        uuid    NOT NULL REFERENCES game.player ON DELETE RESTRICT,
    product_id       bigint  NOT NULL REFERENCES content.shop_product,
    -- Chốt ngay lúc tạo đơn, không để NULL: người chơi chọn cách trả tiền TRƯỚC
    -- khi có đơn. Cột này quyết định luồng xác thực nào chạy ở bước sau.
    provider         text    NOT NULL
                             CHECK (provider IN ('payos', 'google_play', 'app_store')),
    status           game.order_status NOT NULL DEFAULT 'pending',
    price_vnd        integer NOT NULL CHECK (price_vnd > 0),
    is_once          boolean NOT NULL DEFAULT false,
    bonus_applied    boolean NOT NULL DEFAULT false,

    -- Mã giao dịch phía cổng. PayOS: paymentLinkId. IAP: purchaseToken /
    -- transactionId. Tên chung vì unique index chống giao hàng hai lần dùng chung.
    provider_txn_id  text,
    -- Nguyên văn thứ cổng trả về: biên lai IAP, hoặc data của webhook PayOS cuối
    -- cùng. Giữ để đối soát, không phải để truy vấn.
    provider_payload jsonb,

    -- --- Chỉ đơn PayOS mới có ------------------------------------------------
    payos_order_code bigint  UNIQUE CHECK (payos_order_code > 0),
    checkout_url     text,
    -- Chuỗi VietQR thô. Client tự vẽ QR, KHÔNG lưu ảnh xuống DB.
    qr_code          text,
    link_expires_at  timestamptz,
    -- Mã tham chiếu ngân hàng trong webhook. Thứ người chơi đọc cho CSKH khi bảo
    -- "tôi chuyển rồi mà chưa nhận".
    bank_reference   text,

    created_at       timestamptz NOT NULL DEFAULT now(),
    paid_at          timestamptz,
    delivered_at     timestamptz,

    CHECK (status <> 'delivered' OR delivered_at IS NOT NULL),
    CHECK (status NOT IN ('paid','delivered','refunded') OR paid_at IS NOT NULL),
    CHECK (status NOT IN ('paid','delivered','refunded') OR provider_txn_id IS NOT NULL),
    -- Đơn PayOS thì bắt buộc có orderCode; đơn IAP thì tuyệt đối không.
    CHECK ((provider = 'payos') = (payos_order_code IS NOT NULL)),
    -- Bốn cột PayOS không được lem sang đơn IAP.
    CHECK (provider = 'payos' OR (checkout_url    IS NULL
                              AND qr_code         IS NULL
                              AND link_expires_at IS NULL
                              AND bank_reference  IS NULL))
);

-- Cùng một giao dịch phía cổng không bao giờ được giao hàng hai lần.
CREATE UNIQUE INDEX purchase_provider_txn ON game.purchase_order (provider, provider_txn_id)
    WHERE provider_txn_id IS NOT NULL;

-- Đây mới là chỗ ép once_per_account, KHÔNG cần SELECT ... FOR UPDATE. Hai request
-- song song thì một cái ăn lỗi unique — đúng cơ chế đã dùng cho ledger và gacha.
CREATE UNIQUE INDEX purchase_once_per_account
    ON game.purchase_order (player_id, product_id)
    WHERE is_once AND status IN ('paid', 'delivered');

CREATE INDEX purchase_by_player ON game.purchase_order (player_id, created_at DESC);

-- Job nền quét link PayOS quá hạn để đóng đơn về 'expired'. Không có nó thì đơn
-- treo ở 'pending' mãi mãi và once_per_account bị kẹt theo.
CREATE INDEX purchase_payos_pending ON game.purchase_order (link_expires_at)
    WHERE status = 'pending' AND provider = 'payos';

COMMENT ON COLUMN game.purchase_order.price_vnd IS
    'CHÉP LẠI giá tại thời điểm đặt, không join ngược về shop_product. Admin đổi '
    'giá ngày mai không được phép làm sai lệch đơn hàng hôm qua. Với PayOS, đây '
    'cũng là số tiền phải KHỚP với amount trong webhook — lệch một đồng là không '
    'giao hàng, ghi log rồi báo động.';
COMMENT ON COLUMN game.purchase_order.is_once IS
    'Chép từ shop_product.once_per_account lúc đặt đơn. Admin tắt cờ đó về sau '
    'không mở khoá được các đơn đã mua — đúng như mong đợi.';
COMMENT ON COLUMN game.purchase_order.payos_order_code IS
    'Lấy từ nextval(''game.payos_order_code_seq''). Đây là khoá để tra ngược từ '
    'webhook về đơn, vì PayOS chỉ gửi orderCode chứ không biết order_id uuid.';


-- Mọi thứ cổng thanh toán gửi tới đều rơi vào bảng này TRƯỚC, rồi mới xử lý.
-- Webhook là tiền thật: cần vết để đối soát khi người chơi khiếu nại, và cần
-- chống xử lý lặp vì PayOS gửi lại cho tới khi nhận được HTTP 200.
CREATE TABLE game.payment_webhook (
    webhook_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider      text   NOT NULL
                         CHECK (provider IN ('payos', 'google_play', 'app_store')),
    -- PayOS: data.orderCode ép sang text. IAP: purchaseToken.
    external_id   text   NOT NULL,
    -- NULL khi không tra ra đơn nào — webhook rác, hoặc đơn đã bị xoá. Vẫn phải
    -- lưu lại, đó là lúc cần vết nhất.
    order_id      uuid   REFERENCES game.purchase_order,
    signature     text,
    -- Ghi lại KẾT QUẢ kiểm chữ ký, không phải "đã kiểm chưa". false = có kẻ giả
    -- mạo hoặc checksum key sai; cả hai đều đáng báo động.
    signature_ok  boolean NOT NULL,
    payload       jsonb   NOT NULL,
    received_at   timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz,
    error         text,
    CHECK (processed_at IS NULL OR error IS NULL)
);

-- PayOS gửi lại cùng một sự kiện thì chữ ký y hệt (HMAC trên cùng bộ data). Lần
-- gửi lại thứ hai ăn lỗi trùng, tầng trên bắt lỗi đó rồi trả 200 luôn — cùng cơ
-- chế idempotency đã dùng cho ledger và gacha.
CREATE UNIQUE INDEX payment_webhook_dedupe
    ON game.payment_webhook (provider, signature) WHERE signature IS NOT NULL;

CREATE INDEX payment_webhook_pending ON game.payment_webhook (received_at)
    WHERE processed_at IS NULL;

CREATE INDEX payment_webhook_by_order ON game.payment_webhook (order_id, received_at DESC);

COMMENT ON TABLE game.payment_webhook IS
    'Chỉ ghi thêm. Nhận webhook = INSERT vào đây + trả 200 NGAY, việc giao hàng '
    'để transaction riêng đọc từ đây ra. Cổng thanh toán không cần biết giao hàng '
    'lâu hay nhanh, và không được phép timeout vì mình xử lý chậm.';


-- =============================================================================
--  15. GAME — TIẾN TRÌNH
-- =============================================================================

CREATE TYPE game.quest_status AS ENUM ('dang_lam', 'hoan_thanh', 'da_nhan_thuong');


CREATE TABLE game.player_quest (
    player_id     uuid NOT NULL REFERENCES game.player ON DELETE CASCADE,
    quest_key     text NOT NULL REFERENCES content.quest,
    status        game.quest_status NOT NULL DEFAULT 'dang_lam',
    started_at    timestamptz NOT NULL DEFAULT now(),
    completed_at  timestamptz,
    claimed_at    timestamptz,
    PRIMARY KEY (player_id, quest_key),
    CHECK (status <> 'dang_lam'       OR completed_at IS NULL),
    CHECK (status <> 'hoan_thanh'     OR completed_at IS NOT NULL),
    CHECK (status <> 'da_nhan_thuong' OR claimed_at   IS NOT NULL)
);


CREATE TABLE game.player_quest_objective (
    player_id  uuid     NOT NULL,
    quest_key  text     NOT NULL,
    ordinal    smallint NOT NULL,
    progress   integer  NOT NULL DEFAULT 0 CHECK (progress >= 0),
    PRIMARY KEY (player_id, quest_key, ordinal),
    FOREIGN KEY (player_id, quest_key)
        REFERENCES game.player_quest ON DELETE CASCADE,
    FOREIGN KEY (quest_key, ordinal)
        REFERENCES content.quest_objective
);


CREATE TABLE game.player_achievement (
    player_id        uuid   NOT NULL REFERENCES game.player ON DELETE CASCADE,
    achievement_key  text   NOT NULL REFERENCES content.achievement,
    progress         bigint NOT NULL DEFAULT 0 CHECK (progress >= 0),
    unlocked_at      timestamptz,
    claimed_at       timestamptz,
    PRIMARY KEY (player_id, achievement_key),
    CHECK (claimed_at IS NULL OR unlocked_at IS NOT NULL)
);


-- ready_at do server tính lúc gieo. Không tin đồng hồ client — đó là lỗ hổng
-- kinh điển của mọi game nông trại.
CREATE TABLE game.farm_plot (
    player_id    uuid     NOT NULL REFERENCES game.player ON DELETE CASCADE,
    plot_index   smallint NOT NULL CHECK (plot_index >= 0),
    crop_key     text     REFERENCES content.crop,
    planted_at   timestamptz,
    ready_at     timestamptz,
    water_count  smallint NOT NULL DEFAULT 0 CHECK (water_count >= 0),
    PRIMARY KEY (player_id, plot_index),
    CHECK ((crop_key IS NULL) = (planted_at IS NULL)),
    CHECK ((planted_at IS NULL) = (ready_at IS NULL)),
    CHECK (ready_at IS NULL OR ready_at > planted_at),
    -- Ô đất trống thì không thể đã tưới lần nào.
    CHECK (crop_key IS NOT NULL OR water_count = 0)
);

CREATE INDEX farm_plot_ready ON game.farm_plot (ready_at) WHERE ready_at IS NOT NULL;


-- Kết quả minigame trong TranhKiengRoom.
CREATE TABLE game.artwork (
    artwork_id   bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id    uuid     NOT NULL REFERENCES game.player ON DELETE CASCADE,
    pattern_key  text     NOT NULL REFERENCES content.tranh_kieng_pattern,
    score        smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
    stars        smallint NOT NULL CHECK (stars BETWEEN 0 AND 3),
    strokes      jsonb,
    finished_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artwork_by_player ON game.artwork (player_id, finished_at DESC);

COMMENT ON COLUMN game.artwork.strokes IS
    'Nét vẽ đã lưu, để dựng lại bức tranh trong sổ tay. NULL nếu chỉ lưu điểm.';


CREATE TABLE game.codex_unlock (
    player_id    uuid NOT NULL REFERENCES game.player ON DELETE CASCADE,
    entry_key    text NOT NULL REFERENCES content.codex_entry,
    unlocked_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, entry_key)
);


-- =============================================================================
--  16. KHỞI TẠO
-- =============================================================================

INSERT INTO content.config_state (id) VALUES (true);


-- =============================================================================
--  17. QUY TẮC KHÔNG NẰM TRONG DB
--
--  1. wallet.balance = SUM(currency_ledger.delta) cho cùng player_id + currency.
--     Chạy đối soát hằng đêm; lệch là báo động ngay.
--
--  2. KHÔNG BAO GIỜ tin client về chuyện đã trả tiền. Client chỉ được báo "tôi
--     vừa mua xong", không bao giờ được báo "hãy cộng cho tôi 560 hoa sen".
--       - PayOS: chỉ webhook mới đổi được status sang 'paid', và chỉ sau khi
--         kiểm chữ ký HMAC-SHA256 bằng checksum key VÀ đối chiếu amount trong
--         webhook đúng bằng purchase_order.price_vnd. Không có endpoint nào cho
--         client tự xác nhận; returnUrl chỉ để hiện màn "cảm ơn", nó không phải
--         bằng chứng thanh toán.
--       - IAP: biên lai phải xác thực với Google/Apple trước khi đổi 'paid'.
--
--  2b. Giao hàng PayOS chạy đúng một transaction, đọc từ game.payment_webhook:
--        SELECT ... FROM purchase_order WHERE payos_order_code = $1 FOR UPDATE
--        → kiểm status còn 'pending' và price_vnd khớp amount
--        → cộng ví + ghi currency_ledger (idempotency_key = order_id)
--        → status = 'delivered', paid_at, delivered_at
--        → payment_webhook.processed_at = now()
--      Webhook trùng bị unique index payment_webhook_dedupe chặn từ vòng ngoài,
--      còn FOR UPDATE lo hai webhook khác chữ ký cùng trỏ một đơn.
--
--  3. KHÔNG BAO GIỜ hard-delete game.account. purchase_order tham chiếu player
--     với ON DELETE RESTRICT nên DELETE sẽ lỗi khoá ngoại — và đó là chủ ý, hồ
--     sơ tài chính phải giữ. Xoá tài khoản = status 'deleted' + deleted_at, rồi
--     job nền dọn PII (display_name, avatar_url) sau thời hạn lưu trữ.
--
--  4. KHÔNG BAO GIỜ hard-delete content.item / quest / achievement / codex_entry
--     đã lên published. Dữ liệu người chơi trỏ vào chúng không cascade. Nút xoá
--     ở trang quản trị phải map sang status = 'archived'.
--
--  5. game.inventory: mỗi lần cộng số lượng phải cập nhật lại acquired_at và
--     expires_at (xem comment ở cột). Cộng quantity mà quên hạn là bug im lặng.
--
--  6. game.player_equipment không kiểm được món đồ có trong túi hay không —
--     transaction mặc đồ phải tự đọc game.inventory trước.
--
--  7. content.quest_objective.target_key và content.achievement.target_key trỏ
--     nhiều bảng khác nhau tuỳ kind, không đặt FK được. Trang quản trị phải
--     validate trước khi lưu.
--
--  8. content.quest.requires_quest có thể tạo chu trình A→B→A. Kiểm ở tầng nhập
--     liệu bằng một lượt duyệt đồ thị lúc xuất bản.
-- =============================================================================


-- =============================================================================
--  RLS
--
--  Supabase phơi schema qua PostgREST cho bất kỳ ai cầm anon key. Ba schema mới
--  hiện chưa nằm trong danh sách phơi, nhưng bật RLS là bảo hiểm rẻ tiền cho
--  ngày ai đó thêm chúng vào. Không tạo policy nào: mặc định = chặn hết.
--
--  Prisma không bị ảnh hưởng vì nó kết nối bằng chính role sở hữu bảng, mà
--  Postgres không áp RLS lên owner (chừng nào chưa FORCE ROW LEVEL SECURITY).
--
--  Vòng lặp thay vì 40 dòng ALTER tay: bảng mới thêm sau này chạy lại là đủ,
--  không sợ quên bảng nào.
-- =============================================================================

DO $rls$
DECLARE t record;
BEGIN
    FOR t IN
        SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname IN ('content', 'game', 'admin')
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                       t.schemaname, t.tablename);
    END LOOP;
END;
$rls$;
