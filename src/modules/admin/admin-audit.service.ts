import { Prisma } from "@prisma/client";
import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export type AuditAction = "insert" | "update" | "delete" | "publish";

export interface AuditEntry {
  adminId: string;
  action: AuditAction;
  /** Tên bảng đầy đủ, ví dụ "content.item". Trùng với cột table_name để tra ngược. */
  tableName: string;
  rowKey: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

/**
 * Ghi một dòng nhật ký.
 *
 * Raw SQL vì cột ip_address là kiểu `inet` của Postgres, mà schema.prisma đánh
 * dấu `Unsupported` — client sinh ra không có trường đó nên `prisma.auditLog
 * .create()` không cách nào ghi được IP.
 *
 * `${ip}::inet` với ip = NULL vẫn hợp lệ (NULL ép kiểu ra NULL), nên không cần
 * hai nhánh câu lệnh.
 *
 * Nhận `tx` để dòng nhật ký sống hoặc chết CÙNG thay đổi mà nó ghi lại. Nhật ký
 * ghi ngoài transaction sẽ để lại vết cho những thay đổi đã bị cuộn ngược.
 */
export function writeAudit(tx: TxClient, entry: AuditEntry) {
  return tx.$executeRaw`
    INSERT INTO admin.audit_log (admin_id, action, table_name, row_key, before, after, ip_address)
    VALUES (
      ${entry.adminId}::uuid,
      ${entry.action},
      ${entry.tableName},
      ${entry.rowKey},
      ${entry.before === undefined ? null : JSON.stringify(entry.before)}::jsonb,
      ${entry.after === undefined ? null : JSON.stringify(entry.after)}::jsonb,
      ${entry.ipAddress ?? null}::inet
    )
  `;
}

export interface AuditQuery {
  limit: number;
  cursor?: bigint;
  tableName?: string;
  rowKey?: string;
  adminId?: string;
}

export async function listAudit(query: AuditQuery) {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(query.tableName ? { tableName: query.tableName } : {}),
      ...(query.rowKey ? { rowKey: query.rowKey } : {}),
      ...(query.adminId ? { adminId: query.adminId } : {}),
      ...(query.cursor ? { logId: { lt: query.cursor } } : {}),
    },
    include: { admin: { select: { email: true, displayName: true } } },
    orderBy: { logId: "desc" },
    take: query.limit,
  });

  const items = rows.map((r) => ({
    logId: r.logId.toString(),
    adminId: r.adminId,
    adminEmail: r.admin.email,
    adminName: r.admin.displayName,
    action: r.action,
    tableName: r.tableName,
    rowKey: r.rowKey,
    before: r.before,
    after: r.after,
    actedAt: r.actedAt,
  }));

  return {
    items,
    nextCursor: items.length === query.limit ? items[items.length - 1]!.logId : null,
  };
}

/**
 * Ảnh chụp một dòng để đưa vào cột before/after.
 *
 * JSON.stringify của Node ném TypeError khi gặp BigInt và biến Prisma.Decimal
 * thành object rỗng `{}`. Nhật ký ghi `{}` thay vì giá tiền là nhật ký vô dụng
 * đúng lúc cần nó nhất, nên phải chuẩn hoá trước khi đưa xuống jsonb.
 */
export function snapshot(row: unknown): unknown {
  if (row === null || row === undefined) return null;
  return JSON.parse(
    JSON.stringify(row, (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (value instanceof Prisma.Decimal) return value.toString();
      return value;
    }),
  );
}
