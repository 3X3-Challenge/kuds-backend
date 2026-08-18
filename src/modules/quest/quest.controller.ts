import type { FastifyReply, FastifyRequest } from "fastify";
import * as questService from "./quest.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { QuestParams, QuestProgressInput } from "./quest.schema";

export async function listQuests(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await questService.listQuests(playerIdOf(request)));
}

export async function acceptQuest(
  request: FastifyRequest<{ Params: QuestParams }>,
  reply: FastifyReply,
) {
  const result = await questService.acceptQuest(playerIdOf(request), request.params.questKey);
  return reply.code(201).send(result);
}

export async function addProgress(
  request: FastifyRequest<{ Params: QuestParams; Body: QuestProgressInput }>,
  reply: FastifyReply,
) {
  const result = await questService.addProgress(
    playerIdOf(request),
    request.params.questKey,
    request.body,
  );
  return reply.send(result);
}

export async function claimQuest(
  request: FastifyRequest<{ Params: QuestParams }>,
  reply: FastifyReply,
) {
  return reply.send(await questService.claimQuest(playerIdOf(request), request.params.questKey));
}
