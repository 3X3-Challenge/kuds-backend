/**
 * Tạo tài khoản quản trị đầu tiên.
 *
 *   npm run admin:create -- <email> <mật khẩu> [viewer|editor|publisher] ["Tên hiển thị"]
 *
 * Bài toán con gà và quả trứng: POST /admin/admins cần token publisher, mà token
 * publisher cần một tài khoản publisher đã tồn tại. Kịch bản này là đường vào
 * duy nhất, và nó chạy trên máy có DATABASE_URL — tức là người chạy đã có quyền
 * ghi thẳng vào DB rồi, không mở thêm cửa nào.
 *
 * Email đã tồn tại thì ĐỔI MẬT KHẨU của tài khoản đó thay vì lỗi, để dùng luôn
 * làm đường khôi phục khi quên mật khẩu quản trị.
 */
import { prisma } from "../core/database/prisma";
import { hashPassword } from "../common/utils/password.util";
import { ADMIN_ROLES } from "../modules/admin/admin-auth.schema";

async function main() {
  const [email, password, roleArg, displayName] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      'Cách dùng: npm run admin:create -- <email> <mật khẩu> [viewer|editor|publisher] ["Tên hiển thị"]',
    );
    process.exit(1);
  }

  const role = roleArg ?? "publisher";
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
    console.error(`Vai trò không hợp lệ: ${role}. Chọn một trong: ${ADMIN_ROLES.join(", ")}`);
    process.exit(1);
  }

  if (password.length < 10) {
    console.error("Mật khẩu quản trị phải có ít nhất 10 ký tự.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  // Khớp theo lower(email) để không tạo ra "A@x.com" và "a@x.com" là hai tài
  // khoản — unique index admin_user_email_ci sẽ chặn, nhưng báo lỗi khó hiểu.
  const [existing] = await prisma.$queryRaw<{ admin_id: string }[]>`
    SELECT admin_id::text AS admin_id FROM admin.admin_user WHERE lower(email) = lower(${email})
  `;

  if (existing) {
    await prisma.adminUser.update({
      where: { adminId: existing.admin_id },
      data: {
        passwordHash,
        role,
        isActive: true,
        ...(displayName ? { displayName } : {}),
      },
    });
    console.log(`Đã cập nhật tài khoản quản trị ${email} (vai trò: ${role}).`);
  } else {
    const created = await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        role,
        displayName: displayName ?? email.split("@")[0]!,
      },
      select: { adminId: true },
    });
    console.log(`Đã tạo tài khoản quản trị ${email} (vai trò: ${role}, id: ${created.adminId}).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
