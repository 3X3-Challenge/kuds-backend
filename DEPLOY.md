# Deploy lên Render (gói free)

Hướng dẫn đưa backend này lên internet để build game gửi cho người khác chơi.
DB đã nằm sẵn trên Supabase nên **không** cần deploy database.

Chọn Render vì đây là host free duy nhất có region **Singapore** — cùng vùng với
Supabase (`ap-southeast-1`). Koyeb free chỉ có Frankfurt/Washington, mỗi truy vấn
DB sẽ đi vòng nửa vòng trái đất.

---

## 0. Đẩy code lên GitHub (BẮT BUỘC làm trước)

Render build từ GitHub, không phải từ máy bạn. Kiểm tra:

```bash
git status --short
```

Nếu còn file chưa commit thì Render sẽ dựng lên bản code cũ. Commit và đẩy lên
nhánh `main`:

```bash
git add -A
git commit -m "..."
git push origin main
```

> `.env` đã nằm trong `.gitignore` — bí mật không lên GitHub. Đúng như vậy.
> Các giá trị bí mật sẽ điền thẳng trên Dashboard của Render ở bước 2.

---

## 1. Tạo service trên Render

1. Đăng ký tại https://render.com (đăng nhập bằng GitHub là nhanh nhất).
2. **New > Blueprint**, chọn repo `kuds-backend`.
3. Render đọc `render.yaml` ở gốc repo và dựng sẵn service `kuds-backend`:
   region Singapore, gói free, build `npm ci --include=dev && npm run build`,
   chạy `npm start`, health check `/health`.
4. Bấm **Apply**.

Lần build đầu sẽ **fail** vì chưa có biến môi trường — bình thường, sang bước 2.

---

## 2. Điền biến môi trường

Vào service > **Environment**. `JWT_SECRET` và `ADMIN_JWT_SECRET` Render đã tự
sinh ngẫu nhiên (khai báo `generateValue: true`), không cần đụng tới. Bốn biến
còn lại phải tự điền:

| Biến | Lấy ở đâu |
|---|---|
| `DATABASE_URL` | Copy từ `.env` ở máy bạn (chuỗi Supabase Session pooler, port 5432) |
| `DIRECT_URL` | Giống hệt `DATABASE_URL` |
| `GOOGLE_CLIENT_IDS` | Google Cloud Console > Credentials. Nhiều ID ngăn bằng dấu phẩy |
| `CORS_ORIGINS` | URL của trang quản trị. Chưa deploy trang này thì tạm để `http://localhost:3001` |

> **Không** đặt `PORT` — Render tự cấp và `src/config/env.ts` đã đọc `process.env.PORT`.

Điền xong bấm **Save**, Render tự build lại. Xong sẽ có URL dạng
`https://kuds-backend-xxxx.onrender.com`.

Kiểm tra:

```bash
curl https://kuds-backend-xxxx.onrender.com/health
# {"status":"ok"}
```

---

## 3. Áp migration lên Supabase

Chạy **từ máy bạn**, không phải trên Render (build của Render không chạy migration
— cố ý, để một lần deploy hỏng không làm biến dạng DB):

```bash
npm run prisma:deploy
```

---

## 4. Chống ngủ

Gói free của Render **tắt service sau 15 phút không có request**, request kế tiếp
phải chờ khoảng 1 phút để dậy. Người chơi mở game sẽ tưởng bị treo.

Cách xử lý: dùng https://cron-job.org (miễn phí) tạo một job gọi
`https://kuds-backend-xxxx.onrender.com/health` mỗi **10 phút**.

Số học của quota: chạy 24/7 tốn khoảng 730 giờ/tháng, quota free là **750 giờ mỗi
workspace**. Vẫn lọt — nhưng chỉ khi đây là service free **duy nhất** trong
workspace đó. Thêm service free thứ hai là cả hai cùng bị treo giữa tháng.

Nếu game có người chơi thật và thấy giật: nâng lên gói $7/tháng, hết ngủ luôn và
không cần cron.

---

## 5. Tạo tài khoản quản trị

```bash
npm run admin:create
```

Script chạy ở máy bạn nhưng ghi vào Supabase, nên tài khoản dùng được ngay trên
production.

---

## 6. Trỏ Unity vào URL production

Client Unity đọc base URL từ config, đổi từ `http://localhost:3000` sang
`https://kuds-backend-xxxx.onrender.com`. **Bắt buộc dùng `https://`** — iOS chặn
HTTP thẳng (App Transport Security).

---

## Build lỗi thì xem gì

| Triệu chứng | Nguyên nhân |
|---|---|
| `tsc: not found` / `prisma: not found` | Thiếu `--include=dev` trong build command. `NODE_ENV=production` làm `npm ci` bỏ qua devDependencies |
| `Missing required environment variable: DATABASE_URL` | Chưa điền env ở bước 2 |
| `Can't reach database server` | Dùng nhầm host `db.<ref>.supabase.co` (chỉ có IPv6). Phải dùng Session pooler `aws-*.pooler.supabase.com:5432` |
| Request đầu chờ ~1 phút | Service đã ngủ. Xem bước 4 |
