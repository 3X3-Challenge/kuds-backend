import type { FastifyReply, FastifyRequest } from "fastify";
import * as contentAdminService from "./admin-content.service";
import { adminOf } from "../../middlewares/admin.middleware";
import { BadRequestError } from "../../common/errors";
import type { ListQuery, ResourceIdParams, ResourceParams } from "./admin-content.schema";

/**
 * Thân request được validate ở ĐÂY chứ không bằng preHandler `validateBody`:
 * schema phụ thuộc vào `:resource` trên URL, mà preHandler thì phải chọn schema
 * lúc đăng ký route, trước khi biết URL thật.
 */
function parseBody(resource: string, kind: "create" | "update", body: unknown) {
  const parsed = contentAdminService.schemasFor(resource)[kind].safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.flatten());
  }
  return parsed.data as Record<string, unknown>;
}

/** IP để ghi vào audit_log.ip_address. Sau reverse proxy thì Fastify cần bật trustProxy. */
function actorOf(request: FastifyRequest): contentAdminService.ActorInfo {
  return { admin: adminOf(request), ipAddress: request.ip || null };
}

export async function listResourceTypes(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(contentAdminService.listResourceTypes());
}

export async function list(
  request: FastifyRequest<{ Params: ResourceParams; Querystring: ListQuery }>,
  reply: FastifyReply,
) {
  const result = await contentAdminService.list(request.params.resource, request.query);
  return reply.send(result);
}

export async function findOne(
  request: FastifyRequest<{ Params: ResourceIdParams }>,
  reply: FastifyReply,
) {
  const result = await contentAdminService.findOne(request.params.resource, request.params.id);
  return reply.send(result);
}

export async function create(
  request: FastifyRequest<{ Params: ResourceParams }>,
  reply: FastifyReply,
) {
  const { resource } = request.params;
  const body = parseBody(resource, "create", request.body);
  const result = await contentAdminService.create(resource, body, actorOf(request));
  return reply.code(201).send(result);
}

export async function update(
  request: FastifyRequest<{ Params: ResourceIdParams }>,
  reply: FastifyReply,
) {
  const { resource, id } = request.params;
  const body = parseBody(resource, "update", request.body);
  const result = await contentAdminService.update(resource, id, body, actorOf(request));
  return reply.send(result);
}

export async function archive(
  request: FastifyRequest<{ Params: ResourceIdParams }>,
  reply: FastifyReply,
) {
  const result = await contentAdminService.archive(
    request.params.resource,
    request.params.id,
    actorOf(request),
  );
  return reply.send(result);
}
