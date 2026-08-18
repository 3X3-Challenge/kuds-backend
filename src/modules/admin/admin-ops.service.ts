import * as opsRepository from "./admin-ops.repository";
import { writeAudit } from "./admin-audit.service";
import { prisma } from "../../core/database/prisma";
import { NotFoundError, UnprocessableError } from "../../common/errors";
import type { ActorInfo } from "./admin-content.service";
import type { PublishInput } from "./admin-ops.schema";

export async function getState() {
  const state = await opsRepository.getConfigState();
  if (!state) {
    throw new NotFoundError("Chưa có trạng thái xuất bản");
  }
  return {
    version: state.version.toString(),
    publishedAt: state.publishedAt,
    publishedBy: state.publishedBy,
    publisherEmail: state.publisher?.email ?? null,
    publisherName: state.publisher?.displayName ?? null,
  };
}

/**
 * Kiểm tra trước khi xuất bản. Chỉ đọc, không đổi gì — trang quản trị gọi được
 * bất cứ lúc nào để hiện bảng cảnh báo.
 */
export async function preflight() {
  const issues = await opsRepository.findPublishIssues();
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Xuất bản: tăng version của content.config_state.
 *
 * Client giữ version nó đã tải; version đổi là lần gọi /content/catalog kế tiếp
 * trả về dữ liệu mới thay vì 304. Không có bước sao chép bảng nào ở đây —
 * "published" là một GIÁ TRỊ CỘT, còn version chỉ là tín hiệu cho client biết
 * đã đến lúc tải lại.
 *
 * Hệ quả cần biết: một dòng chuyển sang status 'published' là RA TỚI NGƯỜI CHƠI
 * NGAY, không đợi bấm nút này. Nút này chỉ nói cho client biết nên tải lại.
 */
export async function publish(input: PublishInput, actor: ActorInfo) {
  const check = await preflight();

  if (!check.ok && !input.force) {
    throw new UnprocessableError(
      `Không xuất bản được: có ${check.errors.length} lỗi trong nội dung. ` +
        `Sửa xong rồi thử lại, hoặc dùng force để bỏ qua.`,
    );
  }

  const state = await prisma.$transaction(async (tx) => {
    const updated = await opsRepository.bumpVersion(tx, actor.admin.adminId);

    await writeAudit(tx, {
      adminId: actor.admin.adminId,
      action: "publish",
      tableName: "content.config_state",
      rowKey: updated.version.toString(),
      after: {
        version: updated.version.toString(),
        note: input.note ?? null,
        forced: input.force,
        // Ghi lại các lỗi đã bỏ qua. Sáu tháng sau khi có ai hỏi "sao bản này
        // hỏng", đây là chỗ duy nhất còn nhớ.
        skippedErrors: input.force ? check.errors : undefined,
      },
      ipAddress: actor.ipAddress,
    });

    return updated;
  });

  return {
    version: state.version.toString(),
    publishedAt: state.publishedAt,
    forced: input.force && !check.ok,
    skippedErrorCount: input.force ? check.errors.length : 0,
  };
}

export async function dashboard() {
  const [state, counts, drafts, check] = await Promise.all([
    getState(),
    opsRepository.dashboardCounts(),
    opsRepository.draftCounts(),
    preflight(),
  ]);

  return {
    config: state,
    counts,
    drafts,
    issues: { errorCount: check.errors.length, warningCount: check.warnings.length },
  };
}
