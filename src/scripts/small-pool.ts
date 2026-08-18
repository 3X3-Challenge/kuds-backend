/**
 * Thu nhỏ pool kết nối xuống 1. Import module NÀY ĐẦU TIÊN trong mọi kịch bản CLI.
 *
 *   import "./small-pool";                      // phải nằm trên
 *   import { prisma } from "../core/database/prisma";
 *
 * Vì sao cần: Supabase session pooler chỉ cho 15 client cho cả project.
 * config/database.ts đặt connection_limit=10 — hợp lý cho server, nhưng chết cho
 * một kịch bản chạy cạnh `npm run dev` (đang giữ 10 kết nối) hoặc Prisma Studio.
 * Cộng lại vượt trần và Postgres trả về:
 *
 *   FATAL: (EMAXCONNSESSION) max clients reached in session mode
 *
 * Kịch bản chạy một phát rồi thoát thì không cần song song. Đặt connection_limit
 * ngay trong chuỗi kết nối để withPoolDefaults thấy đã có sẵn mà không ghi đè —
 * Prisma sẽ XẾP HÀNG các truy vấn trên một kết nối. Chậm hơn vài giây, đổi lại
 * không phải tắt server đang chạy dở.
 *
 * Thứ tự import là tất cả: TypeScript giữ nguyên thứ tự `require` theo mã nguồn,
 * nên module này chạy trước khi config/env.ts kịp đọc DATABASE_URL.
 */
import "dotenv/config";

const raw = process.env.DATABASE_URL;

if (raw) {
  try {
    const url = new URL(raw);
    url.searchParams.set("connection_limit", "1");
    // Xếp hàng trên một kết nối thì hàng dài hơn, cho chờ thoải mái.
    url.searchParams.set("pool_timeout", "60");
    process.env.DATABASE_URL = url.toString();
  } catch {
    // URL không parse được thì để nguyên; thông báo lỗi của Prisma rõ hơn.
  }
}
