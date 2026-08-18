/**
 * Dọn dữ liệu do smoke test để lại.
 *
 *   npm run cleanup:smoke          # chỉ ĐẾM, không xoá gì — chạy cái này trước
 *   npm run cleanup:smoke -- --apply   # xoá thật
 *
 * scripts/smoke-test.mjs cố ý không dọn sau khi chạy (xem chú thích đầu file đó):
 * mỗi lần chạy đẻ ra một bộ bản ghi mang hậu tố ngẫu nhiên, tên đều bắt đầu bằng
 * "smoke_". Chúng vô hại với người chơi vì /content/* chỉ trả bản published, nhưng
 * nằm lẫn trong trang quản trị thì không phân biệt được với nội dung thật.
 *
 * Kịch bản này CHỈ đụng vào thứ mang tiền tố "smoke_" (và hai email quản trị mà
 * smoke test dùng). Không có tham số nào để nới phạm vi đó ra — muốn xoá thứ khác
 * thì làm bằng tay, đừng sửa file này thành dao mổ vạn năng.
 *
 * Thứ tự xoá bám theo khoá ngoại, không dựa vào ON DELETE CASCADE ở những chỗ
 * lược đồ cố ý KHÔNG cascade (reward_line → item, banner_entry → gacha_item,
 * shop_product → reward_bundle...).
 */
import "./small-pool";
import { prisma } from "../core/database/prisma";

/**
 * --apply, KHÔNG phải --yes. Trên Windows, `npm run x -- --yes` không bao giờ tới
 * được script: "yes" là một khoá cấu hình của chính npm nên shim npm.cmd lọc nó
 * ra. Cùng một lệnh chạy ở Git Bash thì lọt, ở PowerShell thì không — và script
 * lặng lẽ chạy chế độ thử, nhìn y hệt "chạy xong mà chẳng làm gì".
 * Vẫn nhận --yes cho ai quen tay, nhưng --apply mới là đường chắc chắn.
 */
const APPLY = process.argv.includes("--apply") || process.argv.includes("--yes");

/** Tài khoản quản trị do smoke test tạo: một cố định, một sinh ngẫu nhiên. */
const ADMIN_WHERE = `(email = 'smoke@kuds.test' OR (starts_with(email, 'viewer_') AND email LIKE '%@kuds.test'))`;

/** account_id của mọi tài khoản người chơi đăng ký bằng username "smoke_...". */
const SMOKE_ACCOUNTS = `
  SELECT account_id FROM game.auth_identity
   WHERE provider = 'username' AND starts_with(subject, 'smoke_')`;

const SMOKE_ADMINS = `SELECT admin_id FROM admin.admin_user WHERE ${ADMIN_WHERE}`;

interface Step {
  label: string;
  count: string;
  run: string;
}

/**
 * Thứ tự trong mảng NÀY chính là thứ tự xoá. Đọc từ trên xuống:
 * người chơi trước (cascade sạch mọi bảng game.*), rồi tới nội dung theo chiều
 * phụ thuộc ngược, cuối cùng mới tới tài khoản quản trị.
 */
const STEPS: Step[] = [
  // --- Người chơi ---------------------------------------------------------
  // Xoá account là cascade hết: auth_identity, auth_credential, session, player,
  // và từ player cascade tiếp sang inventory, wallet, mail, gacha_pull, quest,
  // achievement, farm_plot, artwork, codex_unlock...
  {
    label: "Tài khoản người chơi smoke_* (cascade toàn bộ bảng game.*)",
    count: `SELECT count(*)::int FROM game.account WHERE account_id IN (${SMOKE_ACCOUNTS})`,
    run: `DELETE FROM game.account WHERE account_id IN (${SMOKE_ACCOUNTS})`,
  },

  // --- Nội dung -----------------------------------------------------------
  // reward_line trỏ tới item KHÔNG cascade, nên phải dọn trước khi xoá item.
  {
    label: "content.reward_line trỏ tới vật phẩm smoke",
    count: `SELECT count(*)::int FROM content.reward_line WHERE starts_with(item_key, 'smoke_')`,
    run: `DELETE FROM content.reward_line WHERE starts_with(item_key, 'smoke_')`,
  },
  // banner_entry trỏ tới gacha_item cũng KHÔNG cascade.
  {
    label: "content.banner_entry trỏ tới vật phẩm gacha smoke",
    count: `SELECT count(*)::int FROM content.banner_entry WHERE starts_with(gacha_item_key, 'smoke_')`,
    run: `DELETE FROM content.banner_entry WHERE starts_with(gacha_item_key, 'smoke_')`,
  },
  {
    label: "content.banner (cascade banner_entry)",
    count: `SELECT count(*)::int FROM content.banner WHERE starts_with(banner_key, 'smoke_')`,
    run: `DELETE FROM content.banner WHERE starts_with(banner_key, 'smoke_')`,
  },
  {
    label: "content.gacha_item",
    count: `SELECT count(*)::int FROM content.gacha_item WHERE starts_with(gacha_item_key, 'smoke_')`,
    run: `DELETE FROM content.gacha_item WHERE starts_with(gacha_item_key, 'smoke_')`,
  },
  {
    label: "content.shop_product",
    count: `SELECT count(*)::int FROM content.shop_product WHERE starts_with(product_key, 'smoke_')`,
    run: `DELETE FROM content.shop_product WHERE starts_with(product_key, 'smoke_')`,
  },
  {
    label: "content.quest (cascade quest_objective)",
    count: `SELECT count(*)::int FROM content.quest WHERE starts_with(quest_key, 'smoke_')`,
    run: `DELETE FROM content.quest WHERE starts_with(quest_key, 'smoke_')`,
  },
  {
    label: "content.achievement",
    count: `SELECT count(*)::int FROM content.achievement WHERE starts_with(achievement_key, 'smoke_')`,
    run: `DELETE FROM content.achievement WHERE starts_with(achievement_key, 'smoke_')`,
  },
  {
    label: "content.mail_template",
    count: `SELECT count(*)::int FROM content.mail_template WHERE starts_with(template_key, 'smoke_')`,
    run: `DELETE FROM content.mail_template WHERE starts_with(template_key, 'smoke_')`,
  },
  {
    label: "content.codex_entry",
    count: `SELECT count(*)::int FROM content.codex_entry WHERE starts_with(entry_key, 'smoke_')`,
    run: `DELETE FROM content.codex_entry WHERE starts_with(entry_key, 'smoke_')`,
  },
  {
    label: "content.tranh_kieng_pattern",
    count: `SELECT count(*)::int FROM content.tranh_kieng_pattern WHERE starts_with(pattern_key, 'smoke_')`,
    run: `DELETE FROM content.tranh_kieng_pattern WHERE starts_with(pattern_key, 'smoke_')`,
  },
  // crop trỏ tới item (hạt giống + nông sản), phải đi trước item.
  {
    label: "content.crop",
    count: `SELECT count(*)::int FROM content.crop WHERE starts_with(crop_key, 'smoke_')`,
    run: `DELETE FROM content.crop WHERE starts_with(crop_key, 'smoke_')`,
  },
  {
    label: "content.item (cascade equipment_profile)",
    count: `SELECT count(*)::int FROM content.item WHERE starts_with(item_key, 'smoke_')`,
    run: `DELETE FROM content.item WHERE starts_with(item_key, 'smoke_')`,
  },
  // reward_bundle đi SAU quest/achievement/mail_template/shop_product vì bốn bảng
  // đó trỏ tới nó bằng bundle_id.
  {
    label: "content.reward_bundle (cascade reward_line)",
    count: `SELECT count(*)::int FROM content.reward_bundle WHERE starts_with(bundle_key, 'smoke_')`,
    run: `DELETE FROM content.reward_bundle WHERE starts_with(bundle_key, 'smoke_')`,
  },
  {
    label: "content.npc",
    count: `SELECT count(*)::int FROM content.npc WHERE starts_with(npc_key, 'smoke_')`,
    run: `DELETE FROM content.npc WHERE starts_with(npc_key, 'smoke_')`,
  },

  // --- Quản trị -----------------------------------------------------------
  // config_state.published_by trỏ tới admin_user và KHÔNG cascade: gỡ liên kết
  // trước, nếu không lần xuất bản cuối do smoke thực hiện sẽ chặn việc xoá.
  {
    label: "content.config_state.published_by trỏ tới admin smoke ⇒ gỡ về NULL",
    count: `SELECT count(*)::int FROM content.config_state WHERE published_by IN (${SMOKE_ADMINS})`,
    run: `UPDATE content.config_state SET published_by = NULL WHERE published_by IN (${SMOKE_ADMINS})`,
  },
  {
    label: "admin.audit_log của admin smoke, hoặc ghi về bản ghi smoke_*",
    count: `SELECT count(*)::int FROM admin.audit_log WHERE admin_id IN (${SMOKE_ADMINS}) OR starts_with(row_key, 'smoke_')`,
    run: `DELETE FROM admin.audit_log WHERE admin_id IN (${SMOKE_ADMINS}) OR starts_with(row_key, 'smoke_')`,
  },
  {
    label: "admin.admin_user (smoke@kuds.test + viewer_*@kuds.test)",
    count: `SELECT count(*)::int FROM admin.admin_user WHERE ${ADMIN_WHERE}`,
    run: `DELETE FROM admin.admin_user WHERE ${ADMIN_WHERE}`,
  },
];

async function scalar(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(sql);
  return rows[0]?.count ?? 0;
}

async function main() {
  // Chốt chặn: đơn hàng là hồ sơ tài chính, game.purchase_order cố ý dùng
  // ON DELETE RESTRICT để không ai xoá nhân vật kèm luôn lịch sử trả tiền.
  // Smoke test hiện không tạo đơn nào; nếu có thì dừng lại chứ không tự quyết.
  const orders = await scalar(`
    SELECT count(*)::int FROM game.purchase_order
     WHERE player_id IN (SELECT player_id FROM game.player
                          WHERE account_id IN (${SMOKE_ACCOUNTS}))`);

  if (orders > 0) {
    console.error(
      `DỪNG: có ${orders} đơn hàng gắn với tài khoản smoke. Đó là hồ sơ tài chính,\n` +
        "kịch bản này không tự xoá. Xử lý thủ công rồi chạy lại.",
    );
    process.exit(1);
  }

  console.log(APPLY ? "CHẾ ĐỘ XOÁ THẬT\n" : "CHẾ ĐỘ THỬ — chỉ đếm, không xoá gì\n");

  const counts: number[] = [];
  let total = 0;
  for (const step of STEPS) {
    const n = await scalar(step.count);
    counts.push(n);
    total += n;
    console.log(`${String(n).padStart(5)}  ${step.label}`);
  }

  console.log(`${"".padStart(5, "-")}  ${"".padEnd(60, "-")}`);
  console.log(`${String(total).padStart(5)}  dòng khớp tiền tố smoke_\n`);

  if (total === 0) {
    console.log("Không có gì để dọn.");
    return;
  }

  if (!APPLY) {
    console.log("Xoá thật:  npm run cleanup:smoke -- --apply");
    return;
  }

  // Một transaction cho toàn bộ: hỏng ở bước nào là rollback sạch, không để lại
  // trạng thái nửa vời với khoá ngoại gãy.
  //
  // maxWait/timeout để rộng tay: DB là Supabase ở Singapore đi qua session pooler,
  // 18 câu lệnh nối tiếp nhau mỗi câu cõng một vòng mạng. Mặc định của Prisma là
  // maxWait 2s / timeout 5s — thừa sức hết giờ ở đây, và khi hết giờ thì rollback
  // nên nhìn bên ngoài y hệt "chạy xong mà không xoá gì".
  console.log("Đang xoá, chờ chút...\n");
  const deleted = await prisma.$transaction(
    async (tx) => {
      const out: number[] = [];
      for (const [i, step] of STEPS.entries()) {
        // In từng bước để lần sau hỏng còn biết chết ở đâu.
        process.stdout.write(`  [${i + 1}/${STEPS.length}] ${step.label}... `);
        const n = await tx.$executeRawUnsafe(step.run);
        console.log(`${n} dòng`);
        out.push(n);
      }
      return out;
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
  console.log();

  console.log("Đã xoá:");
  STEPS.forEach((step, i) => {
    if (deleted[i] > 0) console.log(`${String(deleted[i]).padStart(5)}  ${step.label}`);
  });
  console.log(`\nTổng ${deleted.reduce((a, b) => a + b, 0)} dòng.`);
}

main()
  .catch((err) => {
    console.error("\nHỎNG — đã rollback, DB giữ nguyên như trước khi chạy:\n");
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
