import type { FastifyInstance } from "fastify";
import * as authController from "./auth.controller";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type ResetPasswordInput,
} from "./auth.schema";
import { validateBody } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function authRouter(app: FastifyInstance) {
  app.post<{ Body: RegisterInput }>(
    "/auth/register",
    { preHandler: validateBody(registerSchema) },
    authController.register,
  );

  app.post<{ Body: LoginInput }>(
    "/auth/login",
    { preHandler: validateBody(loginSchema) },
    authController.login,
  );

  app.post<{ Body: RefreshInput }>(
    "/auth/refresh",
    { preHandler: validateBody(refreshSchema) },
    authController.refresh,
  );

  app.post<{ Body: RefreshInput }>(
    "/auth/logout",
    { preHandler: validateBody(refreshSchema) },
    authController.logout,
  );

  app.post<{ Body: ResetPasswordInput }>(
    "/auth/reset-password",
    { preHandler: validateBody(resetPasswordSchema) },
    authController.resetPassword,
  );

  app.get("/auth/me", { preHandler: requireAuth }, authController.me);
}
