import { prisma } from "../../core/database/prisma";

/** Không bao giờ có passwordHash trong danh sách trả về API. */
export const ADMIN_PUBLIC_SELECT = {
  adminId: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

/**
 * Tra bằng lower(email) để khớp unique index admin_user_email_ci. Người gõ
 * "Admin@x.com" ở form đăng nhập phải vào đúng tài khoản "admin@x.com".
 */
export function findByEmail(email: string) {
  return prisma.$queryRaw<
    {
      admin_id: string;
      email: string;
      display_name: string;
      password_hash: string;
      role: string;
      is_active: boolean;
    }[]
  >`
    SELECT admin_id::text AS admin_id, email, display_name, password_hash, role, is_active
      FROM admin.admin_user
     WHERE lower(email) = lower(${email})
  `;
}

export function touchLastLogin(adminId: string) {
  return prisma.adminUser.update({
    where: { adminId },
    data: { lastLoginAt: new Date() },
    select: ADMIN_PUBLIC_SELECT,
  });
}

export function listAdmins() {
  return prisma.adminUser.findMany({
    select: ADMIN_PUBLIC_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export function findById(adminId: string) {
  return prisma.adminUser.findUnique({
    where: { adminId },
    select: ADMIN_PUBLIC_SELECT,
  });
}

export function createAdmin(data: {
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
}) {
  return prisma.adminUser.create({ data, select: ADMIN_PUBLIC_SELECT });
}

export function updateAdmin(
  adminId: string,
  data: { displayName?: string; role?: string; isActive?: boolean; passwordHash?: string },
) {
  return prisma.adminUser.update({
    where: { adminId },
    data,
    select: ADMIN_PUBLIC_SELECT,
  });
}

/** Còn bao nhiêu publisher đang hoạt động — dùng để không tự khoá hết đường vào. */
export function countActivePublishers() {
  return prisma.adminUser.count({ where: { role: "publisher", isActive: true } });
}
