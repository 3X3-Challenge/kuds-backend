import type { FastifyInstance } from "fastify";
import { authRouter } from "../modules/auth/auth.router";
import { contentRouter } from "../modules/content/content.router";
import { playerRouter } from "../modules/player/player.router";
import { inventoryRouter } from "../modules/inventory/inventory.router";
import { mailRouter } from "../modules/mail/mail.router";
import { questRouter } from "../modules/quest/quest.router";
import { achievementRouter } from "../modules/achievement/achievement.router";
import { farmRouter } from "../modules/farm/farm.router";
import { gachaRouter } from "../modules/gacha/gacha.router";
import { codexRouter } from "../modules/codex/codex.router";
import { artworkRouter } from "../modules/artwork/artwork.router";
import { adminRouter } from "../modules/admin/admin.router";

/**
 * Chỗ DUY NHẤT gắn router của các module. Thêm module mới thì thêm một dòng ở
 * đây, không đăng ký route rải rác trong app.ts.
 *
 * Ba nhóm:
 *   /auth, /content        — công khai (hoặc chỉ cần token để đọc /auth/me)
 *   /me, /gacha            — cần token người chơi (requireAuth)
 *   /admin                 — cần token quản trị (requireAdmin)
 */
export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRouter);
  await app.register(contentRouter);

  await app.register(playerRouter);
  await app.register(inventoryRouter);
  await app.register(mailRouter);
  await app.register(questRouter);
  await app.register(achievementRouter);
  await app.register(farmRouter);
  await app.register(gachaRouter);
  await app.register(codexRouter);
  await app.register(artworkRouter);

  await app.register(adminRouter);
}
