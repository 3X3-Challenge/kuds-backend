import type { FastifyReply, FastifyRequest } from "fastify";
import * as adminAuthService from "./admin-auth.service";
import { adminOf } from "../../middlewares/admin.middleware";
import type {
  AdminIdParams,
  AdminLoginInput,
  CreateAdminInput,
  UpdateAdminInput,
} from "./admin-auth.schema";

export async function login(
  request: FastifyRequest<{ Body: AdminLoginInput }>,
  reply: FastifyReply,
) {
  return reply.send(await adminAuthService.login(request.body));
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await adminAuthService.getCurrent(adminOf(request).adminId));
}

export async function listAdmins(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await adminAuthService.listAdmins());
}

export async function createAdmin(
  request: FastifyRequest<{ Body: CreateAdminInput }>,
  reply: FastifyReply,
) {
  return reply.code(201).send(await adminAuthService.createAdmin(request.body));
}

export async function updateAdmin(
  request: FastifyRequest<{ Params: AdminIdParams; Body: UpdateAdminInput }>,
  reply: FastifyReply,
) {
  const result = await adminAuthService.updateAdmin(
    request.params.adminId,
    request.body,
    adminOf(request),
  );
  return reply.send(result);
}
