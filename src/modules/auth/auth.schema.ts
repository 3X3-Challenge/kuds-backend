import { z } from "zod";

const username = z
  .string()
  .min(3, "Username phải có ít nhất 3 ký tự")
  .max(32, "Username tối đa 32 ký tự")
  .regex(/^[a-zA-Z0-9_]+$/, "Username chỉ gồm chữ, số và dấu gạch dưới");

const password = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

export const registerSchema = z.object({
  username,
  password,
  displayName: z.string().min(1).max(64).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username,
  password,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const resetPasswordSchema = z.object({
  username,
  recoveryCode: z.string().min(1),
  newPassword: password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
