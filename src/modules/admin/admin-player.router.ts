import type { FastifyInstance } from "fastify";
import * as playerAdminController from "./admin-player.controller";
import {
  adjustCurrencySchema,
  banSchema,
  grantItemSchema,
  playerIdParamsSchema,
  playerListQuerySchema,
  sendMailSchema,
  type AdjustCurrencyInput,
  type BanInput,
  type GrantItemInput,
  type PlayerIdParams,
  type PlayerListQuery,
  type SendMailInput,
} from "./admin-player.schema";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validation.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";

/**
 * Quyền ở đây cao hơn phần nội dung: mọi thao tác ghi đều cần `publisher`.
 * editor được sửa bản nháp thoải mái vì bản nháp chưa ra tới ai; còn cấm tài
 * khoản, cộng tiền và gửi thư thì tác động thẳng lên người chơi thật và không
 * có nút hoàn tác.
 */
export async function adminPlayerRouter(app: FastifyInstance) {
  app.get<{ Querystring: PlayerListQuery }>(
    "/admin/players",
    { preHandler: [requireAdmin("viewer"), validateQuery(playerListQuerySchema)] },
    playerAdminController.listPlayers,
  );

  // Đặt trước :playerId để "mail" không bị hiểu thành một uuid.
  app.post<{ Body: SendMailInput }>(
    "/admin/players/mail",
    { preHandler: [requireAdmin("publisher"), validateBody(sendMailSchema)] },
    playerAdminController.sendMail,
  );

  app.get<{ Params: PlayerIdParams }>(
    "/admin/players/:playerId",
    { preHandler: [requireAdmin("viewer"), validateParams(playerIdParamsSchema)] },
    playerAdminController.findPlayer,
  );

  app.post<{ Params: PlayerIdParams; Body: BanInput }>(
    "/admin/players/:playerId/ban",
    {
      preHandler: [
        requireAdmin("publisher"),
        validateParams(playerIdParamsSchema),
        validateBody(banSchema),
      ],
    },
    playerAdminController.ban,
  );

  app.post<{ Params: PlayerIdParams; Body: BanInput }>(
    "/admin/players/:playerId/unban",
    {
      preHandler: [
        requireAdmin("publisher"),
        validateParams(playerIdParamsSchema),
        validateBody(banSchema),
      ],
    },
    playerAdminController.unban,
  );

  app.post<{ Params: PlayerIdParams; Body: AdjustCurrencyInput }>(
    "/admin/players/:playerId/currency",
    {
      preHandler: [
        requireAdmin("publisher"),
        validateParams(playerIdParamsSchema),
        validateBody(adjustCurrencySchema),
      ],
    },
    playerAdminController.adjustCurrency,
  );

  app.post<{ Params: PlayerIdParams; Body: GrantItemInput }>(
    "/admin/players/:playerId/items",
    {
      preHandler: [
        requireAdmin("publisher"),
        validateParams(playerIdParamsSchema),
        validateBody(grantItemSchema),
      ],
    },
    playerAdminController.grantItem,
  );
}
