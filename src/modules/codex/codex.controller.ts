import type { FastifyReply, FastifyRequest } from "fastify";
import * as codexService from "./codex.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { CodexParams } from "./codex.schema";

export async function listUnlocks(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await codexService.listUnlocks(playerIdOf(request)));
}

export async function unlock(
  request: FastifyRequest<{ Params: CodexParams }>,
  reply: FastifyReply,
) {
  return reply.send(await codexService.unlock(playerIdOf(request), request.params.entryKey));
}
