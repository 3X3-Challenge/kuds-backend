import type { FastifyInstance } from "fastify";
import * as mailController from "./mail.controller";
import {
  mailListQuerySchema,
  mailParamsSchema,
  type MailListQuery,
  type MailParams,
} from "./mail.schema";
import { validateParams, validateQuery } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function mailRouter(app: FastifyInstance) {
  app.get<{ Querystring: MailListQuery }>(
    "/me/mails",
    { preHandler: [requireAuth, validateQuery(mailListQuerySchema)] },
    mailController.listMails,
  );

  // Đặt TRƯỚC các route có :mailId. Fastify khớp đường tĩnh trước tham số nên
  // thứ tự khai báo không đổi kết quả, nhưng đọc từ trên xuống thì rõ hơn.
  app.post("/me/mails/claim-all", { preHandler: requireAuth }, mailController.claimAll);
  app.delete("/me/mails/claimed", { preHandler: requireAuth }, mailController.deleteClaimed);

  app.post<{ Params: MailParams }>(
    "/me/mails/:mailId/read",
    { preHandler: [requireAuth, validateParams(mailParamsSchema)] },
    mailController.markRead,
  );

  app.post<{ Params: MailParams }>(
    "/me/mails/:mailId/claim",
    { preHandler: [requireAuth, validateParams(mailParamsSchema)] },
    mailController.claimMail,
  );

  app.delete<{ Params: MailParams }>(
    "/me/mails/:mailId",
    { preHandler: [requireAuth, validateParams(mailParamsSchema)] },
    mailController.deleteMail,
  );
}
