import type { FastifyReply, FastifyRequest } from "fastify";
import * as mailService from "./mail.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { MailListQuery, MailParams } from "./mail.schema";

export async function listMails(
  request: FastifyRequest<{ Querystring: MailListQuery }>,
  reply: FastifyReply,
) {
  return reply.send(await mailService.listMails(playerIdOf(request), request.query));
}

export async function markRead(
  request: FastifyRequest<{ Params: MailParams }>,
  reply: FastifyReply,
) {
  return reply.send(await mailService.markRead(playerIdOf(request), request.params.mailId));
}

export async function claimMail(
  request: FastifyRequest<{ Params: MailParams }>,
  reply: FastifyReply,
) {
  return reply.send(await mailService.claimMail(playerIdOf(request), request.params.mailId));
}

export async function claimAll(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await mailService.claimAll(playerIdOf(request)));
}

export async function deleteMail(
  request: FastifyRequest<{ Params: MailParams }>,
  reply: FastifyReply,
) {
  return reply.send(await mailService.deleteMail(playerIdOf(request), request.params.mailId));
}

export async function deleteClaimed(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await mailService.deleteClaimed(playerIdOf(request)));
}
