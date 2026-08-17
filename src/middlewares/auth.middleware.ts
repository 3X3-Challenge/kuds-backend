import type { FastifyRequest } from "fastify";
import { verifyAccessToken } from "../common/utils/token.util";
import { UnauthorizedError } from "../common/errors";
import "../common/types/fastify";

/** preHandler for routes that require a valid access token. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    request.userId = payload.sub;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
