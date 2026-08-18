import type { FastifyInstance } from "fastify";
import { adminAuthRouter } from "./admin-auth.router";
import { adminContentRouter } from "./admin-content.router";
import { adminOpsRouter } from "./admin-ops.router";
import { adminPlayerRouter } from "./admin-player.router";

/** Gom bốn nhóm route quản trị. Mọi đường ở đây đều bắt đầu bằng /admin. */
export async function adminRouter(app: FastifyInstance) {
  await app.register(adminAuthRouter);
  await app.register(adminContentRouter);
  await app.register(adminOpsRouter);
  await app.register(adminPlayerRouter);
}
