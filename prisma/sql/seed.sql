-- =============================================================================
--  KÝ ỨC DI SẢN — Dữ liệu ban đầu (BẢN CHỈ CHỨA DỮ LIỆU CÓ THẬT)
--
--  LUẬT CỦA FILE NÀY: mỗi dòng dưới đây phải truy ngược được về một chuỗi
--  hard-code đang có trong repo Unity. Không suy diễn, không số tạm, không tên
--  đặt trước. Cái gì repo chưa có thì để TRỐNG BẢNG — trống thì sau này nối
--  game vào là khớp, còn điền bừa thì phải đi dò xem dòng nào thật dòng nào bịa.
--
--  Nguồn ghi ở đầu mỗi phần, kèm tên mảng trong file .cs.
--  Phần 9 liệt kê những gì đã CỐ Ý BỎ RA và vì sao.
--
--  Chạy sau schema.sql. Cả file nằm trong một transaction: lỗi giữa chừng thì
--  rollback sạch, không để lại nửa vời.
-- =============================================================================

BEGIN;


-- =============================================================================
--  1. VẬT PHẨM — 32 dòng
--  Nguồn: UIBagScreenBuilder.BagItems
--
--  Đã đối chiếu tự động: 32/32 khoá + tên hiển thị khớp tuyệt đối với mảng gốc,
--  đúng cả thứ tự (sort_order chép theo chỉ số mảng, để lưới túi đồ hiện y Figma).
--  Mỗi item_key khớp một file Assets/_ky-uc-di-san/UI/Sprites/bag_item_<key>.png.
--
--  KHÔNG set is_consumable / is_equippable / stack_max / shelf_life: repo không
--  có con số nào cho mấy cột đó. Để nguyên mặc định của lược đồ.
-- =============================================================================

-- --- Dụng cụ (16) — toàn bộ là đồ vẽ tranh kiếng -----------------------------
INSERT INTO content.item (item_key, display_name, description, category, sort_order) VALUES
    ('co_dau_nhon',   'Cọ vẽ đầu nhọn',   'Dùng để vẽ tranh kiếng', 'dung_cu',  1),
    ('co_ban_nho',    'Cọ vẽ bản nhỏ',    '',                       'dung_cu',  2),
    ('co_long',       'Cọ lông tròn',     '',                       'dung_cu',  3),
    ('but_chi',       'Bút chì phác thảo','',                       'dung_cu',  4),
    ('mau_hong',      'Màu hồng',         '',                       'dung_cu',  5),
    ('mau_xanh_la',   'Màu xanh lá',      '',                       'dung_cu',  6),
    ('mau_cam',       'Màu cam',          '',                       'dung_cu',  7),
    ('tam_kinh',      'Tấm kính',         '',                       'dung_cu',  8),
    ('co_ban_det',    'Cọ bản dẹt',       '',                       'dung_cu',  9),
    ('co_quat',       'Cọ quạt',          '',                       'dung_cu', 10),
    ('co_quet',       'Cọ quét',          '',                       'dung_cu', 11),
    ('mau_do',        'Màu đỏ',           '',                       'dung_cu', 12),
    ('mau_xanh_ngoc', 'Màu xanh ngọc',    '',                       'dung_cu', 13),
    ('mau_tim',       'Màu tím',          '',                       'dung_cu', 14),
    ('bang_mau',      'Bảng pha màu',     '',                       'dung_cu', 15),
    ('mau_vang',      'Màu vàng',         '',                       'dung_cu', 16);

-- --- Trang bị (8) — toàn bộ là đồ làm nông ----------------------------------
-- Danh mục "Dụng cụ" trong game là đồ VẼ, đồ LÀM NÔNG lại nằm ở "Trang bị".
-- Đúng như repo, không phải gõ ngược.
--
-- is_equippable để mặc định false: repo xếp 8 món này vào danh mục "Trang bị"
-- nhưng KHÔNG nói món nào đeo ở ô nào. Bật cờ "mặc được" mà không có hồ sơ
-- trang bị đi kèm sẽ tạo ra vật phẩm mặc được không có ô nào để mặc — và trang
-- quản trị suy ngược cờ này từ hồ sơ trang bị (admin-content.resources.ts), nên
-- lần sửa đầu tiên trên web sẽ tự tắt nó đi. Xem phần 9.
INSERT INTO content.item (item_key, display_name, category, sort_order) VALUES
    ('cao_co',           'Cào cỏ',           'trang_bi', 17),
    ('keo_tia',          'Kéo tỉa cành',     'trang_bi', 18),
    ('ung_lam_nong',     'Ủng làm nông',     'trang_bi', 19),
    ('xo_thiec',         'Xô thiếc',         'trang_bi', 20),
    ('xeng_xuc_dat',     'Xẻng xúc đất',     'trang_bi', 21),
    ('chau_dat',         'Chậu đất',         'trang_bi', 22),
    ('binh_tuoi_cay',    'Bình tưới cây',    'trang_bi', 23),
    ('bao_tay_lam_nong', 'Bao tay làm nông', 'trang_bi', 24);

-- --- Thực phẩm (8) — nông sản ------------------------------------------------
-- is_consumable để mặc định false: repo không nói 8 món này ăn được hay chỉ để
-- bán. Danh mục "Thực phẩm" là phân loại hiển thị, không phải hành vi.
INSERT INTO content.item (item_key, display_name, category, sort_order) VALUES
    ('bap',     'Bắp',         'thuc_pham', 25),
    ('ca_rot',  'Củ cà rốt',   'thuc_pham', 26),
    ('dua_leo', 'Dưa leo',     'thuc_pham', 27),
    ('ca_tim',  'Quả cà tím',  'thuc_pham', 28),
    ('ot',      'Trái ớt',     'thuc_pham', 29),
    ('bap_cai', 'Bắp cải',     'thuc_pham', 30),
    ('bi_do',   'Bí đỏ',       'thuc_pham', 31),
    ('ca_chua', 'Quả cà chua', 'thuc_pham', 32);


-- =============================================================================
--  2. NPC — 1 dòng
--  Nguồn: UIScreenBuilder.HudQuests, nội dung nhiệm vụ nhắc tên "chú Tư".
--
--  Cả dự án KHÔNG có script NPC nào (đã dò toàn bộ Assets/_ky-uc-di-san/Scripts).
--  Đây thuần tuý là một cái tên có thật trong text nhiệm vụ. scene_name lấy
--  mặc định của lược đồ, không phải vị trí ai đó đã đặt sẵn trong scene.
-- =============================================================================

INSERT INTO content.npc (npc_key, display_name) VALUES
    ('chu_tu', 'Chú Tư');


-- =============================================================================
--  3. GÓI PHẦN THƯỞNG CỦA CÁC GÓI NẠP — 8 dòng
--  Nguồn: UIShopScreenBuilder.TopupPacks (cột Amount) + icon trên thẻ.
--
--  "x15", "x51"... là số HOA SEN: builder dán hud_icon_hoa_sen lên từng thẻ nạp
--  (CreateImage($"PackIcon_{i}", canvas, HudHoaSenPath, ...)), nên đơn vị đọc
--  được thẳng từ repo chứ không phải đoán.
-- =============================================================================

INSERT INTO content.reward_bundle (bundle_key, note) VALUES
    ('nap_x15',   'Gói nạp 15 hoa sen'),
    ('nap_x51',   'Gói nạp 51 hoa sen'),
    ('nap_x115',  'Gói nạp 115 hoa sen'),
    ('nap_x230',  'Gói nạp 230 hoa sen'),
    ('nap_x450',  'Gói nạp 450 hoa sen'),
    ('nap_x560',  'Gói nạp 560 hoa sen'),
    ('nap_x800',  'Gói nạp 800 hoa sen'),
    ('nap_x1300', 'Gói nạp 1.300 hoa sen');

INSERT INTO content.reward_line (bundle_id, ordinal, currency, amount)
SELECT b.bundle_id, 1, 'hoa_sen', v.amount
FROM (VALUES
    ('nap_x15',    15),
    ('nap_x51',    51),
    ('nap_x115',  115),
    ('nap_x230',  230),
    ('nap_x450',  450),
    ('nap_x560',  560),
    ('nap_x800',  800),
    ('nap_x1300',1300)
) AS v(bundle_key, amount)
JOIN content.reward_bundle b ON b.bundle_key = v.bundle_key;


-- =============================================================================
--  4. SẢN PHẨM CỬA HÀNG — 16 dòng
--  Nguồn: UIShopScreenBuilder.TopupPacks + FirstTopupDiscountPrice.
--
--  Giá trong repo là chuỗi Figma định dạng lộn xộn ("7.000VND" dính liền,
--  "25.000 VND" có dấu cách) — ở đây lưu số nguyên đồng, giá trị không đổi.
--
--  store_sku ĐỂ NULL. Cột này nhận NULL (schema.prisma: storeSku String?).
--  Mã SKU thật chỉ có sau khi đăng ký ở Google Play Console / App Store Connect;
--  đặt tên trước rồi quên sửa là bán hàng vào một SKU không tồn tại.
--
--  Tất cả để status mặc định 'draft' — bấm Xuất bản trên trang quản trị mới ra
--  tới người chơi.
-- =============================================================================

-- --- Tab "Nạp" — 8 gói giá gốc ----------------------------------------------
INSERT INTO content.shop_product
    (product_key, tab, display_name, price_vnd, bundle_id, sort_order)
SELECT v.product_key, 'nap', v.display_name, v.price, b.bundle_id, v.ord
FROM (VALUES
    ('nap_x15',   'x15',      7000, 'nap_x15',   1),
    ('nap_x51',   'x51',     25000, 'nap_x51',   2),
    ('nap_x115',  'x115',    59000, 'nap_x115',  3),
    ('nap_x230',  'x230',    99000, 'nap_x230',  4),
    ('nap_x450',  'x450',   199000, 'nap_x450',  5),
    ('nap_x560',  'x560',   239000, 'nap_x560',  6),
    ('nap_x800',  'x800',   349000, 'nap_x800',  7),
    ('nap_x1300', 'x1.300', 599000, 'nap_x1300', 8)
) AS v(product_key, display_name, price, bundle_key, ord)
JOIN content.reward_bundle b ON b.bundle_key = v.bundle_key;

-- --- Tab "Nạp đầu cực hời" — cùng 8 gói, huy hiệu x2, riêng x560 giảm giá ----
-- Repo dán huy hiệu shop_badge_x2 lên cả 8 thẻ, và RIÊNG gói x560 dùng
-- FirstTopupDiscountPrice = "209.000 VND" (gắn cứng bằng `i == 5`). Ở đây giá
-- nằm thành dữ liệu nên đổi thứ tự gói không làm khuyến mãi nhảy lung tung.
INSERT INTO content.shop_product
    (product_key, tab, display_name, price_vnd, bundle_id,
     bonus_multiplier, once_per_account, sort_order)
SELECT v.product_key, 'nap_dau_cuc_hoi', v.display_name, v.price,
       b.bundle_id, 2.00, true, v.ord
FROM (VALUES
    ('napdau_x15',   'x15',      7000, 'nap_x15',   1),
    ('napdau_x51',   'x51',     25000, 'nap_x51',   2),
    ('napdau_x115',  'x115',    59000, 'nap_x115',  3),
    ('napdau_x230',  'x230',    99000, 'nap_x230',  4),
    ('napdau_x450',  'x450',   199000, 'nap_x450',  5),
    ('napdau_x560',  'x560',   209000, 'nap_x560',  6),
    ('napdau_x800',  'x800',   349000, 'nap_x800',  7),
    ('napdau_x1300', 'x1.300', 599000, 'nap_x1300', 8)
) AS v(product_key, display_name, price, bundle_key, ord)
JOIN content.reward_bundle b ON b.bundle_key = v.bundle_key;

-- Ba tab còn lại — "Gói ưu đãi", "Đổi quà nạp", "Gói tài nguyên" — repo đã dựng
-- giao diện nhưng chưa có mảng dữ liệu nào. Để trống.


-- =============================================================================
--  5. GACHA — 3 dòng
--  Nguồn: UIGachaScreenBuilder.GachaItems. Mô tả và câu trích dẫn chép nguyên văn.
--
--  rarity đọc từ StarsPath: gacha_sao_5.png ⇒ 5, gacha_sao_4.png ⇒ 4.
--  "Giếng ước nguyện" cố ý KHÔNG có phân loại lẫn trích dẫn — Figma không kẻ hai
--  dòng đó, client tự ẩn.
-- =============================================================================

INSERT INTO content.gacha_item
    (gacha_item_key, display_name, subtitle, description, quote, rarity) VALUES
    ('chi_em_cay_khe', 'Chị em cây khế', 'Trang phục cực phẩm',
     'Áo vải mộc mạc mang sắc xanh của lá và vàng óng của mùa màng bội thu, '
     'điểm xuyết họa tiết hoa khế thanh tao cùng chiếc túi ba gang gọn gàng. '
     'Đại diện cho sự chân thành và phần thưởng xứng đáng từ thiên nhiên.',
     '“Ăn một quả, trả cục vàng, may túi ba gang mang theo mà đựng”',
     5),

    ('go_dan_huong', 'Gỗ đàn hương', 'Gia sản cấp gia tiên',
     'Thiết kế mang sắc trầm ấm áp của gỗ quý nguyên bản, điểm xuyết những '
     'đường vân tinh tế và họa tiết lá khế cách điệu mạ ánh kim thanh nhã. '
     'Tựa như thứ hương thơm càng mài giũa càng tỏa ngát, đại diện cho phẩm '
     'chất cao quý và tâm hồn nguyên bản không phai mờ trước dòng đời.',
     '“Trầm mặc, quý phái và vĩnh cửu – nơi hương thơm thanh cao khắc họa '
     'tâm hồn, còn sự ngạo nghễ định đoạt giá trị.”',
     5),

    ('gieng_uoc_nguyen', 'Giếng ước nguyện', '',
     'Dưới đáy giếng sâu là linh hồn của những khát vọng, nơi lòng thành được '
     'đáp đền bằng ánh sáng, còn lòng tham chìm nghỉm trong bóng tối vĩnh hằng.',
     '',
     4);

-- KHÔNG seed content.banner / content.banner_entry. Xem phần 9.


-- =============================================================================
--  6. THƯ MẪU — 7 dòng
--  Nguồn: UIMailScreenBuilder.Mails.
--
--  Repo có 7 lá nhưng CHỈ lá đầu có đủ nội dung; 6 lá còn lại mới có tiêu đề
--  (Figma chưa viết nội dung). Giữ nguyên như vậy, không viết hộ.
--
--  Một chỗ cố ý khác repo: repo ghi "&lt;tên nhân vật&gt;" để TMP khỏi nuốt chuỗi
--  vì tưởng là thẻ rich text. Escape là việc của client, không nhét vào dữ liệu —
--  ở đây dùng token {player_name}.
--  Giữ nguyên cặp ngoặc vuông "[Thư cá nhân]"; client tự bỏ khi hiện ở khung bên
--  phải (StripBrackets). Giữ nguyên cả dấu cách thừa trong "“ Heritage".
-- =============================================================================

INSERT INTO content.mail_template (template_key, title, sender, body) VALUES
    ('thu_be_bong_bong', '[Thư cá nhân]', 'Bé Bông Bông',
     -- MỘT literal E'' duy nhất, cố ý để dài. Postgres có nối hai chuỗi nằm cách
     -- nhau bởi xuống dòng, NHƯNG chỉ khi chuỗi tiếp theo mở bằng dấu nháy trần.
     -- Xếp chồng E'…' E'…' là lỗi cú pháp — chỉ literal ĐẦU được mang tiền tố E.
     E'{player_name} thân mến!\nĐã lâu rồi chúng ta chưa gặp nhau, sắp tới mình có một chuyến du lịch đến làng nghề làm lồng đèn ở Sài Gòn. Bạn có thời gian không? Nếu có thì chúng ta gặp nhau nhé.\nThân gửi!\nBé Bông Bông.'),

    ('thu_nhac_het_han',  'Nhắc nhở vật phẩm hết hạn',              '',                 ''),
    ('thu_rong_xanh',     '[Thư cá nhân]',                          'Rồng Xanh Sì Gòn', ''),
    ('thu_khao_sat_thu',  'Khảo sát chất lượng bản thử nghiệm',     '',                 ''),
    ('thu_khao_sat_hl',   'Khảo sát mức độ hài lòng',               '',                 ''),
    ('thu_moi_offline',   'Thư mời tham gia sự kiện offline',       '',                 ''),
    ('thu_su_kien_hic',   'Sự kiện “ Heritage Innovation Contest”', '',                 '');

-- Lá thư đầu đính kèm 100 lồng đèn: Figma vẽ icon hud_icon_long_den kèm số "100"
-- (MailData.RewardIconPath = HudLongDenPath, RewardAmount = "100").
INSERT INTO content.reward_bundle (bundle_key, note)
    VALUES ('thu_be_bong_bong_qua', 'Đính kèm thư Bé Bông Bông: 100 lồng đèn');

INSERT INTO content.reward_line (bundle_id, ordinal, currency, amount)
SELECT bundle_id, 1, 'long_den', 100
FROM content.reward_bundle WHERE bundle_key = 'thu_be_bong_bong_qua';

UPDATE content.mail_template
SET bundle_id = (SELECT bundle_id FROM content.reward_bundle
                 WHERE bundle_key = 'thu_be_bong_bong_qua')
WHERE template_key = 'thu_be_bong_bong';


-- =============================================================================
--  7. NHIỆM VỤ — 3 dòng, CHỈ phần chữ
--  Nguồn: UIScreenBuilder.HudQuests.
--
--  quest_key lấy từ HudQuest.Name ("DuaNuoc" / "ChuTu" / "ThuCung").
--  summary chép nguyên văn HudQuest.Body, giữ cả dấu xuống dòng của Figma.
--
--  title ĐỂ RỖNG — repo KHÔNG có tên nhiệm vụ. Nhãn trên HUD là chuỗi cố định
--  "Nhiệm vụ: " dùng chung cho cả ba (UIScreenBuilder dòng 981), không phải tên
--  riêng của từng nhiệm vụ. Admin đặt tên sau, đừng để tên bịa nằm sẵn trong DB.
--
--  KHÔNG seed content.quest_objective. Xem phần 9.
-- =============================================================================

INSERT INTO content.quest (quest_key, title, summary, sort_order) VALUES
    ('dua_nuoc', '', E'Thu thập 3 buồng dừa nước\nvà mang về cho chú Tư.', 1),
    ('chu_tu',   '', E'Trò chuyện cùng chú Tư và\ntìm hiểu về cù lao.',    2),
    ('thu_cung', '', 'Cho thú cưng ăn 3 lần.',                             3);


-- =============================================================================
--  8. THÀNH TỰU — 3 dòng
--  Nguồn: UIScreenBuilder.AchievementRows.
--
--  title + description chép NGUYÊN VĂN, kể cả lỗi chính tả "Thu tập" (đúng phải
--  là "Thu thập") và dấu cách thừa trong "700.000Đ tại chợ/ tiệm". Không tự sửa
--  — đây là bản chép nguồn; muốn sửa thì sửa cả hai nơi cùng lúc.
--
--  target_count đọc thẳng trong câu mô tả (1000 / 700000 / 10).
--  kind là cột NOT NULL nên buộc phải có giá trị; ba giá trị dùng ở đây khớp
--  đúng ý enum ObjectiveKind — chú thích của enum còn lấy chính thành tựu này
--  làm ví dụ ("ví dụ 10 nội thất cấp gia tiên").
--
--  target_key ĐỂ NULL cả ba. Xem phần 9.
-- =============================================================================

INSERT INTO content.achievement
    (achievement_key, title, description, kind, target_count, sort_order) VALUES
    ('nong_dan',  'Nông dân số 1',
     'Thu tập 1000 lúa',                             'thu_thap',          1000, 1),
    ('mua_hang',  'Người mua hàng thông thái',
     'Tích lũy tiêu 700.000Đ tại chợ/ tiệm tạp hóa', 'tieu_tien',       700000, 2),
    ('gia_tien',  'Nhà gia tiên',
     'Sở hữu tối thiểu 10 nội thất cấp gia tiên',    'so_huu_vat_pham',     10, 3);


COMMIT;


-- =============================================================================
--  9. ĐÃ CỐ Ý BỎ RA — và vì sao
--
--  Mỗi mục dưới đây từng có trong bản seed trước (3x3-ky-uc-di-san-game/db/seed.sql).
--  Bỏ vì repo Unity không có căn cứ, mà dữ liệu bịa nằm trong DB thì sau này
--  không ai phân biệt nổi với dữ liệu thật. Bảng để trống, điền khi thiết kế
--  game chốt.
-- =============================================================================

-- content.equipment_profile (8 dòng)
--   Repo chỉ xếp 8 món vào danh mục "Trang bị", KHÔNG nói món nào đeo ô nào.
--   Bản cũ tự gán ủng→chân, bao tay→tay, 6 món còn lại→phụ kiện. Hệ quả: mỗi ô
--   chỉ đeo được một món nên người chơi chỉ cầm được 1 trong 6 dụng cụ làm nông
--   cùng lúc — một luật chơi sinh ra từ chỗ trống, không ai quyết cả.
--   Kéo theo: is_equippable của 8 món đó cũng để false (xem phần 1).

-- content.banner + content.banner_entry
--   Giá quay 160 hoa sen, pity 90/10, trọng số 50/50/900 — repo không có một số
--   nào trong đó. Riêng tỉ lệ gacha thì nhiều nước bắt công bố, số tạm lọt ra
--   ngoài là chuyện pháp lý chứ không chỉ là bug.

-- content.quest_objective (4 dòng)
--   Bản cũ tách câu văn tiếng Việt thành kind/target_key/target_count. Trong đó
--   'buong_dua_nuoc' là vật phẩm KHÔNG TỒN TẠI trong 32 item — nhiệm vụ vẫn tạo
--   được nhưng không bao giờ hoàn thành nổi. Đợi có hệ thống nhiệm vụ thật.

-- content.achievement.target_key
--   Thành tựu "Nông dân số 1" đếm 'lua', mà 'lua' cũng không có trong 32 item
--   (map có prefab ruong_lua, nhưng prefab không phải vật phẩm). Để NULL.

-- content.shop_product.store_sku
--   Mã SKU chỉ tồn tại sau khi đăng ký ở Google Play / App Store. Để NULL.

-- content.item.is_consumable / is_equippable / stack_max / shelf_life
--   Repo không có con số nào. Dùng mặc định của lược đồ.

-- content.crop
--   8 nông sản đã có, nhưng repo CHƯA có vật phẩm hạt giống nào mà
--   crop.seed_item_key là NOT NULL. Phải thêm 8 item hạt giống trước.
--   grow_seconds / yield cũng chưa ai quyết.

-- content.tranh_kieng_pattern
--   Scene TranhKiengMiniGame.unity đã tồn tại nhưng chưa có script minigame nào.

-- content.codex_entry
--   Nút sổ tay (hud_guidebook) đã có trong HUD nhưng chưa có màn hình lẫn nội dung.

-- admin.admin_user
--   Cố ý không seed. Tạo tài khoản quản trị đầu tiên bằng `npm run admin:create`
--   lúc triển khai, đừng để một dòng mặc định chạy được ở mọi môi trường.
-- =============================================================================
