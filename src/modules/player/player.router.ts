import type { FastifyInstance } from "fastify";
import * as playerController from "./player.controller";
import {
  ledgerQuerySchema,
  saveSchema,
  type LedgerQuery,
  type SaveInput,
} from "./player.schema";
import { validateBody, validateQuery } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function playerRouter(app: FastifyInstance) {
  app.get("/me/state", { preHandler: requireAuth }, playerController.getState);
  app.get("/me/wallet", { preHandler: requireAuth }, playerController.listWallets);
  app.get("/me/save", { preHandler: requireAuth }, playerController.getSave);

  app.put<{ Body: SaveInput }>(
    "/me/save",
    { preHandler: [requireAuth, validateBody(saveSchema)] },
    playerController.putSave,
  );

  app.get<{ Querystring: LedgerQuery }>(
    "/me/ledger",
    { preHandler: [requireAuth, validateQuery(ledgerQuerySchema)] },
    playerController.listLedger,
  );
}
