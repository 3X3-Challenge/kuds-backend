import type { FastifyReply, FastifyRequest } from "fastify";
import * as opsService from "./admin-ops.service";
import { listAudit } from "./admin-audit.service";
import { adminOf } from "../../middlewares/admin.middleware";
import type { AuditQuery, PublishInput } from "./admin-ops.schema";

export async function dashboard(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await opsService.dashboard());
}

export async function getState(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await opsService.getState());
}

export async function preflight(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await opsService.preflight());
}

export async function publish(
  request: FastifyRequest<{ Body: PublishInput }>,
  reply: FastifyReply,
) {
  const result = await opsService.publish(request.body, {
    admin: adminOf(request),
    ipAddress: request.ip || null,
  });
  return reply.send(result);
}

export async function audit(
  request: FastifyRequest<{ Querystring: AuditQuery }>,
  reply: FastifyReply,
) {
  const { limit, cursor, tableName, rowKey, adminId } = request.query;
  return reply.send(
    await listAudit({
      limit,
      cursor: cursor ? BigInt(cursor) : undefined,
      tableName,
      rowKey,
      adminId,
    }),
  );
}
