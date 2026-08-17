import { buildApp } from "./app";
import { env } from "./config/env";
import { cleanupExpiredSessions } from "./modules/auth/auth.service";

const app = buildApp();

function scheduleSessionCleanup() {
  const run = () => {
    cleanupExpiredSessions()
      .then((count) => {
        if (count > 0) app.log.info({ count }, "Cleaned up stale sessions");
      })
      .catch((err) => app.log.error(err, "Session cleanup failed"));
  };

  run();
  setInterval(run, env.sessionCleanupIntervalHours * 60 * 60 * 1000).unref();
}

app
  .listen({ port: env.port, host: "0.0.0.0" })
  .then(scheduleSessionCleanup)
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
