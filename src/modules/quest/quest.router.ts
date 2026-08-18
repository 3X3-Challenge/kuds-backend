import type { FastifyInstance } from "fastify";
import * as questController from "./quest.controller";
import {
  questParamsSchema,
  questProgressSchema,
  type QuestParams,
  type QuestProgressInput,
} from "./quest.schema";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function questRouter(app: FastifyInstance) {
  app.get("/me/quests", { preHandler: requireAuth }, questController.listQuests);

  app.post<{ Params: QuestParams }>(
    "/me/quests/:questKey/accept",
    { preHandler: [requireAuth, validateParams(questParamsSchema)] },
    questController.acceptQuest,
  );

  app.post<{ Params: QuestParams; Body: QuestProgressInput }>(
    "/me/quests/:questKey/progress",
    {
      preHandler: [
        requireAuth,
        validateParams(questParamsSchema),
        validateBody(questProgressSchema),
      ],
    },
    questController.addProgress,
  );

  app.post<{ Params: QuestParams }>(
    "/me/quests/:questKey/claim",
    { preHandler: [requireAuth, validateParams(questParamsSchema)] },
    questController.claimQuest,
  );
}
