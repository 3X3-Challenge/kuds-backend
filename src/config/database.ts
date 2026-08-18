import { env } from "./env";

/**
 * Supabase session pooler chỉ cho tối đa 15 client đồng thời (pool_size: 15).
 * Prisma mặc định mở `số nhân CPU * 2 + 1` kết nối — trên máy 8 nhân là 17, tức
 * là vượt trần ngay khi có vài request chạy song song, và lỗi trả về không nói
 * gì về Prisma cả:
 *
 *   FATAL: (EMAXCONNSESSION) max clients reached in session mode
 *
 * Đặt connection_limit thấp hơn trần của pooler thì Prisma XẾP HÀNG thay vì mở
 * thêm kết nối. Chậm hơn một chút lúc cao điểm, nhưng không sập.
 *
 * Chừa 5 kết nối cho Prisma CLI (migrate, studio) và cho các tiến trình khác
 * cùng dùng chung project Supabase này.
 */
const POOL_DEFAULTS: Record<string, string> = {
  connection_limit: "10",
  // Chờ tối đa 20s để tới lượt trước khi báo lỗi. Mặc định 10s là hơi ngắn cho
  // những endpoint bắn nhiều truy vấn song song (dashboard, preflight).
  pool_timeout: "20",
};

/**
 * Thêm tham số vào chuỗi kết nối nếu .env chưa tự đặt. Đặt tay trong .env luôn
 * thắng — đây chỉ là mặc định an toàn, không phải luật.
 */
function withPoolDefaults(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const [param, value] of Object.entries(POOL_DEFAULTS)) {
      if (!url.searchParams.has(param)) {
        url.searchParams.set(param, value);
      }
    }
    return url.toString();
  } catch {
    // DATABASE_URL không parse được thì để nguyên và cho Prisma tự báo lỗi —
    // thông báo của nó rõ hơn bất cứ thứ gì mình bịa ra ở đây.
    return rawUrl;
  }
}

export const databaseConfig = {
  url: withPoolDefaults(env.databaseUrl),
};
