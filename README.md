# 3x3 Ký Ức Di Sản — Backend

Auth + game-progress API cho game "3x3 Ký Ức Di Sản" (Node.js + TypeScript + Fastify + Prisma + PostgreSQL).

## Setup

```bash
npm install
cp .env.example .env   # rồi điền DATABASE_URL và JWT_SECRET thật
npm run prisma:migrate # tạo bảng trong PostgreSQL theo prisma/schema.prisma
npm run dev             # chạy dev server với hot-reload (http://localhost:3000)
```

Yêu cầu: PostgreSQL đang chạy và `DATABASE_URL` trong `.env` trỏ đúng tới nó.

## Scripts

- `npm run dev` — chạy server dev (tsx watch)
- `npm run build` — build ra `dist/`
- `npm start` — chạy bản build (`dist/server.js`)
- `npm run typecheck` — kiểm tra type không build
- `npm run prisma:migrate` — tạo/áp migration mới từ `prisma/schema.prisma`
- `npm run prisma:studio` — mở Prisma Studio để xem/sửa data

## Auth model

Tài khoản dùng **username + password**, không có email. Vì vậy không thể tự động gửi email để reset mật khẩu — thay vào đó, mỗi user có một **recovery code** (được trả về đúng một lần khi đăng ký hoặc reset mật khẩu). Client bắt buộc phải nhắc người dùng lưu lại code này ngay khi nhận được — mất code này đồng nghĩa mất khả năng tự khôi phục tài khoản.

Access token là JWT sống ngắn (mặc định 15 phút). Refresh token là chuỗi ngẫu nhiên, chỉ lưu bản hash (SHA-256) trong bảng `sessions`, sống dài hơn (mặc định 30 ngày) và được rotate (thu hồi + cấp lại) mỗi lần dùng.

## API

| Method | Path                   | Auth  | Mô tả |
|--------|------------------------|-------|-------|
| POST   | `/auth/register`       | -     | Tạo tài khoản, trả về `recoveryCode` (chỉ hiện 1 lần) + token |
| POST   | `/auth/login`          | -     | Đăng nhập, trả về access + refresh token |
| POST   | `/auth/refresh`        | -     | Đổi refresh token cũ lấy cặp token mới |
| POST   | `/auth/logout`         | -     | Thu hồi một refresh token (đăng xuất khỏi thiết bị đó) |
| POST   | `/auth/reset-password` | -     | Đổi mật khẩu bằng `recoveryCode`, cấp `recoveryCode` mới, đăng xuất mọi thiết bị |
| GET    | `/auth/me`             | Bearer access token | Lấy hồ sơ user hiện tại |
| GET    | `/health`              | -     | Health check |

Gọi các route cần auth bằng header `Authorization: Bearer <accessToken>`.

## Chưa làm (theo dõi tiếp)

- Model/route cho `UserProgress` (điểm số, tiến trình theo `stageId`) đã có sẵn trong `prisma/schema.prisma` nhưng chưa có route CRUD.
- Rate limiting cho `/auth/login` và `/auth/register` để chống brute-force.
- CI/build pipeline.
