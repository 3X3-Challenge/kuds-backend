/**
 * Smoke test đầu-cuối chạy trên server ĐANG CHẠY THẬT và DB thật.
 *
 *   npm run dev                                        # cửa sổ 1
 *   npm run admin:create -- smoke@kuds.test smoke-password-123 publisher
 *   npm run smoke                                      # cửa sổ 2
 *
 * Không phải unit test: nó gọi HTTP thật, ghi dữ liệu thật, và mỗi lần chạy đẻ
 * ra một bộ bản ghi mới có hậu tố ngẫu nhiên. Cố ý như vậy — thứ đáng kiểm nhất
 * ở backend này là các ràng buộc CHECK, khoá ngoại ghép và unique index bộ phận
 * của Postgres, mà không có cái nào tồn tại trong một bài test có DB giả.
 *
 * Dữ liệu để lại không được dọn: chúng là bản ghi ở trạng thái draft/archived,
 * vô hại với người chơi, và giữ lại thì lần chạy hỏng còn có cái để mổ xẻ.
 *
 * KHÔNG chạy trên production.
 */
const BASE = "http://127.0.0.1:3000";
let pass = 0, fail = 0;

async function call(method, path, { body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      // Cố ý LUÔN gắn content-type, kể cả khi không có thân: đó chính là cách
      // UnityWebRequest.Post cư xử, và là thứ addContentTypeParser phải chịu được.
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
}

const rnd = Math.random().toString(36).slice(2, 8);

// ---------- 1. Admin ----------
console.log("\n[1] Admin auth + content CRUD");
let r = await call("POST", "/admin/auth/login", { body: { email: "smoke@kuds.test", password: "smoke-password-123" } });
check("admin login", r.status === 200, r.data);
const adminToken = r.data?.token;

r = await call("GET", "/admin/content", { token: adminToken });
check("liệt kê loại nội dung (12)", r.status === 200 && r.data.length === 12, r.data);

// Vật phẩm có hạn sử dụng (cột interval)
const itemKey = `smoke_item_${rnd}`;
r = await call("POST", "/admin/content/items", {
  token: adminToken,
  body: {
    itemKey, displayName: "Dừa nước smoke", description: "test", category: "thuc_pham",
    grade: "thuong", stackMax: 99, isConsumable: true, shelfLifeSeconds: 3600,
    status: "published", sortOrder: 1,
  },
});
check("tạo item", r.status === 201, r.data);

// Vật phẩm trang bị (nested equipment_profile)
const gearKey = `smoke_gear_${rnd}`;
r = await call("POST", "/admin/content/items", {
  token: adminToken,
  body: {
    itemKey: gearKey, displayName: "Nón lá smoke", category: "trang_bi", status: "published",
    equip: { slot: "non", stats: { toc_do_thu_hoach: 1.15 } },
  },
});
check("tạo item trang bị (nested)", r.status === 201 && r.data?.equipmentProfile?.slot === "non", r.data);
check("isEquippable tự suy ra", r.data?.isEquippable === true, r.data);

// Hạt giống + cây trồng
const seedKey = `smoke_seed_${rnd}`;
r = await call("POST", "/admin/content/items", {
  token: adminToken,
  body: { itemKey: seedKey, displayName: "Hạt smoke", category: "dung_cu", status: "published" },
});
check("tạo hạt giống", r.status === 201, r.data);

const cropKey = `smoke_crop_${rnd}`;
r = await call("POST", "/admin/content/crops", {
  token: adminToken,
  body: { cropKey, seedItemKey: seedKey, harvestItemKey: itemKey, growSeconds: 1, waterStages: 1, yieldMin: 2, yieldMax: 2 },
});
check("tạo cây trồng", r.status === 201, r.data);

// XOR của reward_line
r = await call("POST", "/admin/content/reward-bundles", {
  token: adminToken,
  body: { bundleKey: `bad_${rnd}`, lines: [{ currency: "hoa_sen", itemKey: itemKey, amount: 1 }] },
});
check("reward line vừa tiền vừa đồ bị chặn (400)", r.status === 400, r.data);

const bundleKey = `smoke_bundle_${rnd}`;
r = await call("POST", "/admin/content/reward-bundles", {
  token: adminToken,
  body: {
    bundleKey, note: "smoke",
    lines: [{ currency: "long_den", amount: 500 }, { itemKey, amount: 3 }],
  },
});
check("tạo gói thưởng 2 dòng", r.status === 201 && r.data?.lines?.length === 2, r.data);

// NPC + nhiệm vụ có mục tiêu
const npcKey = `smoke_npc_${rnd}`;
r = await call("POST", "/admin/content/npcs", { token: adminToken, body: { npcKey, displayName: "Chú Tư smoke" } });
check("tạo NPC", r.status === 201, r.data);

const questKey = `smoke_quest_${rnd}`;
r = await call("POST", "/admin/content/quests", {
  token: adminToken,
  body: {
    questKey, title: "Thu thập dừa nước", summary: "Mang về cho chú Tư", chapter: 1,
    bundleKey, status: "published", sortOrder: 1,
    objectives: [
      { kind: "thu_thap", targetKey: itemKey, targetCount: 3 },
      { kind: "noi_chuyen_npc", targetKey: npcKey, targetCount: 1 },
    ],
  },
});
check("tạo nhiệm vụ 2 mục tiêu", r.status === 201 && r.data?.objectives?.length === 2, r.data);

// Thành tựu (target_count bigint)
const achKey = `smoke_ach_${rnd}`;
r = await call("POST", "/admin/content/achievements", {
  token: adminToken,
  body: { achievementKey: achKey, title: "Tiêu 700k", description: "x", kind: "tieu_tien", targetCount: 700000, bundleKey, status: "published" },
});
check("tạo thành tựu (bigint)", r.status === 201, r.data);

// Gacha
const gachaKey = `smoke_gacha_${rnd}`;
r = await call("POST", "/admin/content/gacha-items", {
  token: adminToken,
  body: { gachaItemKey: gachaKey, displayName: "Trang phục smoke", subtitle: "Trang phục cực phẩm", description: "x", rarity: 5, grantsItemKey: itemKey },
});
check("tạo vật phẩm gacha", r.status === 201, r.data);

const bannerKey = `smoke_banner_${rnd}`;
r = await call("POST", "/admin/content/banners", {
  token: adminToken,
  body: {
    bannerKey, displayName: "Banner smoke", status: "published", costCurrency: "long_den",
    costAmount: 100, pity5Star: 90, pity4Star: 10,
    opensAt: new Date(Date.now() - 3600_000).toISOString(), closesAt: null,
    entries: [{ gachaItemKey: gachaKey, weight: 100, isFeatured: true }],
  },
});
check("tạo banner", r.status === 201 && r.data?.entries?.length === 1, r.data);

// Gói cửa hàng: XOR tiền thật / tiền game
r = await call("POST", "/admin/content/shop-products", {
  token: adminToken,
  body: { productKey: `bad_${rnd}`, tab: "nap", priceVnd: 7000, priceCurrency: "hoa_sen", priceAmount: 100, bundleKey },
});
check("gói vừa tiền thật vừa tiền game bị chặn (400)", r.status === 400, r.data);

r = await call("POST", "/admin/content/shop-products", {
  token: adminToken,
  body: { productKey: `smoke_shop_${rnd}`, tab: "nap", displayName: "x15", priceVnd: 7000, bundleKey, status: "published" },
});
check("tạo gói nạp", r.status === 201, r.data);

// Mẫu thư (cột interval ttl)
const templateKey = `smoke_mail_${rnd}`;
r = await call("POST", "/admin/content/mail-templates", {
  token: adminToken,
  body: { templateKey, title: "[Thư cá nhân] Chào {player_name}", sender: "Ban Quản Trị", body: "Xin chào {player_name}", bundleKey, ttlSeconds: 604800, status: "published" },
});
check("tạo mẫu thư", r.status === 201, r.data);

// Sổ tay
r = await call("POST", "/admin/content/codex-entries", {
  token: adminToken,
  body: { entryKey: `smoke_codex_${rnd}`, title: "Tranh kiếng", body: "...", category: "tranh_kieng", status: "published" },
});
check("tạo mục sổ tay", r.status === 201, r.data);
const codexKey = r.data?.entryKey;

// Sửa + nhật ký
r = await call("PATCH", `/admin/content/items/${itemKey}`, { token: adminToken, body: { displayName: "Dừa nước (đã sửa)" } });
check("sửa item", r.status === 200 && r.data?.displayName === "Dừa nước (đã sửa)", r.data);

r = await call("GET", `/admin/audit?tableName=content.item&rowKey=${itemKey}`, { token: adminToken });
check("nhật ký ghi cả insert lẫn update", r.status === 200 && r.data.items.length >= 2, r.data);
check("nhật ký có before/after", r.data?.items?.[0]?.before !== null && r.data?.items?.[0]?.after !== null, r.data?.items?.[0]);

// ---------- 2. Xuất bản ----------
console.log("\n[2] Kiểm tra trước khi xuất bản + xuất bản");
r = await call("GET", "/admin/publish/preflight", { token: adminToken });
check("preflight chạy", r.status === 200 && Array.isArray(r.data.errors), r.data);
const preErrors = r.data.errors.length;

r = await call("GET", "/admin/publish/state", { token: adminToken });
const beforeVersion = r.data?.version;

r = await call("POST", "/admin/publish", { token: adminToken, body: { force: true, note: "smoke test" } });
check("xuất bản (force)", r.status === 200, r.data);
check("version tăng", Number(r.data?.version) === Number(beforeVersion) + 1, { beforeVersion, after: r.data?.version });
const version = r.data?.version;

// ---------- 3. Catalog ----------
console.log("\n[3] Catalog cho game");
r = await call("GET", "/content/catalog");
check("catalog trả 200", r.status === 200, r.status);
check("catalog có item vừa tạo", r.data?.items?.some((i) => i.itemKey === itemKey), r.data?.items?.length);
const smokeItem = r.data?.items?.find((i) => i.itemKey === itemKey);
check("shelfLifeSeconds đọc được từ cột interval", smokeItem?.shelfLifeSeconds === 3600, smokeItem);
const smokeGear = r.data?.items?.find((i) => i.itemKey === gearKey);
check("equip profile trong catalog", smokeGear?.equip?.slot === "non", smokeGear);
const smokeQuest = r.data?.quests?.find((q) => q.questKey === questKey);
check("quest kèm objectives + rewards bung phẳng", smokeQuest?.objectives?.length === 2 && smokeQuest?.rewards?.length === 2, smokeQuest);
const smokeTemplate = r.data?.mailTemplates?.find((m) => m.templateKey === templateKey);
check("ttlSeconds đọc được từ cột interval", smokeTemplate?.ttlSeconds === 604800, smokeTemplate);
check("catalog KHÔNG lộ bundleId", JSON.stringify(r.data).includes('"bundleId"') === false);

r = await call("GET", `/content/catalog?version=${version}`);
check("version khớp ⇒ 304", r.status === 304, r.status);

// ---------- 4. Auth người chơi ----------
console.log("\n[4] Auth người chơi trên game.*");
const username = `smoke_${rnd}`;
r = await call("POST", "/auth/register", { body: { username, password: "smoke-password-123" } });
check("đăng ký", r.status === 201, r.data);
check("trả recoveryCode một lần", typeof r.data?.recoveryCode === "string", r.data);
check("uid 12 số", /^\d{12}$/.test(r.data?.player?.uid ?? ""), r.data?.player);
let token = r.data?.accessToken;
const playerId = r.data?.player?.playerId;
const refreshToken = r.data?.refreshToken;

r = await call("POST", "/auth/register", { body: { username, password: "smoke-password-123" } });
check("đăng ký trùng username ⇒ 409", r.status === 409, r.data);

r = await call("POST", "/auth/login", { body: { username: username.toUpperCase(), password: "smoke-password-123" } });
check("đăng nhập KHÔNG phân biệt hoa thường", r.status === 200, r.data);

r = await call("POST", "/auth/refresh", { body: { refreshToken } });
check("refresh xoay token", r.status === 200 && r.data.accessToken, r.data);
token = r.data.accessToken;

r = await call("GET", "/auth/me", { token });
check("/auth/me", r.status === 200 && r.data.playerId === playerId, r.data);

r = await call("GET", "/me/state");
check("thiếu token ⇒ 401", r.status === 401, r.data);

// ---------- 5. Trạng thái + ví ----------
console.log("\n[5] Trạng thái người chơi");
r = await call("GET", "/me/state", { token });
check("/me/state", r.status === 200, r.data);
check("trigger seed_wallet tạo sẵn 2 ví", r.data?.wallets?.length === 2, r.data?.wallets);
check("ví bắt đầu từ 0", r.data?.wallets?.every((w) => w.balance === 0), r.data?.wallets);

r = await call("PUT", "/me/save", { token, body: { sceneName: "MainScene", posX: 1.5, posY: 0, posZ: -3.25, yaw: 725, dayTime: 13.5 } });
check("lưu điểm chơi", r.status === 200, r.data);
check("yaw chuẩn hoá về [0,360)", Math.abs(r.data?.yaw - 5) < 0.01, r.data?.yaw);

// ---------- 6. Kinh tế: GM cấp tiền + đồ ----------
console.log("\n[6] GM cấp tiền / vật phẩm (đi qua sổ cái)");
r = await call("POST", `/admin/players/${playerId}/currency`, { token: adminToken, body: { currency: "long_den", delta: 1000, reason: "smoke test" } });
check("GM cộng 1000 lồng đèn", r.status === 200 && r.data.balance === 1000, r.data);

r = await call("POST", `/admin/players/${playerId}/currency`, { token: adminToken, body: { currency: "long_den", delta: -999999, reason: "quá tay" } });
check("trừ quá số dư bị chặn (422)", r.status === 422, r.data);

r = await call("GET", "/me/ledger", { token });
check("sổ cái ghi lại giao dịch GM", r.status === 200 && r.data.entries.length === 1 && r.data.entries[0].reason === "gm_dieu_chinh", r.data);
check("balanceAfter khớp", r.data?.entries?.[0]?.balanceAfter === 1000, r.data?.entries?.[0]);

r = await call("POST", `/admin/players/${playerId}/items`, { token: adminToken, body: { itemKey: seedKey, quantity: 5 } });
check("GM cấp 5 hạt giống", r.status === 200 && r.data.quantity === 5, r.data);

r = await call("POST", `/admin/players/${playerId}/items`, { token: adminToken, body: { itemKey: gearKey, quantity: 1 } });
check("GM cấp nón lá", r.status === 200, r.data);

// ---------- 7. Túi đồ + trang bị ----------
console.log("\n[7] Túi đồ & trang bị");
r = await call("GET", "/me/inventory", { token });
check("túi đồ có 2 loại", r.status === 200 && r.data.length === 2, r.data);

r = await call("PUT", "/me/equipment/non", { token, body: { itemKey: gearKey } });
check("mặc nón lá vào ô non", r.status === 200, r.data);

r = await call("PUT", "/me/equipment/ao", { token, body: { itemKey: gearKey } });
check("mặc nón vào ô áo bị chặn (422)", r.status === 422, r.data);

r = await call("PUT", "/me/equipment/non", { token, body: { itemKey: seedKey } });
check("mặc đồ không mặc được bị chặn (422)", r.status === 422, r.data);

r = await call("DELETE", "/me/equipment/non", { token });
check("cởi trang bị", r.status === 200, r.data);

// ---------- 8. Nông trại ----------
console.log("\n[8] Nông trại");
r = await call("POST", "/me/farm/0/plant", { token, body: { cropKey } });
check("gieo hạt", r.status === 200 && r.data.cropKey === cropKey, r.data);

r = await call("POST", "/me/farm/0/plant", { token, body: { cropKey } });
check("gieo vào ô đã có cây ⇒ 409", r.status === 409, r.data);

r = await call("POST", "/me/farm/0/harvest", { token });
check("thu hoạch khi chưa tưới ⇒ 422", r.status === 422, r.data);

r = await call("POST", "/me/farm/0/water", { token });
check("tưới nước", r.status === 200 && r.data.waterCount === 1, r.data);

r = await call("POST", "/me/farm/0/water", { token });
check("tưới quá số lần ⇒ 409", r.status === 409, r.data);

await new Promise((res) => setTimeout(res, 1200));
r = await call("POST", "/me/farm/0/harvest", { token });
check("thu hoạch", r.status === 200 && r.data.amount === 2, r.data);

r = await call("POST", "/me/farm/0/harvest", { token });
check("thu hoạch lại ⇒ 422 (ô trống)", r.status === 422, r.data);

// ---------- 9. Nhiệm vụ ----------
console.log("\n[9] Nhiệm vụ");
r = await call("GET", "/me/quests", { token });
check("nhiệm vụ khả dụng có quest vừa tạo", r.data?.availableQuestKeys?.includes(questKey), r.data);

r = await call("POST", `/me/quests/${questKey}/claim`, { token });
check("nhận thưởng khi chưa nhận nhiệm vụ ⇒ 404", r.status === 404, r.data);

r = await call("POST", `/me/quests/${questKey}/accept`, { token });
check("nhận nhiệm vụ", r.status === 201 && r.data.objectives.length === 2, r.data);

r = await call("POST", `/me/quests/${questKey}/accept`, { token });
check("nhận lại ⇒ 409", r.status === 409, r.data);

r = await call("POST", `/me/quests/${questKey}/progress`, { token, body: { objectives: [{ ordinal: 0, delta: 99 }] } });
check("tiến độ bị chặn trên ở targetCount", r.data?.objectives?.[0]?.progress === 3, r.data);
check("còn mục tiêu chưa xong ⇒ vẫn đang làm", r.data?.status === "dang_lam", r.data);

r = await call("POST", `/me/quests/${questKey}/progress`, { token, body: { objectives: [{ ordinal: 5, delta: 1 }] } });
check("ordinal không tồn tại ⇒ 422", r.status === 422, r.data);

r = await call("POST", `/me/quests/${questKey}/progress`, { token, body: { objectives: [{ ordinal: 1, delta: 1 }] } });
check("đủ mục tiêu ⇒ tự chuyển hoàn thành", r.data?.status === "hoan_thanh", r.data);

r = await call("POST", `/me/quests/${questKey}/claim`, { token });
check("nhận thưởng nhiệm vụ", r.status === 200 && r.data.rewards.length === 2, r.data);
const questReward = r.data?.rewards?.find((x) => x.currency === "long_den");
check("cộng 500 lồng đèn ⇒ số dư 1500", questReward?.after === 1500, r.data?.rewards);

r = await call("POST", `/me/quests/${questKey}/claim`, { token });
check("nhận thưởng lần hai ⇒ 409", r.status === 409, r.data);

// ---------- 10. Thành tựu ----------
console.log("\n[10] Thành tựu");
r = await call("POST", `/me/achievements/${achKey}/claim`, { token });
check("nhận thưởng khi chưa có tiến độ ⇒ 404", r.status === 404, r.data);

r = await call("POST", `/me/achievements/${achKey}/progress`, { token, body: { delta: 100 } });
check("tạo tiến độ ở lần báo đầu tiên", r.status === 200 && r.data.progress === 100, r.data);
check("chưa đủ ⇒ chưa mở khoá", r.data?.unlockedAt === null, r.data);

r = await call("POST", `/me/achievements/${achKey}/claim`, { token });
check("chưa mở khoá ⇒ 422", r.status === 422, r.data);

r = await call("POST", `/me/achievements/${achKey}/progress`, { token, body: { delta: 999999999 } });
check("chặn trên ở targetCount 700000", r.data?.progress === 700000, r.data);
check("đủ mốc ⇒ mở khoá", r.data?.unlockedAt !== null, r.data);

r = await call("POST", `/me/achievements/${achKey}/claim`, { token });
check("nhận thưởng thành tựu", r.status === 200 && r.data.rewards.length === 2, r.data);

r = await call("POST", `/me/achievements/${achKey}/claim`, { token });
check("nhận lần hai ⇒ 409", r.status === 409, r.data);

// ---------- 11. Thư ----------
console.log("\n[11] Hòm thư");
const mailBundleKey = `smoke_mailbundle_${rnd}`;
r = await call("POST", "/admin/content/reward-bundles", {
  token: adminToken,
  body: { bundleKey: mailBundleKey, lines: [{ currency: "hoa_sen", amount: 250 }] },
});
check("tạo gói thưởng cho thư", r.status === 201, r.data);

r = await call("POST", "/admin/players/mail", {
  token: adminToken,
  body: { playerIds: [playerId], title: "Quà smoke", body: "Chào {player_name}", bundleKey: mailBundleKey, expiresInDays: 7 },
});
check("GM gửi thư", r.status === 200 && r.data.sentCount === 1, r.data);

r = await call("POST", "/admin/players/mail", {
  token: adminToken,
  body: { playerIds: [playerId], title: "x", bundleKey: `khong_ton_tai_${rnd}` },
});
check("gói thưởng không tồn tại ⇒ 404", r.status === 404, r.data);

r = await call("GET", "/me/mails", { token });
check("hòm thư có 1 thư", r.status === 200 && r.data.items.length === 1, r.data);
const mailId = r.data?.items?.[0]?.mailId;
check("mailId là chuỗi (bigint)", typeof mailId === "string", mailId);
check("rewards đọc từ bản chụp", r.data?.items?.[0]?.rewards?.[0]?.currency === "hoa_sen", r.data?.items?.[0]);

r = await call("POST", `/me/mails/${mailId}/read`, { token });
check("đánh dấu đã đọc", r.status === 200, r.data);

r = await call("POST", `/me/mails/${mailId}/claim`, { token });
check("nhận thưởng thư", r.status === 200 && r.data.rewards[0].after === 250, r.data);

r = await call("POST", `/me/mails/${mailId}/claim`, { token });
check("nhận thư lần hai ⇒ 409", r.status === 409, r.data);

r = await call("DELETE", `/me/mails/${mailId}`, { token });
check("xoá mềm thư", r.status === 200, r.data);

// ---------- 12. Gacha ----------
console.log("");
console.log("[12] Gacha");
// Số dư đến đây là tổng của nhiều nguồn (GM + thưởng nhiệm vụ + thưởng thành tựu,
// mà nhiệm vụ và thành tựu dùng CHUNG một gói thưởng). Đọc số thật thay vì cộng
// nhẩm — cộng nhẩm là cách chắc chắn để test hỏng mỗi lần đổi dữ liệu mẫu.
r = await call("GET", "/me/wallet", { token });
const beforePull = r.data.find((w) => w.currency === "long_den").balance;
const pullCost = 10 * 100;
check("có đủ tiền để quay 10 lần", beforePull >= pullCost, r.data);

const idem = `smoke-${rnd}-pull1`;
r = await call("POST", `/gacha/${bannerKey}/pull`, { token, body: { count: 10, idempotencyKey: idem } });
check("quay 10 lần", r.status === 200 && r.data.results.length === 10, r.data);
check("trừ đúng 1000 lồng đèn", r.data?.balanceAfter === beforePull - pullCost, { beforePull, after: r.data?.balanceAfter });
check("bộ đếm pity cập nhật", r.data?.pityState?.pullsTotal === 10, r.data?.pityState);

r = await call("POST", `/gacha/${bannerKey}/pull`, { token, body: { count: 10, idempotencyKey: idem } });
check("gửi lại cùng idempotencyKey ⇒ phát lại, KHÔNG trừ tiền", r.status === 200 && r.data.replayed === true, r.data);

r = await call("GET", "/me/wallet", { token });
const afterReplay = r.data.find((w) => w.currency === "long_den").balance;
check("số dư không bị trừ hai lần", afterReplay === beforePull - pullCost, { beforePull, afterReplay });

// Rút cạn ví để kiểm nhánh không đủ tiền.
r = await call("POST", `/admin/players/${playerId}/currency`, {
  token: adminToken,
  body: { currency: "long_den", delta: -afterReplay, reason: "dọn ví cho smoke test" },
});
check("GM rút cạn ví", r.status === 200 && r.data.balance === 0, r.data);

r = await call("POST", `/gacha/${bannerKey}/pull`, { token, body: { count: 10, idempotencyKey: `smoke-${rnd}-pull2` } });
check("không đủ tiền ⇒ 422", r.status === 422, r.data);

r = await call("GET", "/me/gacha/history", { token });
check("lịch sử đúng 10 dòng (lần quay hỏng không ghi gì)", r.status === 200 && r.data.items.length === 10, r.data?.items?.length);

r = await call("GET", "/me/inventory", { token });
const gachaGrant = r.data?.find((i) => i.itemKey === itemKey);
check("gacha cộng vật phẩm vào túi", gachaGrant && gachaGrant.quantity >= 10, gachaGrant);
// ---------- 13. Sổ tay + tranh kiếng ----------
console.log("\n[13] Sổ tay & tranh kiếng");
r = await call("POST", `/me/codex/${codexKey}/unlock`, { token });
check("mở khoá sổ tay", r.status === 200 && r.data.isNew === true, r.data);

r = await call("POST", `/me/codex/${codexKey}/unlock`, { token });
check("mở lại ⇒ isNew false, không lỗi", r.status === 200 && r.data.isNew === false, r.data);

const patternKey = `smoke_pattern_${rnd}`;
r = await call("POST", "/admin/content/patterns", { token: adminToken, body: { patternKey, displayName: "Mẫu smoke", difficulty: 2 } });
check("tạo mẫu tranh", r.status === 201, r.data);

r = await call("POST", "/me/artworks", { token, body: { patternKey, score: 95 } });
check("nộp tranh 95 điểm ⇒ 3 sao (server tự tính)", r.status === 201 && r.data.stars === 3, r.data);

r = await call("POST", "/me/artworks", { token, body: { patternKey, score: 55, stars: 3 } });
check("client gửi stars bị bỏ qua ⇒ 55 điểm = 1 sao", r.data?.stars === 1, r.data);

r = await call("GET", "/me/artworks/best", { token });
check("điểm cao nhất theo mẫu", r.data?.[0]?.bestScore === 95, r.data);

// ---------- 14. Phân quyền ----------
console.log("\n[14] Phân quyền admin");
r = await call("POST", "/admin/admins", { token: adminToken, body: { email: `viewer_${rnd}@kuds.test`, password: "viewer-password-1", role: "viewer" } });
check("tạo tài khoản viewer", r.status === 201, r.data);

r = await call("POST", "/admin/auth/login", { body: { email: `VIEWER_${rnd}@kuds.test`, password: "viewer-password-1" } });
check("đăng nhập admin không phân biệt hoa thường", r.status === 200, r.data);
const viewerToken = r.data?.token;

r = await call("GET", "/admin/content/items", { token: viewerToken });
check("viewer đọc được", r.status === 200, r.status);

r = await call("POST", "/admin/content/npcs", { token: viewerToken, body: { npcKey: `x_${rnd}`, displayName: "x" } });
check("viewer ghi bị chặn ⇒ 403", r.status === 403, r.data);

r = await call("POST", "/admin/publish", { token: viewerToken, body: {} });
check("viewer xuất bản bị chặn ⇒ 403", r.status === 403, r.data);

r = await call("GET", "/admin/content/items", { token });
check("token người chơi không mở được cửa admin ⇒ 401", r.status === 401, r.data);

r = await call("GET", "/me/state", { token: adminToken });
check("token admin không mở được cửa người chơi ⇒ 401", r.status === 401, r.data);

// ---------- 15. Cấm tài khoản ----------
console.log("\n[15] Cấm tài khoản");
r = await call("POST", `/admin/players/${playerId}/ban`, { token: adminToken, body: { bannedUntil: null, reason: "smoke test" } });
check("cấm vĩnh viễn", r.status === 200 && r.data.status === "banned", r.data);

r = await call("POST", "/auth/login", { body: { username, password: "smoke-password-123" } });
check("tài khoản bị cấm không đăng nhập được ⇒ 403", r.status === 403, r.data);

r = await call("POST", `/admin/players/${playerId}/unban`, { token: adminToken, body: { reason: "xong smoke test" } });
check("gỡ cấm", r.status === 200 && r.data.status === "active" && r.data.bannedUntil === null, r.data);

r = await call("POST", "/auth/login", { body: { username, password: "smoke-password-123" } });
check("gỡ cấm xong đăng nhập lại được", r.status === 200, r.data);

// ---------- 16. Lưu trữ ----------
console.log("\n[16] Lưu trữ (nút xoá)");
r = await call("DELETE", `/admin/content/items/${itemKey}`, { token: adminToken });
check("item đang trong túi ⇒ archived, không xoá", r.status === 200 && r.data.archived === true && r.data.deleted === false, r.data);

r = await call("DELETE", `/admin/content/crops/${cropKey}`, { token: adminToken });
check("crop (không có status) ⇒ xoá thật", r.status === 200 && r.data.deleted === true, r.data);

r = await call("DELETE", `/admin/content/npcs/${npcKey}`, { token: adminToken });
check("npc ⇒ xoá thật", r.status === 200 && r.data.deleted === true, r.data);

r = await call("GET", "/admin/dashboard", { token: adminToken });
check("dashboard", r.status === 200 && typeof r.data.counts.players === "number", r.data);

console.log(`\n===== ${pass} qua / ${fail} hỏng =====`);
if (preErrors > 0) console.log(`(preflight tìm thấy ${preErrors} lỗi nội dung trước khi xuất bản — xem mục 2)`);
process.exit(fail > 0 ? 1 : 0);
