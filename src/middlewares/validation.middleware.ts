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
