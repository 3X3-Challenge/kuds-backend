import type { FastifyReply, FastifyRequest } from "fastify";
import * as authService from "./auth.service";
import type { RegisterInput, LoginInput, RefreshInput, ResetPasswordInput } from "./auth.schema";

export async function register(
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply,
) {
  const result = await authService.register(request.body, request.headers["user-agent"]);
  return reply.code(201).send(result);
}

export async function login(
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply,
) {
  const result = await authService.login(request.body, request.headers["user-agent"]);
  return reply.send(result);
}

export async function refresh(
  request: FastifyRequest<{ Body: RefreshInput }>,
  reply: FastifyReply,
) {
  const result = await authService.refresh(request.body, request.headers["user-agent"]);
  return reply.send(result);
}

export async function logout(
  request: FastifyRequest<{ Body: RefreshInput }>,
  reply: FastifyReply,
) {
  await authService.logout(request.body);
  return reply.code(204).send();
}

export async function resetPassword(
  request: FastifyRequest<{ Body: ResetPasswordInput }>,
  reply: FastifyReply,
) {
  const result = await authService.resetPassword(request.body);
  return reply.send(result);
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  const result = await authService.getCurrentUser(request.userId!);
  return reply.send(result);
}
