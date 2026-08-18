import type { FastifyRequest } from "fastify";
import { verifyAccessToken } from "../common/utils/token.util";
import { UnauthorizedError } from "../common/errors";
import "../common/types/fastify";

/**
 * preHandler cho route cần đăng nhập. Đặt cả playerId lẫn accountId để tầng dưới
 * không phải join ngược từ token về DB chỉ để biết mình là ai.
 */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Thiếu bearer token");
  }

  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError("Token không hợp lệ hoặc đã hết hạn");
  }

  // Token ký trước khi đổi sang lược đồ game.* không có `acc`. Từ chối thẳng
  // thay vì để accountId là undefined rồi vỡ ở đâu đó sâu bên trong service.
  if (!payload.sub || !payload.acc) {
    throw new UnauthorizedError("Token không hợp lệ hoặc đã hết hạn");
  }

  request.playerId = payload.sub;
  request.accountId = payload.acc;
}

/** Đọc playerId đã được `requireAuth` đặt. Ném nếu route quên gắn preHandler. */
export function playerIdOf(request: FastifyRequest): string {
  if (!request.playerId) {
    throw new Error("Route thiếu preHandler requireAuth");
  }
  return request.playerId;
}

export function accountIdOf(request: FastifyRequest): string {
  if (!request.accountId) {
    throw new Error("Route thiếu preHandler requireAuth");
  }
  return request.accountId;
}
