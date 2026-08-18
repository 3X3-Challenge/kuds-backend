import type { FastifyInstance } from "fastify";
import * as gachaController from "./gacha.controller";
import {
  bannerParamsSchema,
  historyQuerySchema,
  pullSchema,
  type BannerParams,
  type HistoryQuery,
  type PullInput,
} from "./gacha.schema";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function gachaRouter(app: FastifyInstance) {
  app.get("/me/gacha/state", { preHandler: requireAuth }, gachaController.listBannerStates);

  app.get<{ Querystring: HistoryQuery }>(
    "/me/gacha/history",
    { preHandler: [requireAuth, validateQuery(historyQuerySchema)] },
    gachaController.listHistory,
  );

  app.post<{ Params: BannerParams; Body: PullInput }>(
    "/gacha/:bannerKey/pull",
    {
      preHandler: [requireAuth, validateParams(bannerParamsSchema), validateBody(pullSchema)],
      // Trần riêng: quay gacha là endpoint tốn tiền nhất và cũng nặng nhất
      // (transaction chạm 5 bảng). Trần chung 200/phút quá rộng cho nó.
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    gachaController.pull,
  );
}
