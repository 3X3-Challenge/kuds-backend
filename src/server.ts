import { buildApp } from "./app";
import { env } from "./config/env";
import { cleanupExpiredSessions } from "./modules/auth/auth.service";

// buildApp là async từ khi có await app.register(cors/rateLimit), nên phần khởi
// động phải bọc trong một hàm — top-level await không dùng được với module CommonJS.
async function main() {
  const app = await buildApp();

  function scheduleSessionCleanup() {
    const run = () => {
      cleanupExpiredSessions()
        .then((count) => {
          if (count > 0) app.log.info({ count }, "Đã dọn phiên hết hạn");
        })
        .catch((err) => app.log.error(err, "Dọn phiên thất bại"));
    };

    run();
    // unref() để tiến trình vẫn thoát được khi không còn việc gì khác.
    setInterval(run, env.sessionCleanupIntervalHours * 60 * 60 * 1000).unref();
  }

  await app.listen({ port: env.port, host: "0.0.0.0" });
  scheduleSessionCleanup();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
