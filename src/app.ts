import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerRoutes } from "./routes";
import { errorMiddleware } from "./middlewares/error.middleware";
import { loggerConfig } from "./core/logger/logger";
import { installBigIntSerializer } from "./common/utils/serialize.util";
import { env } from "./config/env";

export async function buildApp() {
  // PHẢI chạy trước khi có request đầu tiên: rất nhiều khoá chính trong lược đồ
  // này là bigint, và JSON.stringify ném TypeError khi gặp chúng.
  installBigIntSerializer();

  const app = Fastify({
    logger: loggerConfig,
    // request.ip ghi vào admin.audit_log. Sau reverse proxy (Nginx, Fly, Render)
    // mà không bật cờ này thì mọi dòng nhật ký đều ghi IP của proxy.
    trustProxy: true,
  });

  errorMiddleware(app);

  /**
   * Rất nhiều endpoint ở đây là POST không có thân: nhận thưởng, tưới cây, thu
   * hoạch, mở khoá sổ tay, cởi trang bị. Mặc định Fastify từ chối một request
   * mang `Content-Type: application/json` mà thân rỗng:
   *
   *   "Body cannot be empty when content-type is set to 'application/json'"
   *
   * Về mặt chuẩn thì Fastify đúng, nhưng RẤT nhiều HTTP client — kể cả
   * UnityWebRequest.Post và fetch() cấu hình sẵn header — luôn gắn content-type
   * đó dù không có gì để gửi. Coi thân rỗng là `{}` biến một lỗi 400 khó hiểu
   * thành hành vi mà người viết client mong đợi.
   */
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body: string, done) => {
      if (body === "") return done(null, {});
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        // Giữ statusCode 400 để error.middleware trả đúng mã thay vì 500.
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  if (env.adminJwtSecretIsShared) {
    app.log.warn(
      "ADMIN_JWT_SECRET chưa đặt — token quản trị đang dùng chung bí mật với token người chơi. Đặt biến này trước khi lên production.",
    );
  }

  // Trang quản trị chạy ở origin khác backend, nên bắt buộc phải có CORS.
  // Client Unity gọi thẳng bằng UnityWebRequest, không đi qua CORS.
  await app.register(cors, {
    origin: env.corsOrigins,
    credentials: true,
  });

  /**
   * Trần chung cho mọi route. Từng route đặt trần chặt hơn qua `config.rateLimit`
   * (đăng nhập, đăng ký, quay gacha).
   *
   * Khoá theo IP. Với client di động sau NAT của nhà mạng thì nhiều người chơi
   * dùng chung một IP, nên trần chung phải rộng — nó chống quét tự động, không
   * phải chống người chơi bấm nhanh.
   */
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Không giới hạn khi chạy dev, để test tay không bị chặn giữa chừng.
    global: env.nodeEnv === "production",
  });

  app.get("/", async () => ({ message: "Ký ức di sản - Server is running" }));
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(registerRoutes);

  return app;
}
