import type { FastifyReply, FastifyRequest } from "fastify";
import * as gachaService from "./gacha.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { BannerParams, HistoryQuery, PullInput } from "./gacha.schema";

export async function listBannerStates(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await gachaService.listBannerStates(playerIdOf(request)));
}

export async function pull(
  request: FastifyRequest<{ Params: BannerParams; Body: PullInput }>,
  reply: FastifyReply,
) {
  const result = await gachaService.pull(
    playerIdOf(request),
    request.params.bannerKey,
    request.body,
  );
  return reply.send(result);
}

export async function listHistory(
  request: FastifyRequest<{ Querystring: HistoryQuery }>,
  reply: FastifyReply,
) {
  return reply.send(await gachaService.listHistory(playerIdOf(request), request.query));
}
