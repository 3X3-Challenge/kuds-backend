import { Prisma } from "@prisma/client";
import * as contentAdminRepository from "./admin-content.repository";
import { snapshot, writeAudit } from "./admin-audit.service";
import { RESOURCE_BY_NAME, type AdminResource } from "./admin-content.resources";
import { prisma } from "../../core/database/prisma";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from "../../common/errors";
import type { AdminContext } from "../../common/types/fastify";
import type { ListQuery } from "./admin-content.schema";

export interface ActorInfo {
  admin: AdminContext;
  ipAddress: string | null;
}

function resourceOf(name: string): AdminResource {
  const resource = RESOURCE_BY_NAME.get(name);
  if (!resource) {
    throw new NotFoundError(`Không có loại nội dung "${name}"`);
  }
  return resource;
}

/** Danh sách loại nội dung, để trang quản trị dựng menu mà không hard-code. */
export function listResourceTypes() {
  return [...RESOURCE_BY_NAME.values()].map((r) => ({
    name: r.name,
    table: r.table,
    idField: r.idField,
    hasStatus: r.hasStatus,
    searchable: r.searchField !== undefined,
  }));
}

export async function list(resourceName: string, query: ListQuery) {
  const resource = resourceOf(resourceName);

  if (query.status && !resource.hasStatus) {
    throw new BadRequestError(`Loại nội dung "${resourceName}" không có trạng thái xuất bản`);
  }

  const { rows, total } = await contentAdminRepository.list(resource, {
    limit: query.limit,
    offset: query.offset,
    status: query.status,
    search: query.q,
  });

  // snapshot() ở đây làm nhiệm vụ tuần tự hoá: bigint và Decimal đi thẳng ra
  // JSON.stringify của Fastify sẽ nổ hoặc thành object rỗng.
  return { items: snapshot(rows), total, limit: query.limit, offset: query.offset };
}

export async function findOne(resourceName: string, rawId: string) {
  const resource = resourceOf(resourceName);
  const row = await contentAdminRepository.findById(
    prisma,
    resource,
    contentAdminRepository.parseId(resource, rawId),
  );
  if (!row) {
    throw new NotFoundError("Không tìm thấy dữ liệu");
  }
  return snapshot(row);
}

/**
 * Dịch lỗi ràng buộc của Postgres sang câu tiếng Việt nói đúng chuyện gì xảy ra.
 *
 * Đây là những lỗi admin GẶP THẬT khi sửa nội dung đã có người chơi dùng, và
 * thông báo mặc định ("Foreign key constraint failed") không giúp họ hiểu phải
 * làm gì tiếp.
 */
function translateConstraint(err: unknown, resource: AdminResource): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      throw new ConflictError("Khoá này đã tồn tại");
    }
    if (err.code === "P2003" || err.code === "P2014") {
      // Với nhiệm vụ: xoá mục tiêu mà có người chơi đang giữ tiến độ.
      // game.player_quest_objective trỏ về content.quest_objective KHÔNG cascade,
      // nên Postgres chặn — cố ý, để không ai lặng lẽ xoá tiến độ của người chơi.
      if (resource.name === "quests") {
        throw new UnprocessableError(
          "Không đổi được danh sách mục tiêu: đã có người chơi đang làm nhiệm vụ này. " +
            "Tạo nhiệm vụ mới thay vì sửa nhiệm vụ đang chạy.",
        );
      }
      throw new UnprocessableError(
        "Dữ liệu này đang được tham chiếu ở nơi khác, hoặc trỏ tới thứ không tồn tại",
      );
    }
    if (err.code === "P2025") {
      throw new NotFoundError("Không tìm thấy dữ liệu");
    }
  }
  throw err;
}

export async function create(
  resourceName: string,
  input: Record<string, unknown>,
  actor: ActorInfo,
) {
  const resource = resourceOf(resourceName);

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await contentAdminRepository.create(
        tx,
        resource,
        resource.toCreateData(input),
      );

      // Cột `interval` phải ghi bằng SQL thô — xem ghi chú ở admin-content.resources.ts.
      const id = created[resource.idField] as string | bigint;
      await resource.postWrite?.(tx, id, input);

      // Đọc lại SAU postWrite để bản chụp nhật ký phản ánh đúng dòng cuối cùng.
      const final = await contentAdminRepository.findById(tx, resource, id);

      await writeAudit(tx, {
        adminId: actor.admin.adminId,
        action: "insert",
        tableName: resource.table,
        rowKey: String(id),
        after: snapshot(final),
        ipAddress: actor.ipAddress,
      });

      return snapshot(final);
    });
  } catch (err) {
    translateConstraint(err, resource);
  }
}

export async function update(
  resourceName: string,
  rawId: string,
  input: Record<string, unknown>,
  actor: ActorInfo,
) {
  const resource = resourceOf(resourceName);
  const id = contentAdminRepository.parseId(resource, rawId);

  try {
    return await prisma.$transaction(async (tx) => {
      // Chụp TRƯỚC khi sửa, trong cùng transaction. Đọc ngoài transaction thì
      // hai admin sửa cùng lúc sẽ ghi nhật ký "before" của nhau.
      const before = await contentAdminRepository.findById(tx, resource, id);
      if (!before) {
        throw new NotFoundError("Không tìm thấy dữ liệu");
      }

      await contentAdminRepository.update(tx, resource, id, resource.toUpdateData(input));
      await resource.postWrite?.(tx, id, input);

      const after = await contentAdminRepository.findById(tx, resource, id);

      await writeAudit(tx, {
        adminId: actor.admin.adminId,
        action: "update",
        tableName: resource.table,
        rowKey: String(id),
        before: snapshot(before),
        after: snapshot(after),
        ipAddress: actor.ipAddress,
      });

      return snapshot(after);
    });
  } catch (err) {
    translateConstraint(err, resource);
  }
}

/**
 * NÚT XOÁ DUY NHẤT của trang quản trị.
 *
 * Bảng có cột status ⇒ chuyển 'archived', KHÔNG xoá dòng. Vật phẩm đã vào túi
 * người chơi, nhiệm vụ đang có người làm, mẫu thư đã gửi — tất cả đều có khoá
 * ngoại trỏ tới, và DELETE thật sẽ bị chặn. Quan trọng hơn: client vẫn phải hiển
 * thị được vật phẩm archived đang nằm trong túi cũ.
 *
 * Bảng không có status (crop, npc, pattern...) mới xoá thật. Nếu đang bị tham
 * chiếu thì Postgres chặn và translateConstraint dịch lại thành 422.
 */
export async function archive(resourceName: string, rawId: string, actor: ActorInfo) {
  const resource = resourceOf(resourceName);
  const id = contentAdminRepository.parseId(resource, rawId);

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await contentAdminRepository.findById(tx, resource, id);
      if (!before) {
        throw new NotFoundError("Không tìm thấy dữ liệu");
      }

      if (resource.hasStatus) {
        const after = await contentAdminRepository.update(tx, resource, id, {
          status: "archived",
        });
        await writeAudit(tx, {
          adminId: actor.admin.adminId,
          action: "update",
          tableName: resource.table,
          rowKey: String(id),
          before: snapshot(before),
          after: snapshot(after),
          ipAddress: actor.ipAddress,
        });
        return { archived: true, deleted: false, item: snapshot(after) };
      }

      await contentAdminRepository.remove(tx, resource, id);
      await writeAudit(tx, {
        adminId: actor.admin.adminId,
        action: "delete",
        tableName: resource.table,
        rowKey: String(id),
        before: snapshot(before),
        ipAddress: actor.ipAddress,
      });
      return { archived: false, deleted: true, item: null };
    });
  } catch (err) {
    translateConstraint(err, resource);
  }
}

/** Zod schema của một loại tài nguyên — router dùng để validate body động. */
export function schemasFor(resourceName: string) {
  const resource = resourceOf(resourceName);
  return { create: resource.createSchema, update: resource.updateSchema };
}
