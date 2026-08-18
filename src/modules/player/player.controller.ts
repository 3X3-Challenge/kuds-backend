import type { FastifyReply, FastifyRequest } from "fastify";
import * as playerService from "./player.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { LedgerQuery, SaveInput } from "./player.schema";

export async function getState(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await playerService.getState(playerIdOf(request)));
}

export async function listWallets(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await playerService.listWallets(playerIdOf(request)));
}

export async function getSave(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await playerService.getSave(playerIdOf(request)));
}

export async function putSave(
  request: FastifyRequest<{ Body: SaveInput }>,
  reply: FastifyReply,
) {
  return reply.send(await playerService.saveState(playerIdOf(request), request.body));
}

export async function listLedger(
  request: FastifyRequest<{ Querystring: LedgerQuery }>,
  reply: FastifyReply,
) {
  return reply.send(await playerService.listLedger(playerIdOf(request), request.query));
}
