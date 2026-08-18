import type { FastifyInstance } from "fastify";
import * as adminAuthController from "./admin-auth.controller";
import {
  adminIdParamsSchema,
  adminLoginSchema,
  createAdminSchema,
  updateAdminSchema,
  type AdminIdParams,
  type AdminLoginInput,
  type CreateAdminInput,
  type UpdateAdminInput,
} from "./admin-auth.schema";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";

export async function adminAuthRouter(app: FastifyInstance) {
  app.post<{ Body: AdminLoginInput }>(
    "/admin/auth/login",
    {
      preHandler: validateBody(adminLoginSchema),
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    adminAuthController.login,
  );

  app.get("/admin/auth/me", { preHandler: requireAdmin("viewer") }, adminAuthController.me);

  // Quản lý tài khoản quản trị là quyền cao nhất: editor không được tự phong
  // mình lên publisher.
  app.get(
    "/admin/admins",
    { preHandler: requireAdmin("publisher") },
    adminAuthController.listAdmins,
  );

  app.post<{ Body: CreateAdminInput }>(
    "/admin/admins",
    { preHandler: [requireAdmin("publisher"), validateBody(createAdminSchema)] },
    adminAuthController.createAdmin,
  );

  app.patch<{ Params: AdminIdParams; Body: UpdateAdminInput }>(
    "/admin/admins/:adminId",
    {
      preHandler: [
        requireAdmin("publisher"),
        validateParams(adminIdParamsSchema),
        validateBody(updateAdminSchema),
      ],
    },
    adminAuthController.updateAdmin,
  );
}
