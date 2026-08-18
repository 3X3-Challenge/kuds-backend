import type { FastifyInstance } from "fastify";
import * as codexController from "./codex.controller";
import { codexParamsSchema, type CodexParams } from "./codex.schema";
import { validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function codexRouter(app: FastifyInstance) {
  app.get("/me/codex", { preHandler: requireAuth }, codexController.listUnlocks);

  app.post<{ Params: CodexParams }>(
    "/me/codex/:entryKey/unlock",
    { preHandler: [requireAuth, validateParams(codexParamsSchema)] },
    codexController.unlock,
  );
}
