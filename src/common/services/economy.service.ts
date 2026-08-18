import { Prisma, type CurrencyCode, type LedgerReason } from "@prisma/client";
import { UnprocessableError } from "../errors";

/**
 * Nguyên thuỷ kinh tế: cộng/trừ tiền và vật phẩm. MỌI đường trả thưởng của game
 * (thư, nhiệm vụ, thành tựu, gacha, nông trại) đều đi qua đây, không nơi nào
 * được tự viết UPDATE wallet.
 *
 * Ba quy tắc bất di bất dịch:
 *
 *  1. Đổi số dư thì PHẢI ghi một dòng game.currency_ledger trong CÙNG transaction.
 *     Sổ cái là thứ duy nhất trả lời được "tiền này ở đâu ra". Job đối soát hằng
 *     đêm kiểm `wallet.balance = SUM(ledger.delta)`; lệch nghĩa là ai đó đã đi
 *     đường tắt quanh file này.
 *
 *  2. Mọi hàm ở đây nhận `tx` chứ không tự mở transaction. Người gọi mới biết
 *     phạm vi đúng: "nhận thư" là đổi trạng thái thư + cộng tiền + cộng đồ, cả
 *     ba phải cùng sống hoặc cùng chết.
 *
 *  3. Không tin số truyền vào là dương. amount <= 0 ném lỗi lập trình ngay, chứ
 *     để lọt xuống thì CHECK (delta <> 0) của DB báo một lỗi khó hiểu hơn nhiều.
 */

export type TxClient = Prisma.TransactionClient;

export interface LedgerRef {
  reason: LedgerReason;
  /** purchase_order | mail | gacha_pull | player_quest | player_achievement */
  refType?: string;
  refId?: string;
  /**
   * Khoá chống cộng hai lần. Unique index bộ phận (player_id, idempotency_key)
   * biến lần gọi lại thành lỗi P2002, và transaction bị cuộn ngược — đúng ý.
   */
  idempotencyKey?: string;
}

/** Một dòng thưởng đã được chuẩn hoá: hoặc tiền, hoặc vật phẩm, không bao giờ cả hai. */
export type RewardLineInput =
  | { currency: CurrencyCode; itemKey?: never; amount: number }
  | { currency?: never; itemKey: string; amount: number };

export interface GrantedReward {
  currency: CurrencyCode | null;
  itemKey: string | null;
  amount: number;
  /** Số dư ví / số lượng trong túi SAU khi cộng. Client dùng để cập nhật HUD ngay. */
  after: number;
}

function assertPositive(amount: number, what: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${what} phải là số nguyên dương, nhận được ${amount}`);
  }
}

/**
 * Cộng tiền. Dùng INSERT ... ON CONFLICT chứ không UPDATE thuần: trigger
 * game.seed_wallet() chỉ chạy cho người chơi TẠO MỚI, nên người chơi cũ sẽ thiếu
 * dòng ví nếu về sau có thêm loại tiền vào enum. UPDATE thuần lúc đó lặng lẽ
 * không đụng dòng nào và người chơi mất tiền mà không ai biết.
 */
export async function creditCurrency(
  tx: TxClient,
  playerId: string,
  currency: CurrencyCode,
  amount: number,
  ref: LedgerRef,
): Promise<number> {
  assertPositive(amount, "Số tiền cộng");

  const rows = await tx.$queryRaw<{ balance: bigint }[]>`
    INSERT INTO game.wallet (player_id, currency, balance)
    VALUES (${playerId}::uuid, ${currency}::content.currency_code, ${amount}::bigint)
    ON CONFLICT (player_id, currency)
      DO UPDATE SET balance = game.wallet.balance + EXCLUDED.balance
    RETURNING balance
  `;

  const balanceAfter = rows[0]!.balance;
  await writeLedger(tx, playerId, currency, BigInt(amount), balanceAfter, ref);
  return Number(balanceAfter);
}

/**
 * Trừ tiền. Điều kiện `balance >= amount` nằm TRONG mệnh đề WHERE, không phải
 * một câu SELECT trước đó: đọc-rồi-ghi ở hai câu lệnh là chỗ kinh điển để hai
 * request song song cùng thấy đủ tiền rồi cùng trừ. Ở đây Postgres khoá dòng và
 * câu thứ hai không khớp WHERE nữa, trả về 0 dòng.
 */
export async function debitCurrency(
  tx: TxClient,
  playerId: string,
  currency: CurrencyCode,
  amount: number,
  ref: LedgerRef,
): Promise<number> {
  assertPositive(amount, "Số tiền trừ");

  const rows = await tx.$queryRaw<{ balance: bigint }[]>`
    UPDATE game.wallet
       SET balance = balance - ${amount}::bigint
     WHERE player_id = ${playerId}::uuid
       AND currency  = ${currency}::content.currency_code
       AND balance  >= ${amount}::bigint
    RETURNING balance
  `;

  if (rows.length === 0) {
    throw new UnprocessableError("Không đủ số dư");
  }

  const balanceAfter = rows[0]!.balance;
  await writeLedger(tx, playerId, currency, BigInt(-amount), balanceAfter, ref);
  return Number(balanceAfter);
}

function writeLedger(
  tx: TxClient,
  playerId: string,
  currency: CurrencyCode,
  delta: bigint,
  balanceAfter: bigint,
  ref: LedgerRef,
) {
  return tx.currencyLedger.create({
    data: {
      playerId,
      currency,
      delta,
      balanceAfter,
      reason: ref.reason,
      // CHECK ((ref_type IS NULL) = (ref_id IS NULL)) — nửa vời là lỗi CHECK.
      refType: ref.refId ? (ref.refType ?? null) : null,
      refId: ref.refType ? (ref.refId ?? null) : null,
      idempotencyKey: ref.idempotencyKey ?? null,
    },
  });
}

/**
 * Cộng vật phẩm vào túi.
 *
 * Hạn sử dụng tính bằng SQL vì content.item.shelf_life là kiểu `interval`, mà
 * Prisma đánh dấu Unsupported — client không đọc nổi cột đó, nói gì tới cộng nó
 * vào now(). Đưa cả phép tính xuống DB cũng đúng hơn về mặt đồng hồ: giờ của DB
 * là giờ duy nhất đáng tin.
 *
 * Nhận thêm là gia hạn cả chồng (đặt lại acquired_at/expires_at) — đúng như
 * COMMENT trên game.inventory.expires_at. Số lượng bị chặn trên bởi stack_max;
 * phần vượt bị bỏ, và hàm trả về số lượng thực tế sau khi cộng để tầng trên biết.
 */
export async function grantItem(
  tx: TxClient,
  playerId: string,
  itemKey: string,
  amount: number,
): Promise<number> {
  assertPositive(amount, "Số lượng vật phẩm");

  const rows = await tx.$queryRaw<{ quantity: number }[]>`
    INSERT INTO game.inventory (player_id, item_key, quantity, acquired_at, expires_at)
    SELECT ${playerId}::uuid,
           i.item_key,
           LEAST(${amount}::integer, i.stack_max),
           now(),
           CASE WHEN i.shelf_life IS NULL THEN NULL ELSE now() + i.shelf_life END
      FROM content.item i
     WHERE i.item_key = ${itemKey}
    ON CONFLICT (player_id, item_key) DO UPDATE
       SET quantity    = LEAST(
                           game.inventory.quantity + EXCLUDED.quantity,
                           (SELECT stack_max FROM content.item WHERE item_key = EXCLUDED.item_key)
                         ),
           acquired_at = EXCLUDED.acquired_at,
           expires_at  = EXCLUDED.expires_at
    RETURNING quantity
  `;

  // 0 dòng = SELECT không tìm thấy item. Khoá ngoại sẽ không bắt được trường hợp
  // này vì INSERT ... SELECT rỗng thì đơn giản là không ghi gì cả.
  if (rows.length === 0) {
    throw new UnprocessableError(`Vật phẩm không tồn tại: ${itemKey}`);
  }
  return rows[0]!.quantity;
}

/**
 * Trừ vật phẩm. CHECK (quantity > 0) trên bảng nghĩa là về 0 phải XOÁ DÒNG chứ
 * không phải ghi 0 — và BagScreenController dựa vào đúng điều đó: nó bật số ô
 * bằng số dòng trả về, nên một dòng quantity = 0 sẽ hiện thành ô trống ma.
 *
 * Trả về số lượng còn lại (0 nếu đã hết sạch).
 */
export async function consumeItem(
  tx: TxClient,
  playerId: string,
  itemKey: string,
  amount: number,
): Promise<number> {
  assertPositive(amount, "Số lượng vật phẩm");

  const deleted = await tx.$queryRaw<{ item_key: string }[]>`
    DELETE FROM game.inventory
     WHERE player_id = ${playerId}::uuid
       AND item_key  = ${itemKey}
       AND quantity  = ${amount}::integer
    RETURNING item_key
  `;
  if (deleted.length > 0) return 0;

  const rows = await tx.$queryRaw<{ quantity: number }[]>`
    UPDATE game.inventory
       SET quantity = quantity - ${amount}::integer
     WHERE player_id = ${playerId}::uuid
       AND item_key  = ${itemKey}
       AND quantity  > ${amount}::integer
    RETURNING quantity
  `;

  if (rows.length === 0) {
    throw new UnprocessableError(`Không đủ vật phẩm: ${itemKey}`);
  }
  return rows[0]!.quantity;
}

/**
 * Trả một danh sách dòng thưởng cho người chơi.
 *
 * `idempotencyKey` áp cho các dòng TIỀN, và phải khác nhau giữa các dòng trong
 * cùng một gói — hai dòng cùng khoá sẽ đụng unique index. Ở đây nối thêm chỉ số
 * dòng: "mail:42" → "mail:42#0", "mail:42#1".
 *
 * Không idempotent cho vật phẩm: túi đồ không có sổ cái. Chống gọi lại hai lần
 * là việc của người gọi, bằng cách đổi trạng thái có điều kiện (UPDATE ... WHERE
 * claimed_at IS NULL) trong cùng transaction — nếu câu đó khớp 0 dòng thì dừng
 * trước khi tới đây.
 */
export async function grantRewardLines(
  tx: TxClient,
  playerId: string,
  lines: RewardLineInput[],
  ref: LedgerRef,
): Promise<GrantedReward[]> {
  const granted: GrantedReward[] = [];

  for (const [index, line] of lines.entries()) {
    if (line.currency) {
      const after = await creditCurrency(tx, playerId, line.currency, line.amount, {
        ...ref,
        idempotencyKey: ref.idempotencyKey ? `${ref.idempotencyKey}#${index}` : undefined,
      });
      granted.push({ currency: line.currency, itemKey: null, amount: line.amount, after });
    } else {
      const after = await grantItem(tx, playerId, line.itemKey, line.amount);
      granted.push({ currency: null, itemKey: line.itemKey, amount: line.amount, after });
    }
  }

  return granted;
}

/**
 * Đọc gói thưởng từ content.reward_bundle rồi CHỤP LẠI thành mảng phẳng.
 *
 * Bản chụp này mới là thứ được trả cho người chơi và được lưu vào
 * game.mail.reward_snapshot. Admin sửa gói thưởng ngày mai không được phép đổi
 * thư đã gửi hôm qua — join ngược về bundle lúc nhận thư là đúng cái bug đó.
 */
export async function snapshotBundle(
  tx: TxClient,
  bundleId: bigint,
): Promise<RewardLineInput[]> {
  const lines = await tx.rewardLine.findMany({
    where: { bundleId },
    orderBy: { ordinal: "asc" },
  });

  return lines.map((l) =>
    l.currency
      ? ({ currency: l.currency, amount: l.amount } as RewardLineInput)
      : ({ itemKey: l.itemKey!, amount: l.amount } as RewardLineInput),
  );
}

/** Kiểm một mảng JSON đọc từ reward_snapshot có đúng hình dạng không. */
export function parseRewardSnapshot(raw: unknown): RewardLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): RewardLineInput[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    const amount = Number(e.amount);
    if (!Number.isInteger(amount) || amount <= 0) return [];
    if (typeof e.currency === "string") {
      return [{ currency: e.currency as CurrencyCode, amount }];
    }
    // Chấp cả item_key (bản chụp cũ viết theo kiểu snake_case của SQL) lẫn itemKey.
    const itemKey = e.itemKey ?? e.item_key;
    if (typeof itemKey === "string") return [{ itemKey, amount }];
    return [];
  });
}
