import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";
import { BadRequestError } from "../common/errors";

/** preHandler factory: validates request.body against `schema`, then replaces
 *  request.body with the parsed (typed, defaulted) result. */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return async function validate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

/**
 * Như validateBody nhưng cho query string. Query luôn là chuỗi, nên schema phải
 * dùng z.coerce cho số/boolean — quên là `page=2` thành chuỗi "2" và mọi phép
 * tính phân trang lệch.
 */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return async function validate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.flatten());
    }
    request.query = parsed.data;
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T) {
  return async function validate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.flatten());
    }
    request.params = parsed.data;
  };
}
