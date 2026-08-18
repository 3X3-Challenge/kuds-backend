import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";
import type { AdminResource } from "./admin-content.resources";

/**
 * Truy cập delegate của Prisma theo TÊN CHUỖI lấy từ sổ đăng ký.
 *
 * `any` ở đây là có chủ ý và bị khoanh vùng trong đúng một file. Một hàm generic
 * đúng kiểu cho cả mười hai delegate khác nhau cần một bộ conditional type dài
 * hơn toàn bộ module này và không bắt thêm được lỗi nào — tên model đến từ hằng
 * số trong sổ đăng ký, không phải từ input người dùng.
 *
 * Tầng service bên trên vẫn có kiểu đầy đủ nhờ zod.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = any;

function delegateOf(client: TxClient | typeof prisma, resource: AdminResource): Delegate {
  const delegate = (client as unknown as Record<string, Delegate>)[resource.model];
  if (!delegate) {
    throw new Error(`Prisma không có model "${resource.model}" (sổ đăng ký sai)`);
  }
  return delegate;
}

/** id trên URL luôn là chuỗi; bảng khoá bigint cần ép kiểu trước khi truy vấn. */
export function parseId(resource: AdminResource, raw: string): string | bigint {
  return resource.idKind === "bigint" ? BigInt(raw) : raw;
}

export interface ListParams {
  limit: number;
  offset: number;
  status?: string;
  search?: string;
}

export async function list(resource: AdminResource, params: ListParams) {
  const where = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.search && resource.searchField
      ? { [resource.searchField]: { contains: params.search, mode: "insensitive" } }
      : {}),
  };

  const delegate = delegateOf(prisma, resource);
  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: resource.orderBy,
      include: resource.include,
      skip: params.offset,
      take: params.limit,
    }),
    delegate.count({ where }),
  ]);

  return { rows, total };
}

export function findById(
  client: TxClient | typeof prisma,
  resource: AdminResource,
  id: string | bigint,
) {
  return delegateOf(client, resource).findUnique({
    where: { [resource.idField]: id },
    include: resource.include,
  });
}

export function create(
  tx: TxClient,
  resource: AdminResource,
  data: Record<string, unknown>,
) {
  return delegateOf(tx, resource).create({ data, include: resource.include });
}

export function update(
  tx: TxClient,
  resource: AdminResource,
  id: string | bigint,
  data: Record<string, unknown>,
) {
  return delegateOf(tx, resource).update({
    where: { [resource.idField]: id },
    data,
    include: resource.include,
  });
}

/**
 * Xoá THẬT. Chỉ dùng cho bảng không có cột status (crop, npc, pattern, gói
 * thưởng, vật phẩm gacha). Bảng có status thì "xoá" là chuyển archived — dữ
 * liệu người chơi đang trỏ tới nó và khoá ngoại sẽ chặn DELETE, đúng như thiết kế.
 */
export function remove(tx: TxClient, resource: AdminResource, id: string | bigint) {
  return delegateOf(tx, resource).delete({ where: { [resource.idField]: id } });
}
