# 3x3 Ký Ức Di Sản — Backend

Auth + game-progress API cho game "3x3 Ký Ức Di Sản" (Node.js + TypeScript + Fastify + Prisma + PostgreSQL).

## Setup

```bash
npm install
cp .env.example .env   # rồi điền DATABASE_URL / DIRECT_URL và JWT_SECRET thật
npm run prisma:deploy  # áp migration lên DB theo prisma/schema.prisma
npm run prisma:generate
npm run dev             # chạy dev server với hot-reload (http://localhost:3000)
```

DB đang dùng **Supabase Postgres** (region `ap-southeast-1`), kết nối qua **Session pooler** port 5432 — pooler chạy trên IPv4, còn direct connection `db.<ref>.supabase.co` chỉ có bản ghi AAAA nên đa số mạng ở VN không tới được.

`DATABASE_URL` (runtime) và `DIRECT_URL` (Prisma CLI) đặt giống nhau, đều trỏ vào session pooler.

### Migration trên Supabase

Dùng `prisma:deploy`, **không** dùng `prisma:migrate` — `prisma migrate dev` cần tạo shadow database mà user `postgres` của Supabase không có quyền `CREATE DATABASE`. Quy trình khi đổi `schema.prisma`:

```bash
npx prisma migrate dev --create-only --name <tên>  # chỉ sinh file SQL, không đụng DB
npm run prisma:deploy                              # áp lên Supabase
```

### RLS

Bảng do Prisma tạo nằm trong schema `public`, mà Supabase tự expose schema này ra REST API qua anon key. Vì vậy cả 4 bảng (`users`, `sessions`, `user_progress`, `_prisma_migrations`) đã **bật RLS và không có policy nào** — chặn sạch truy cập từ role `anon`/`authenticated`. Backend không ảnh hưởng vì Prisma kết nối bằng role `postgres` (chủ sở hữu bảng, Postgres không áp RLS lên owner). Khi thêm bảng mới bằng migration, nhớ `alter table ... enable row level security` cho bảng đó.

## Scripts

- `npm run dev` — chạy server dev (tsx watch)
- `npm run build` — build ra `dist/`
- `npm start` — chạy bản build (`dist/server.js`)
- `npm run typecheck` — kiểm tra type không build
- `npm run prisma:deploy` — áp các migration đã có lên DB (dùng cái này với Supabase)
- `npm run prisma:migrate` — tạo + áp migration (chỉ dùng khi trỏ vào Postgres local)
- `npm run prisma:studio` — mở Prisma Studio để xem/sửa data

## Auth model

Tài khoản dùng **username + password**, không có email. Vì vậy không thể tự động gửi email để reset mật khẩu — thay vào đó, mỗi user có một **recovery code** (được trả về đúng một lần khi đăng ký hoặc reset mật khẩu). Client bắt buộc phải nhắc người dùng lưu lại code này ngay khi nhận được — mất code này đồng nghĩa mất khả năng tự khôi phục tài khoản.

Access token là JWT sống ngắn (mặc định 15 phút). Refresh token là chuỗi ngẫu nhiên, chỉ lưu bản hash (SHA-256) trong bảng `sessions`, sống dài hơn (mặc định 30 ngày) và được rotate (thu hồi + cấp lại) mỗi lần dùng.

## API

| Method | Path                   | Auth  | Mô tả |
|--------|------------------------|-------|-------|
| POST   | `/auth/register`       | -     | Tạo tài khoản, trả về `recoveryCode` (chỉ hiện 1 lần) + token |
| POST   | `/auth/login`          | -     | Đăng nhập, trả về access + refresh token |
| POST   | `/auth/google`         | -     | Đăng nhập bằng Google ID token; chưa có tài khoản thì tạo luôn (`isNewAccount: true`) |
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
