import type { FastifyReply, FastifyRequest } from "fastify";
import * as playerAdminService from "./admin-player.service";
import { adminOf } from "../../middlewares/admin.middleware";
import type { ActorInfo } from "./admin-content.service";
import type {
  AdjustCurrencyInput,
  BanInput,
  GrantItemInput,
  PlayerIdParams,
  PlayerListQuery,
  SendMailInput,
} from "./admin-player.schema";

function actorOf(request: FastifyRequest): ActorInfo {
  return { admin: adminOf(request), ipAddress: request.ip || null };
}

export async function listPlayers(
  request: FastifyRequest<{ Querystring: PlayerListQuery }>,
  reply: FastifyReply,
) {
  return reply.send(await playerAdminService.listPlayers(request.query));
}

export async function findPlayer(
  request: FastifyRequest<{ Params: PlayerIdParams }>,
  reply: FastifyReply,
) {
  return reply.send(await playerAdminService.findPlayer(request.params.playerId));
}

export async function ban(
  request: FastifyRequest<{ Params: PlayerIdParams; Body: BanInput }>,
  reply: FastifyReply,
) {
  const result = await playerAdminService.setBan(
    request.params.playerId,
    true,
    request.body,
    actorOf(request),
  );
  return reply.send(result);
}

export async function unban(
  request: FastifyRequest<{ Params: PlayerIdParams; Body: BanInput }>,
  reply: FastifyReply,
) {
  const result = await playerAdminService.setBan(
    request.params.playerId,
    false,
    // Gỡ cấm thì bannedUntil luôn phải là null — CHECK bên SQL cấm tài khoản
    // không bị cấm mà vẫn mang hạn cấm.
    { ...request.body, bannedUntil: null },
    actorOf(request),
  );
  return reply.send(result);
}

export async function adjustCurrency(
  request: FastifyRequest<{ Params: PlayerIdParams; Body: AdjustCurrencyInput }>,
  reply: FastifyReply,
) {
  const result = await playerAdminService.adjustCurrency(
    request.params.playerId,
    request.body,
    actorOf(request),
  );
  return reply.send(result);
}

export async function grantItem(
  request: FastifyRequest<{ Params: PlayerIdParams; Body: GrantItemInput }>,
  reply: FastifyReply,
) {
  const result = await playerAdminService.grantItemToPlayer(
    request.params.playerId,
    request.body,
    actorOf(request),
  );
  return reply.send(result);
}

export async function sendMail(
  request: FastifyRequest<{ Body: SendMailInput }>,
  reply: FastifyReply,
) {
  return reply.send(await playerAdminService.sendMail(request.body, actorOf(request)));
}
