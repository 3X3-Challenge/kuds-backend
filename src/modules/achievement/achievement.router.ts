import type { FastifyInstance } from "fastify";
import * as achievementController from "./achievement.controller";
import {
  achievementParamsSchema,
  achievementProgressSchema,
  type AchievementParams,
  type AchievementProgressInput,
} from "./achievement.schema";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function achievementRouter(app: FastifyInstance) {
  app.get(
    "/me/achievements",
    { preHandler: requireAuth },
    achievementController.listAchievements,
  );

  app.post<{ Params: AchievementParams; Body: AchievementProgressInput }>(
    "/me/achievements/:achievementKey/progress",
    {
      preHandler: [
        requireAuth,
        validateParams(achievementParamsSchema),
        validateBody(achievementProgressSchema),
      ],
    },
    achievementController.addProgress,
  );

  app.post<{ Params: AchievementParams }>(
    "/me/achievements/:achievementKey/claim",
    { preHandler: [requireAuth, validateParams(achievementParamsSchema)] },
    achievementController.claimAchievement,
  );
}
