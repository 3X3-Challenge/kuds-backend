import type { FastifyInstance } from "fastify";
import * as authController from "./auth.controller";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  updateProfileSchema,
  googleLoginSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
  type GoogleLoginInput,
} from "./auth.schema";
import { validateBody } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function authRouter(app: FastifyInstance) {
  app.post<{ Body: RegisterInput }>(
    "/auth/register",
    {
      preHandler: validateBody(registerSchema),
      // Đăng ký và đăng nhập là hai cửa duy nhất mở cho người chưa có token, nên
      // cũng là hai cửa duy nhất bị dò mật khẩu. Trần riêng, chặt hơn trần chung.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    authController.register,
  );

  app.post<{ Body: LoginInput }>(
    "/auth/login",
    {
      preHandler: validateBody(loginSchema),
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    authController.login,
  );

  app.post<{ Body: GoogleLoginInput }>(
    "/auth/google",
    {
      preHandler: validateBody(googleLoginSchema),
      // Cửa mở cho người chưa có token, nên cùng trần với /auth/login. Không dò
      // được mật khẩu ở đây, nhưng mỗi lượt gọi có thể kéo theo một lượt tải
      // JWKS và một transaction tạo tài khoản.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    authController.loginWithGoogle,
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
    {
      preHandler: validateBody(resetPasswordSchema),
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    authController.resetPassword,
  );

  app.get("/auth/me", { preHandler: requireAuth }, authController.me);

  app.patch<{ Body: UpdateProfileInput }>(
    "/auth/me",
    { preHandler: [requireAuth, validateBody(updateProfileSchema)] },
    authController.updateProfile,
  );
}
