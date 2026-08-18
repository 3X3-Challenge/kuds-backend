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

/**
 * game.player.display_name là NOT NULL và unique không phân biệt hoa thường, nên
 * bỏ trống thì server lấy username làm tên. Cấm khoảng trắng đầu/cuối để "An "
 * và "An" không thành hai người khác nhau trên bảng xếp hạng.
 */
const displayName = z
  .string()
  .trim()
  .min(1, "Tên hiển thị không được để trống")
  .max(64, "Tên hiển thị tối đa 64 ký tự");

export const registerSchema = z.object({
  username,
  password,
  displayName: displayName.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username,
  password,
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * ID token của Google, client tự lấy bằng SDK rồi gửi lên. Chặn trần độ dài vì
 * một ID token thật chỉ khoảng 1KB — chuỗi dài hơn nhiều là rác, và không có lý
 * do gì để đem nó đi giải mã.
 */
export const googleLoginSchema = z.object({
  idToken: z.string().min(1, "Thiếu Google ID token").max(4096, "Google ID token không hợp lệ"),
});
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

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

export const updateProfileSchema = z.object({
  displayName: displayName.optional(),
  avatarUrl: z.string().url().max(512).nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
