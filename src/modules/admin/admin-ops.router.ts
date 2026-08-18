import type { FastifyInstance } from "fastify";
import * as opsController from "./admin-ops.controller";
import {
  auditQuerySchema,
  publishSchema,
  type AuditQuery,
  type PublishInput,
} from "./admin-ops.schema";
import { validateBody, validateQuery } from "../../middlewares/validation.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";

export async function adminOpsRouter(app: FastifyInstance) {
  app.get("/admin/dashboard", { preHandler: requireAdmin("viewer") }, opsController.dashboard);
  app.get("/admin/publish/state", { preHandler: requireAdmin("viewer") }, opsController.getState);

  // Chỉ đọc, nên viewer chạy được: người soạn nội dung phải tự kiểm tra được
  // công việc của mình mà không cần đợi publisher.
  app.get(
    "/admin/publish/preflight",
    { preHandler: requireAdmin("viewer") },
    opsController.preflight,
  );

  app.post<{ Body: PublishInput }>(
    "/admin/publish",
    { preHandler: [requireAdmin("publisher"), validateBody(publishSchema)] },
    opsController.publish,
  );

  app.get<{ Querystring: AuditQuery }>(
    "/admin/audit",
    { preHandler: [requireAdmin("viewer"), validateQuery(auditQuerySchema)] },
    opsController.audit,
  );
}
