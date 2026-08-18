import type { FastifyInstance } from "fastify";
import * as contentController from "./content.controller";
import { catalogQuerySchema, type CatalogQuery } from "./content.schema";
import { validateQuery } from "../../middlewares/validation.middleware";

/**
 * Danh mục là dữ liệu công khai — KHÔNG yêu cầu đăng nhập. Client phải tải được
 * nó ở màn hình chờ, trước cả khi người chơi bấm đăng nhập.
 *
 * Mọi route ở đây chỉ trả bản 'published'. Bản nháp nằm sau /admin.
 */
export async function contentRouter(app: FastifyInstance) {
  app.get("/content/version", contentController.getVersion);

  app.get<{ Querystring: CatalogQuery }>(
    "/content/catalog",
    { preHandler: validateQuery(catalogQuerySchema) },
    contentController.getCatalog,
  );

  app.get("/content/items", contentController.listItems);
  app.get("/content/crops", contentController.listCrops);
  app.get("/content/patterns", contentController.listPatterns);
  app.get("/content/npcs", contentController.listNpcs);
  app.get("/content/quests", contentController.listQuests);
  app.get("/content/achievements", contentController.listAchievements);
  app.get("/content/mail-templates", contentController.listMailTemplates);
  app.get("/content/codex", contentController.listCodexEntries);
  app.get("/content/gacha-items", contentController.listGachaItems);
  app.get("/content/banners", contentController.listBanners);
  app.get("/content/shop", contentController.listShopProducts);
}
