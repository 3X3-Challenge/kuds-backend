import type { FastifyReply, FastifyRequest } from "fastify";
import * as achievementService from "./achievement.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { AchievementParams, AchievementProgressInput } from "./achievement.schema";

export async function listAchievements(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await achievementService.listAchievements(playerIdOf(request)));
}

export async function addProgress(
  request: FastifyRequest<{ Params: AchievementParams; Body: AchievementProgressInput }>,
  reply: FastifyReply,
) {
  const result = await achievementService.addProgress(
    playerIdOf(request),
    request.params.achievementKey,
    request.body,
  );
  return reply.send(result);
}

export async function claimAchievement(
  request: FastifyRequest<{ Params: AchievementParams }>,
  reply: FastifyReply,
) {
  const result = await achievementService.claimAchievement(
    playerIdOf(request),
    request.params.achievementKey,
  );
  return reply.send(result);
}
