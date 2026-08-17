import type { FastifyError, FastifyInstance } from "fastify";
import { AppError } from "../common/errors";

export function errorMiddleware(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.details });
    }

    // Fastify's own errors (malformed JSON, payload too large, etc.) carry a statusCode.
    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });
}
