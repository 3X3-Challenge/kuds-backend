import { Prisma } from "@prisma/client";

/**
 * JSON.stringify ném TypeError khi gặp BigInt, và Fastify serialize bằng
 * JSON.stringify. Rất nhiều khoá chính ở đây là bigint (mailId, bundleId,
 * pullId...), nên không vá chỗ này thì mọi route chạm tới chúng đều nổ 500.
 *
 * Chọn CHUỖI chứ không phải số: bigint tràn Number.MAX_SAFE_INTEGER thì
 * JSON.parse bên client làm tròn im lặng, và id sai một đơn vị là id của người
 * khác. Chỗ nào chắc chắn vừa số (số dư ví, tiến độ nhiệm vụ) thì DTO tự gọi
 * `toNumber()` bên dưới — cố ý phải khai báo tường minh từng chỗ.
 *
 * Gọi một lần lúc khởi động, trước khi có request đầu tiên.
 */
export function installBigIntSerializer(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function toJSON(this: bigint) {
    return this.toString();
  };
}

/**
 * bigint → number cho những đại lượng chắc chắn nằm trong khoảng an toàn
 * (số dư ví, số lượng, tiến độ). Ném lỗi thay vì làm tròn nếu vượt ngưỡng —
 * im lặng làm tròn số dư tiền là kiểu bug không ai phát hiện ra cho tới lúc
 * đối soát.
 */
export function toNumber(value: bigint | number): number {
  if (typeof value === "number") return value;
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Giá trị ${value} vượt quá khoảng số an toàn của JavaScript`);
  }
  return Number(value);
}

/** Prisma.Decimal (bonus_multiplier) → number. Hệ số nhân luôn nhỏ, không sợ mất chính xác. */
export function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}
