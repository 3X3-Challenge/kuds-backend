import type { FastifyRequest } from "fastify";
import { verifyAdminToken } from "../common/utils/token.util";
import { ForbiddenError, UnauthorizedError } from "../common/errors";
import type { AdminContext } from "../common/types/fastify";
import "../common/types/fastify";

/** viewer ⊂ editor ⊂ publisher. Số lớn hơn làm được mọi thứ của số nhỏ hơn. */
const ROLE_RANK: Record<AdminContext["role"], number> = {
  viewer: 0,
  editor: 1,
  publisher: 2,
};

/**
 * preHandler factory cho route quản trị. `minRole` là quyền TỐI THIỂU:
 *   viewer    — mọi route chỉ đọc
 *   editor    — tạo/sửa/lưu trữ bản nháp
 *   publisher — bấm Xuất bản, quản lý tài khoản admin, thao tác lên người chơi
 *
 * Không kiểm `isActive` ở đây: token đã phát thì sống tới hết hạn. Vô hiệu hoá
 * một admin ngay lập tức thì phải đổi ADMIN_JWT_SECRET (thu hồi toàn bộ token).
 * Với một trang quản trị nội bộ dùng token 8h, đánh đổi này chấp nhận được và
 * đổi lại là không phải truy vấn DB mỗi request.
 */
export function requireAdmin(minRole: AdminContext["role"] = "viewer") {
  return async function checkAdmin(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Thiếu bearer token");
    }

    let payload;
    try {
      payload = verifyAdminToken(header.slice("Bearer ".length));
    } catch {
      throw new UnauthorizedError("Token quản trị không hợp lệ hoặc đã hết hạn");
    }

    if (ROLE_RANK[payload.role] === undefined) {
      throw new UnauthorizedError("Token quản trị không hợp lệ hoặc đã hết hạn");
    }

    if (ROLE_RANK[payload.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenError(`Thao tác này cần quyền ${minRole} trở lên`);
    }

    request.admin = { adminId: payload.sub, email: payload.email, role: payload.role };
  };
}

export function adminOf(request: FastifyRequest): AdminContext {
  if (!request.admin) {
    throw new Error("Route thiếu preHandler requireAdmin");
  }
  return request.admin;
}
