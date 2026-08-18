import * as adminRepository from "./admin-auth.repository";
import { hashPassword, verifyPassword } from "../../common/utils/password.util";
import { signAdminToken } from "../../common/utils/token.util";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../common/errors";
import type { AdminContext } from "../../common/types/fastify";
import type { AdminLoginInput, CreateAdminInput, UpdateAdminInput } from "./admin-auth.schema";

export async function login(input: AdminLoginInput) {
  const [row] = await adminRepository.findByEmail(input.email);

  // Email sai và mật khẩu sai trả cùng một câu — không xác nhận cho người ngoài
  // biết email nào có tài khoản quản trị.
  if (!row) {
    throw new UnauthorizedError("Sai email hoặc mật khẩu");
  }

  const valid = await verifyPassword(input.password, row.password_hash);
  if (!valid) {
    throw new UnauthorizedError("Sai email hoặc mật khẩu");
  }

  // isActive kiểm ở ĐÂY, lúc phát token. Sau đó token sống tới hết hạn dù tài
  // khoản có bị vô hiệu hoá — xem ghi chú ở admin.middleware.ts.
  if (!row.is_active) {
    throw new ForbiddenError("Tài khoản quản trị đã bị vô hiệu hoá");
  }

  const role = row.role as AdminContext["role"];
  const admin = await adminRepository.touchLastLogin(row.admin_id);

  return {
    token: signAdminToken({ sub: row.admin_id, email: row.email, role }),
    admin,
  };
}

export async function getCurrent(adminId: string) {
  const admin = await adminRepository.findById(adminId);
  if (!admin) {
    throw new NotFoundError("Không tìm thấy tài khoản quản trị");
  }
  return admin;
}

export function listAdmins() {
  return adminRepository.listAdmins();
}

export async function createAdmin(input: CreateAdminInput) {
  try {
    return await adminRepository.createAdmin({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName,
      role: input.role,
    });
  } catch (err) {
    // Trùng ở đây chỉ có thể là email (UNIQUE + unique index lower(email)).
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      throw new ConflictError("Email này đã có tài khoản quản trị");
    }
    throw err;
  }
}

/**
 * Sửa một tài khoản quản trị.
 *
 * Chặn hạ cấp/vô hiệu hoá publisher CUỐI CÙNG còn hoạt động. Không có chốt này
 * thì một cú bấm nhầm là không còn ai bấm được nút Xuất bản, và đường sửa duy
 * nhất là chạy SQL tay lên production.
 */
export async function updateAdmin(
  adminId: string,
  input: UpdateAdminInput,
  actor: AdminContext,
) {
  const target = await adminRepository.findById(adminId);
  if (!target) {
    throw new NotFoundError("Không tìm thấy tài khoản quản trị");
  }

  const losingPublisher =
    target.role === "publisher" &&
    target.isActive &&
    ((input.role !== undefined && input.role !== "publisher") || input.isActive === false);

  if (losingPublisher && (await adminRepository.countActivePublishers()) <= 1) {
    throw new ConflictError(
      "Đây là publisher hoạt động cuối cùng — tạo publisher khác trước khi đổi tài khoản này",
    );
  }

  // Tự vô hiệu hoá chính mình cũng là cách khoá cửa nhốt mình bên ngoài.
  if (adminId === actor.adminId && input.isActive === false) {
    throw new ConflictError("Không thể tự vô hiệu hoá tài khoản của chính mình");
  }

  return adminRepository.updateAdmin(adminId, {
    displayName: input.displayName,
    role: input.role,
    isActive: input.isActive,
    passwordHash: input.password ? await hashPassword(input.password) : undefined,
  });
}
