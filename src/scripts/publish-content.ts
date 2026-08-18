/**
 * Phát hành nội dung: đổi mọi dòng draft sang published, rồi tăng version.
 *
 *   npm run publish:content                      # chỉ liệt kê, không đổi gì
 *   npm run publish:content -- --apply           # làm thật
 *   npm run publish:content -- --apply --force   # làm thật, bỏ qua lỗi tiền kiểm
 *   npm run publish:content -- --apply --admin ban@vidu.com  # chọn người đứng tên
 *
 * Vì sao cần kịch bản này: nút "Xuất bản" trên trang quản trị KHÔNG đổi trạng
 * thái dòng nào — nó chỉ tăng content.config_state.version để client biết nên
 * tải lại (xem chú thích ở admin-ops.service.ts). Muốn một dòng ra tới người
 * chơi thì cột status của chính nó phải là 'published'. Sau khi nạp seed có hơn
 * 60 dòng đang draft, mà trang quản trị chưa có thao tác hàng loạt, nên sửa tay
 * là hơn 60 lần mở form.
 *
 * Kịch bản làm đúng hai việc mà nút Xuất bản làm, cộng bước còn thiếu:
 *   1. đổi status draft ⇒ published trên 7 bảng có cột đó,
 *   2. ghi nhật ký từng dòng, đúng quy ước của trang quản trị,
 *   3. tăng version + ghi một dòng nhật ký 'publish'.
 * Tất cả trong MỘT transaction.
 *
 * CẢNH BÁO: published nghĩa là ra tới người chơi NGAY. Kịch bản in đầy đủ danh
 * sách khoá sẽ bị đổi trước khi hỏi, và không đổi gì nếu thiếu --yes.
 */
import "./small-pool";
import { prisma } from "../core/database/prisma";
import { findPublishIssues } from "../modules/admin/admin-ops.repository";

/**
 * --apply, KHÔNG phải --yes: trên Windows npm nuốt mất --yes trước khi tới script
 * (xem chú thích cùng chỗ trong cleanup-smoke.ts). Vẫn nhận --yes cho ai quen tay.
 */
const APPLY = process.argv.includes("--apply") || process.argv.includes("--yes");
const FORCE = process.argv.includes("--force");

const adminFlag = process.argv.indexOf("--admin");
const ADMIN_EMAIL = adminFlag >= 0 ? process.argv[adminFlag + 1] : undefined;

/** Bảy bảng có cột status. Các bảng còn lại không có khái niệm nháp. */
const TABLES = [
  { table: "content.item", key: "item_key", label: "Vật phẩm" },
  { table: "content.shop_product", key: "product_key", label: "Sản phẩm cửa hàng" },
  { table: "content.mail_template", key: "template_key", label: "Thư mẫu" },
  { table: "content.quest", key: "quest_key", label: "Nhiệm vụ" },
  { table: "content.achievement", key: "achievement_key", label: "Thành tựu" },
  { table: "content.codex_entry", key: "entry_key", label: "Sổ tay" },
  { table: "content.banner", key: "banner_key", label: "Banner gacha" },
] as const;

async function draftKeys(table: string, key: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ k: string }>>(
    `SELECT ${key} AS k FROM ${table} WHERE status = 'draft' ORDER BY 1`,
  );
  return rows.map((r) => r.k);
}

/** In danh sách vấn đề của findPublishIssues theo mức độ. */
function printIssues(issues: Awaited<ReturnType<typeof findPublishIssues>>, tieu_de: string) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  console.log(`${tieu_de}: ${errors.length} lỗi, ${warnings.length} cảnh báo`);
  for (const i of [...errors, ...warnings]) {
    const dau = i.severity === "error" ? "  LỖI  " : "  cảnh báo  ";
    console.log(`${dau}[${i.table} ${i.rowKey}] ${i.message}`);
  }
  console.log();
  return errors.length;
}

async function pickAdmin() {
  if (ADMIN_EMAIL) {
    const found = await prisma.adminUser.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!found) throw new Error(`Không có tài khoản quản trị nào mang email ${ADMIN_EMAIL}.`);
    return found;
  }

  // Không truyền --admin thì chỉ tự chọn khi có đúng MỘT tài khoản. Nhiều tài
  // khoản mà tự đoán là ghi sai tên người phát hành vào nhật ký.
  const all = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
  if (all.length === 0) {
    throw new Error("Chưa có tài khoản quản trị nào. Tạo bằng: npm run admin:create -- <email> <mật khẩu>");
  }
  if (all.length > 1) {
    throw new Error(
      `Có ${all.length} tài khoản quản trị, không đoán được ai phát hành.\n` +
        `Chọn rõ bằng --admin <email>. Đang có: ${all.map((a) => a.email).join(", ")}`,
    );
  }
  return all[0];
}

const BANNER_THAT = "CHẾ ĐỘ PHÁT HÀNH THẬT\n";
const BANNER_THU = "CHẾ ĐỘ THỬ — chỉ liệt kê, không đổi gì\n";

async function main() {
  console.log(APPLY ? BANNER_THAT : BANNER_THU);
  const admin = await pickAdmin();

  const before = await findPublishIssues();
  const soLoi = printIssues(before, "Tiền kiểm trước khi phát hành");

  // Liệt kê đầy đủ, không rút gọn: đây là danh sách sắp ra tới người chơi.
  let total = 0;
  const plan: Array<{ table: string; label: string; keys: string[] }> = [];
  for (const t of TABLES) {
    const keys = await draftKeys(t.table, t.key);
    total += keys.length;
    plan.push({ table: t.table, label: t.label, keys });
    if (keys.length > 0) {
      console.log(`${String(keys.length).padStart(4)}  ${t.label} (${t.table})`);
      console.log(`      ${keys.join(", ")}\n`);
    }
  }

  if (total === 0) {
    console.log("Không có dòng nháp nào. Không cần phát hành.");
    return;
  }

  console.log(`Tổng ${total} dòng đang ở draft.\n`);

  if (soLoi > 0 && !FORCE) {
    console.error(`DỪNG: tiền kiểm báo ${soLoi} lỗi. Sửa xong rồi chạy lại, hoặc thêm --force.`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log("Làm thật:  npm run publish:content -- --apply");
    return;
  }

  console.log(`Người đứng tên phát hành: ${admin.email}\nĐang phát hành...\n`);

  const version = await prisma.$transaction(
    async (tx) => {
      for (const t of TABLES) {
        await tx.$executeRawUnsafe(
          `UPDATE ${t.table} SET status = 'published' WHERE status = 'draft'`,
        );
      }

      // Một dòng nhật ký cho mỗi bản ghi, đúng quy ước trang quản trị đang dùng.
      // Gộp thành MỘT câu lệnh bằng unnest thay vì hơn 60 vòng mạng sang Supabase.
      const tables = plan.flatMap((p) => p.keys.map(() => p.table));
      const keys = plan.flatMap((p) => p.keys);
      if (keys.length > 0) {
        await tx.$executeRaw`
          INSERT INTO admin.audit_log (admin_id, action, table_name, row_key, after)
          SELECT ${admin.adminId}::uuid, 'update', t.tbl, t.k, '{"status":"published"}'::jsonb
            FROM unnest(${tables}::text[], ${keys}::text[]) AS t(tbl, k)`;
      }

      // Giống hệt nút Xuất bản: tăng version rồi ghi một dòng 'publish'.
      const updated = await tx.configState.update({
        where: { id: true },
        data: { version: { increment: 1 }, publishedAt: new Date(), publishedBy: admin.adminId },
      });

      await tx.$executeRaw`
        INSERT INTO admin.audit_log (admin_id, action, table_name, row_key, after)
        VALUES (${admin.adminId}::uuid, 'publish', 'content.config_state',
                ${updated.version.toString()},
                ${JSON.stringify({ version: updated.version.toString(), note: "publish-content script" })}::jsonb)`;

      return updated.version;
    },
    { maxWait: 30_000, timeout: 120_000 },
  );

  console.log(`Đã phát hành ${total} dòng. content.config_state.version = ${version}\n`);

  // Tiền kiểm lại SAU khi đổi: nhiều luật chỉ áp cho dòng đã published, nên có
  // thứ chỉ lộ ra ở bước này. Không tự cuộn ngược — báo để còn biết mà sửa.
  const after = await findPublishIssues();
  const conLoi = printIssues(after, "Tiền kiểm sau khi phát hành");
  if (conLoi > 0) {
    console.log("Những lỗi trên nằm ở nội dung ĐANG published. Sửa trên trang quản trị.");
  }
}

main()
  .catch((err) => {
    console.error("\nHỎNG — đã rollback, DB giữ nguyên như trước khi chạy:\n");
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
