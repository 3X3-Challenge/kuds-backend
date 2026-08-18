import type { FastifyInstance } from "fastify";
import * as contentAdminController from "./admin-content.controller";
import {
  listQuerySchema,
  resourceIdParamsSchema,
  resourceParamsSchema,
  type ListQuery,
  type ResourceIdParams,
  type ResourceParams,
} from "./admin-content.schema";
import { validateParams, validateQuery } from "../../middlewares/validation.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";

/**
 * Một bộ route cho MƯỜI HAI bảng danh mục, phân biệt bằng đoạn `:resource`.
 * Danh sách hợp lệ nằm ở admin-content.resources.ts; tên lạ trả 404.
 *
 * Quyền: đọc cần viewer, ghi cần editor. Xuất bản (publish) là chuyện khác, cần
 * publisher — xem admin-ops.router.ts.
 */
export async function adminContentRouter(app: FastifyInstance) {
  app.get(
    "/admin/content",
    { preHandler: requireAdmin("viewer") },
    contentAdminController.listResourceTypes,
  );

  app.get<{ Params: ResourceParams; Querystring: ListQuery }>(
    "/admin/content/:resource",
    {
      preHandler: [
        requireAdmin("viewer"),
        validateParams(resourceParamsSchema),
        validateQuery(listQuerySchema),
      ],
    },
    contentAdminController.list,
  );

  app.get<{ Params: ResourceIdParams }>(
    "/admin/content/:resource/:id",
    { preHandler: [requireAdmin("viewer"), validateParams(resourceIdParamsSchema)] },
    contentAdminController.findOne,
  );

  app.post<{ Params: ResourceParams }>(
    "/admin/content/:resource",
    { preHandler: [requireAdmin("editor"), validateParams(resourceParamsSchema)] },
    contentAdminController.create,
  );

  app.patch<{ Params: ResourceIdParams }>(
    "/admin/content/:resource/:id",
    { preHandler: [requireAdmin("editor"), validateParams(resourceIdParamsSchema)] },
    contentAdminController.update,
  );

  app.delete<{ Params: ResourceIdParams }>(
    "/admin/content/:resource/:id",
    { preHandler: [requireAdmin("editor"), validateParams(resourceIdParamsSchema)] },
    contentAdminController.archive,
  );
}
