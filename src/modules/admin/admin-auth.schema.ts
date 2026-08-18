import { z } from "zod";

export const ADMIN_ROLES = ["viewer", "editor", "publisher"] as const;

const email = z.string().email("Email không hợp lệ").max(254);
const password = z
  .string()
  .min(10, "Mật khẩu quản trị phải có ít nhất 10 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

export const adminLoginSchema = z.object({
  email,
  password: z.string().min(1),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const createAdminSchema = z.object({
  email,
  password,
  displayName: z.string().trim().max(64).default(""),
  role: z.enum(ADMIN_ROLES),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const updateAdminSchema = z
  .object({
    displayName: z.string().trim().max(64).optional(),
    role: z.enum(ADMIN_ROLES).optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Không có gì để cập nhật");
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;

export const adminIdParamsSchema = z.object({
  adminId: z.string().uuid("adminId phải là UUID"),
});
export type AdminIdParams = z.infer<typeof adminIdParamsSchema>;
