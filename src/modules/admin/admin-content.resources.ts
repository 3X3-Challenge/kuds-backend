import { z, type ZodTypeAny } from "zod";
import {
  CurrencyCode,
  EquipSlot,
  ItemCategory,
  ItemGrade,
  ObjectiveKind,
  PublishStatus,
  ShopTab,
} from "@prisma/client";
import type { TxClient } from "../../common/services/economy.service";

/**
 * SỔ ĐĂNG KÝ TÀI NGUYÊN QUẢN TRỊ
 *
 * Mười ba bảng danh mục có cùng một hình dạng thao tác: liệt kê, xem, tạo, sửa,
 * lưu trữ. Viết mười ba bộ router/controller/service/repository giống hệt nhau
 * là mười ba chỗ để quên ghi nhật ký hoặc quên kiểm quyền. Ở đây mỗi bảng là
 * MỘT khai báo, còn hành vi nằm ở admin-content.service.ts.
 *
 * Thêm bảng danh mục mới = thêm một mục vào RESOURCES, không sửa gì khác.
 *
 * ---------------------------------------------------------------------------
 * Hai thứ Prisma không ghi được, phải vá bằng `postWrite`:
 *   content.item.shelf_life  và  content.mail_template.ttl  là kiểu `interval`,
 *   bị đánh dấu Unsupported trong schema.prisma. Client sinh ra không có trường
 *   đó, nên câu UPDATE raw chạy ngay sau mỗi lần ghi, trong cùng transaction.
 */

export interface AdminResource {
  /** Đoạn đường dẫn: /admin/content/<name> */
  name: string;
  /** Tên delegate của Prisma Client, ví dụ "item" cho prisma.item. */
  model: string;
  /** Tên bảng đầy đủ, ghi vào admin.audit_log.table_name. */
  table: string;
  /** Tên trường khoá chính trong Prisma, ví dụ "itemKey". */
  idField: string;
  /** bigint ⇒ id trên URL là chuỗi số và phải BigInt() trước khi truy vấn. */
  idKind: "string" | "bigint";
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
  orderBy: unknown;
  include?: unknown;
  /** Trường để lọc theo ?q= (contains, không phân biệt hoa thường). */
  searchField?: string;
  /** Có cột status ⇒ "xoá" nghĩa là chuyển archived. Không có ⇒ DELETE thật. */
  hasStatus: boolean;
  toCreateData(input: Record<string, unknown>): Record<string, unknown>;
  toUpdateData(input: Record<string, unknown>): Record<string, unknown>;
  postWrite?(tx: TxClient, id: string | bigint, input: Record<string, unknown>): Promise<void>;
}

// --- Kiểu dùng lại ---------------------------------------------------------

const key = z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "Khoá chỉ gồm chữ thường, số và _");
const text = (max: number) => z.string().trim().max(max);
const sortOrder = z.number().int().min(0).max(100000).default(0);
const status = z.nativeEnum(PublishStatus).default(PublishStatus.draft);

/** Giây, hoặc null = không hết hạn. */
const intervalSeconds = z.number().int().min(1).max(315_360_000).nullable().default(null);

/**
 * Gói thưởng tham chiếu bằng bundleKey (khoá tự nhiên), KHÔNG bằng bundleId.
 * bundleId là số tự tăng nên khác nhau giữa dev và production; bundleKey thì
 * giống nhau, và file seed dùng được ở cả hai nơi.
 */
const bundleKey = z.string().min(1).max(64).nullable().default(null);

/**
 * Khoá ngoại có quan hệ trong Prisma KHÔNG ghi được bằng cột vô hướng.
 *
 * `bundleId` và `requiresQuest` đều là cột thật trong SQL, nhưng vì schema.prisma
 * khai báo quan hệ trên chúng, Prisma Client chỉ nhận `{ connect: ... }` và từ
 * chối thẳng tên cột ("Unknown argument `requiresQuest`"). Hàm này dịch một khoá
 * tự nhiên sang mệnh đề quan hệ:
 *
 *   undefined ⇒ không đụng tới trường này (PATCH bỏ qua)
 *   null      ⇒ lúc tạo: bỏ trống; lúc sửa: gỡ liên kết
 *   chuỗi     ⇒ nối tới dòng có khoá đó
 */
function relation(value: unknown, uniqueField: string, forCreate: boolean) {
  if (value === undefined) return undefined;
  if (value === null) return forCreate ? undefined : { disconnect: true };
  return { connect: { [uniqueField]: value as string } };
}

const bundleRelation = (value: unknown, forCreate: boolean) =>
  relation(value, "bundleKey", forCreate);

/** Bỏ các khoá có giá trị undefined để PATCH không ghi đè bằng undefined. */
function defined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// --- 1. Vật phẩm -----------------------------------------------------------

const equipProfile = z
  .object({
    slot: z.nativeEnum(EquipSlot),
    /** Ví dụ {"toc_do_thu_hoach": 1.15}. Tự do vì chỉ số còn thay đổi. */
    stats: z.record(z.number()).default({}),
  })
  .nullable()
  .default(null);

const itemBase = z.object({
  itemKey: key,
  displayName: text(128).min(1),
  description: text(1000).default(""),
  category: z.nativeEnum(ItemCategory),
  grade: z.nativeEnum(ItemGrade).default(ItemGrade.thuong),
  stackMax: z.number().int().min(1).max(9999).default(999),
  isConsumable: z.boolean().default(false),
  shelfLifeSeconds: intervalSeconds,
  status,
  sortOrder,
  equip: equipProfile,
});

const itemResource: AdminResource = {
  name: "items",
  model: "item",
  table: "content.item",
  idField: "itemKey",
  idKind: "string",
  createSchema: itemBase,
  updateSchema: itemBase.omit({ itemKey: true }).partial(),
  orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { itemKey: "asc" }],
  include: { equipmentProfile: true },
  searchField: "displayName",
  hasStatus: true,

  toCreateData(input) {
    const equip = input.equip as { slot: EquipSlot; stats: unknown } | null;
    return {
      itemKey: input.itemKey,
      displayName: input.displayName,
      description: input.description,
      category: input.category,
      grade: input.grade,
      stackMax: input.stackMax,
      // Suy ra thay vì bắt admin nhập: "mặc được" chính là "có hồ sơ trang bị".
      // Để hai trường tự do đá nhau là tạo ra vật phẩm mặc được mà không có ô nào.
      isEquippable: equip !== null,
      isConsumable: input.isConsumable,
      status: input.status,
      sortOrder: input.sortOrder,
      ...(equip ? { equipmentProfile: { create: { slot: equip.slot, stats: equip.stats } } } : {}),
    };
  },

  toUpdateData(input) {
    const equip = input.equip as { slot: EquipSlot; stats: unknown } | null | undefined;
    return defined({
      displayName: input.displayName,
      description: input.description,
      category: input.category,
      grade: input.grade,
      stackMax: input.stackMax,
      isEquippable: equip === undefined ? undefined : equip !== null,
      isConsumable: input.isConsumable,
      status: input.status,
      sortOrder: input.sortOrder,
      ...(equip === undefined
        ? {}
        : {
            equipmentProfile: equip
              ? {
                  upsert: {
                    create: { slot: equip.slot, stats: equip.stats },
                    update: { slot: equip.slot, stats: equip.stats },
                  },
                }
              : // Món đang được ai đó mặc thì khoá ngoại của player_equipment
                // chặn xoá hồ sơ — đúng ý, và lỗi 400 rõ ràng hơn là âm thầm
                // để lại người chơi mặc một món không còn mặc được.
                { delete: true },
          }),
    });
  },

  async postWrite(tx, id, input) {
    if (input.shelfLifeSeconds === undefined) return;
    const seconds = input.shelfLifeSeconds as number | null;
    await tx.$executeRaw`
      UPDATE content.item
         SET shelf_life = ${seconds === null ? null : `${seconds} seconds`}::interval
       WHERE item_key = ${id as string}
    `;
  },
};

// --- 2. Cây trồng ----------------------------------------------------------

const cropBase = z
  .object({
    cropKey: key,
    seedItemKey: key,
    harvestItemKey: key,
    growSeconds: z.number().int().min(1).max(2_592_000),
    waterStages: z.number().int().min(0).max(10).default(1),
    yieldMin: z.number().int().min(1).max(999).default(1),
    yieldMax: z.number().int().min(1).max(999).default(1),
  })
  .refine((v) => v.yieldMax >= v.yieldMin, {
    message: "yieldMax phải lớn hơn hoặc bằng yieldMin",
    path: ["yieldMax"],
  });

const cropResource: AdminResource = {
  name: "crops",
  model: "crop",
  table: "content.crop",
  idField: "cropKey",
  idKind: "string",
  createSchema: cropBase,
  // .partial() không dùng được trên ZodEffects (schema có .refine), nên dựng lại
  // từ cùng bộ trường và kiểm quan hệ min/max ở refine riêng cho bản vá.
  updateSchema: z
    .object({
      seedItemKey: key.optional(),
      harvestItemKey: key.optional(),
      growSeconds: z.number().int().min(1).max(2_592_000).optional(),
      waterStages: z.number().int().min(0).max(10).optional(),
      yieldMin: z.number().int().min(1).max(999).optional(),
      yieldMax: z.number().int().min(1).max(999).optional(),
    })
    .refine((v) => v.yieldMin === undefined || v.yieldMax === undefined || v.yieldMax >= v.yieldMin, {
      message: "yieldMax phải lớn hơn hoặc bằng yieldMin",
      path: ["yieldMax"],
    }),
  orderBy: { cropKey: "asc" },
  searchField: "cropKey",
  hasStatus: false,
  toCreateData: (input) => ({ ...input }),
  toUpdateData: (input) => defined(input),
};

// --- 3. Mẫu tranh kiếng ----------------------------------------------------

const patternBase = z.object({
  patternKey: key,
  displayName: text(128).min(1),
  difficulty: z.number().int().min(1).max(5).default(1),
  outline: z.unknown().nullable().default(null),
  sortOrder,
});

const patternResource: AdminResource = {
  name: "patterns",
  model: "tranhKiengPattern",
  table: "content.tranh_kieng_pattern",
  idField: "patternKey",
  idKind: "string",
  createSchema: patternBase,
  updateSchema: patternBase.omit({ patternKey: true }).partial(),
  orderBy: [{ sortOrder: "asc" }, { patternKey: "asc" }],
  searchField: "displayName",
  hasStatus: false,
  toCreateData: (input) => ({ ...input }),
  toUpdateData: (input) => defined(input),
};

// --- 4. NPC ----------------------------------------------------------------

const npcBase = z.object({
  npcKey: key,
  displayName: text(128).min(1),
  sceneName: text(64).default("MainScene"),
});

const npcResource: AdminResource = {
  name: "npcs",
  model: "npc",
  table: "content.npc",
  idField: "npcKey",
  idKind: "string",
  createSchema: npcBase,
  updateSchema: npcBase.omit({ npcKey: true }).partial(),
  orderBy: { npcKey: "asc" },
  searchField: "displayName",
  hasStatus: false,
  toCreateData: (input) => ({ ...input }),
  toUpdateData: (input) => defined(input),
};

// --- 5. Gói thưởng ---------------------------------------------------------

/**
 * Một dòng thưởng: TIỀN hoặc VẬT PHẨM, đúng một trong hai.
 * CHECK bên SQL cũng ép điều này; kiểm ở đây chỉ để lỗi trả về đọc được.
 */
const rewardLine = z
  .object({
    currency: z.nativeEnum(CurrencyCode).nullable().default(null),
    itemKey: key.nullable().default(null),
    amount: z.number().int().min(1).max(1_000_000_000),
  })
  .refine((v) => (v.currency === null) !== (v.itemKey === null), {
    message: "Mỗi dòng thưởng phải là tiền HOẶC vật phẩm, không được cả hai và không được để trống",
  });

const bundleBase = z.object({
  bundleKey: key,
  note: text(500).nullable().default(null),
  lines: z.array(rewardLine).min(1).max(32),
});

/** Thay toàn bộ dòng con: xoá sạch rồi tạo lại theo đúng thứ tự admin gửi lên. */
function replaceLines(lines: z.infer<typeof rewardLine>[]) {
  return lines.map((l, ordinal) => ({
    ordinal,
    currency: l.currency,
    itemKey: l.itemKey,
    amount: l.amount,
  }));
}

const bundleResource: AdminResource = {
  name: "reward-bundles",
  model: "rewardBundle",
  table: "content.reward_bundle",
  idField: "bundleId",
  idKind: "bigint",
  createSchema: bundleBase,
  updateSchema: bundleBase.omit({ bundleKey: true }).partial(),
  orderBy: { bundleKey: "asc" },
  include: { lines: { orderBy: { ordinal: "asc" } } },
  searchField: "bundleKey",
  hasStatus: false,

  toCreateData: (input) => ({
    bundleKey: input.bundleKey,
    note: input.note,
    lines: { create: replaceLines(input.lines as z.infer<typeof rewardLine>[]) },
  }),

  toUpdateData: (input) =>
    defined({
      note: input.note,
      // deleteMany rồi create trong CÙNG một câu lệnh Prisma: cả hai nằm trong
      // một transaction ngầm, không có khoảnh khắc nào gói thưởng rỗng.
      lines:
        input.lines === undefined
          ? undefined
          : {
              deleteMany: {},
              create: replaceLines(input.lines as z.infer<typeof rewardLine>[]),
            },
    }),
};

// --- 6. Vật phẩm gacha -----------------------------------------------------

const gachaItemBase = z.object({
  gachaItemKey: key,
  displayName: text(128).min(1),
  subtitle: text(128).default(""),
  description: text(1000).default(""),
  quote: text(500).default(""),
  rarity: z.number().int().min(1).max(5),
  /** Vật phẩm cộng vào túi khi trúng. null = phần thưởng trang trí. */
  grantsItemKey: key.nullable().default(null),
});

const gachaItemResource: AdminResource = {
  name: "gacha-items",
  model: "gachaItem",
  table: "content.gacha_item",
  idField: "gachaItemKey",
  idKind: "string",
  createSchema: gachaItemBase,
  updateSchema: gachaItemBase.omit({ gachaItemKey: true }).partial(),
  orderBy: [{ rarity: "desc" }, { gachaItemKey: "asc" }],
  searchField: "displayName",
  hasStatus: false,
  toCreateData: (input) => ({ ...input }),
  toUpdateData: (input) => defined(input),
};

// --- 7. Banner -------------------------------------------------------------

const bannerEntry = z.object({
  gachaItemKey: key,
  /**
   * Trọng số thô. Tỉ lệ thật = weight / tổng trọng số của bể.
   * min(1) chứ không min(0): CHECK (weight > 0) bên SQL từ chối số 0, và muốn
   * gỡ một món khỏi bể thì bỏ hẳn dòng đó đi, không phải hạ trọng số về 0.
   */
  weight: z.number().int().min(1).max(1_000_000),
  isFeatured: z.boolean().default(false),
});

const bannerBase = z
  .object({
    bannerKey: key,
    displayName: text(128).min(1),
    status,
    costCurrency: z.nativeEnum(CurrencyCode).default(CurrencyCode.hoa_sen),
    costAmount: z.number().int().min(1).max(1_000_000),
    pity5Star: z.number().int().min(1).max(1000).default(90),
    pity4Star: z.number().int().min(1).max(1000).default(10),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date().nullable().default(null),
    entries: z.array(bannerEntry).min(1).max(200),
  })
  .refine((v) => v.closesAt === null || v.closesAt > v.opensAt, {
    message: "closesAt phải sau opensAt",
    path: ["closesAt"],
  });

const bannerResource: AdminResource = {
  name: "banners",
  model: "banner",
  table: "content.banner",
  idField: "bannerId",
  idKind: "bigint",
  createSchema: bannerBase,
  updateSchema: z.object({
    displayName: text(128).min(1).optional(),
    status: z.nativeEnum(PublishStatus).optional(),
    costCurrency: z.nativeEnum(CurrencyCode).optional(),
    costAmount: z.number().int().min(1).max(1_000_000).optional(),
    pity5Star: z.number().int().min(1).max(1000).optional(),
    pity4Star: z.number().int().min(1).max(1000).optional(),
    opensAt: z.coerce.date().optional(),
    closesAt: z.coerce.date().nullable().optional(),
    entries: z.array(bannerEntry).min(1).max(200).optional(),
  }),
  orderBy: { opensAt: "desc" },
  include: { entries: { orderBy: { gachaItemKey: "asc" } } },
  searchField: "displayName",
  hasStatus: true,

  toCreateData: (input) => ({
    bannerKey: input.bannerKey,
    displayName: input.displayName,
    status: input.status,
    costCurrency: input.costCurrency,
    costAmount: input.costAmount,
    pity5Star: input.pity5Star,
    pity4Star: input.pity4Star,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    entries: { create: input.entries as z.infer<typeof bannerEntry>[] },
  }),

  toUpdateData: (input) =>
    defined({
      displayName: input.displayName,
      status: input.status,
      costCurrency: input.costCurrency,
      costAmount: input.costAmount,
      pity5Star: input.pity5Star,
      pity4Star: input.pity4Star,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      entries:
        input.entries === undefined
          ? undefined
          : { deleteMany: {}, create: input.entries as z.infer<typeof bannerEntry>[] },
    }),
};

// --- 8. Gói cửa hàng -------------------------------------------------------

const shopProductBase = z
  .object({
    productKey: key,
    tab: z.nativeEnum(ShopTab),
    displayName: text(128).default(""),
    /** Nhánh tiền thật. */
    storeSku: text(128).nullable().default(null),
    priceVnd: z.number().int().min(1).max(100_000_000).nullable().default(null),
    /** PayOS giới hạn khoảng 25 ký tự cho nội dung chuyển khoản. */
    transferNote: text(25).nullable().default(null),
    /** Nhánh tiền trong game. */
    priceCurrency: z.nativeEnum(CurrencyCode).nullable().default(null),
    priceAmount: z.number().int().min(1).max(1_000_000_000).nullable().default(null),
    bundleKey: z.string().min(1).max(64),
    bonusMultiplier: z.number().min(1).max(9.99).default(1),
    oncePerAccount: z.boolean().default(false),
    status,
    sortOrder,
    activeFrom: z.coerce.date().default(() => new Date()),
    activeTo: z.coerce.date().nullable().default(null),
  })
  .refine(
    (v) =>
      (v.priceVnd !== null) !== (v.priceCurrency !== null && v.priceAmount !== null) &&
      (v.priceCurrency === null) === (v.priceAmount === null),
    {
      message: "Gói phải bán bằng tiền thật (priceVnd) HOẶC tiền trong game (priceCurrency + priceAmount)",
    },
  );

const shopProductResource: AdminResource = {
  name: "shop-products",
  model: "shopProduct",
  table: "content.shop_product",
  idField: "productId",
  idKind: "bigint",
  createSchema: shopProductBase,
  updateSchema: z.object({
    tab: z.nativeEnum(ShopTab).optional(),
    displayName: text(128).optional(),
    storeSku: text(128).nullable().optional(),
    priceVnd: z.number().int().min(1).max(100_000_000).nullable().optional(),
    transferNote: text(25).nullable().optional(),
    priceCurrency: z.nativeEnum(CurrencyCode).nullable().optional(),
    priceAmount: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
    bundleKey: z.string().min(1).max(64).optional(),
    bonusMultiplier: z.number().min(1).max(9.99).optional(),
    oncePerAccount: z.boolean().optional(),
    status: z.nativeEnum(PublishStatus).optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    activeFrom: z.coerce.date().optional(),
    activeTo: z.coerce.date().nullable().optional(),
  }),
  orderBy: [{ tab: "asc" }, { sortOrder: "asc" }],
  include: { bundle: { select: { bundleKey: true } } },
  searchField: "productKey",
  hasStatus: true,

  toCreateData: (input) => ({
    productKey: input.productKey,
    tab: input.tab,
    displayName: input.displayName,
    storeSku: input.storeSku,
    priceVnd: input.priceVnd,
    transferNote: input.transferNote,
    priceCurrency: input.priceCurrency,
    priceAmount: input.priceAmount,
    bonusMultiplier: input.bonusMultiplier,
    oncePerAccount: input.oncePerAccount,
    status: input.status,
    sortOrder: input.sortOrder,
    activeFrom: input.activeFrom,
    activeTo: input.activeTo,
    bundle: { connect: { bundleKey: input.bundleKey as string } },
  }),

  toUpdateData: (input) =>
    defined({
      tab: input.tab,
      displayName: input.displayName,
      storeSku: input.storeSku,
      priceVnd: input.priceVnd,
      transferNote: input.transferNote,
      priceCurrency: input.priceCurrency,
      priceAmount: input.priceAmount,
      bonusMultiplier: input.bonusMultiplier,
      oncePerAccount: input.oncePerAccount,
      status: input.status,
      sortOrder: input.sortOrder,
      activeFrom: input.activeFrom,
      activeTo: input.activeTo,
      bundle: input.bundleKey === undefined ? undefined : { connect: { bundleKey: input.bundleKey as string } },
    }),
};

// --- 9. Nhiệm vụ -----------------------------------------------------------

const questObjective = z.object({
  kind: z.nativeEnum(ObjectiveKind),
  /** item_key / npc_key / crop_key / pattern_key tuỳ kind. Không đặt được khoá ngoại. */
  targetKey: z.string().min(1).max(64).nullable().default(null),
  targetCount: z.number().int().min(1).max(1_000_000).default(1),
});

const questBase = z.object({
  questKey: key,
  title: text(200).min(1),
  summary: text(1000).default(""),
  chapter: z.number().int().min(1).max(999).default(1),
  requiresQuest: key.nullable().default(null),
  bundleKey,
  status,
  sortOrder,
  objectives: z.array(questObjective).max(16).default([]),
});

const questResource: AdminResource = {
  name: "quests",
  model: "quest",
  table: "content.quest",
  idField: "questKey",
  idKind: "string",
  createSchema: questBase.refine((v) => v.requiresQuest !== v.questKey, {
    message: "Nhiệm vụ không thể phụ thuộc chính nó",
    path: ["requiresQuest"],
  }),
  updateSchema: questBase.omit({ questKey: true }).partial(),
  orderBy: [{ chapter: "asc" }, { sortOrder: "asc" }, { questKey: "asc" }],
  include: { objectives: { orderBy: { ordinal: "asc" } } },
  searchField: "title",
  hasStatus: true,

  toCreateData: (input) => ({
    questKey: input.questKey,
    title: input.title,
    summary: input.summary,
    chapter: input.chapter,
    requires: relation(input.requiresQuest, "questKey", true),
    status: input.status,
    sortOrder: input.sortOrder,
    bundle: bundleRelation(input.bundleKey, true),
    objectives: {
      create: (input.objectives as z.infer<typeof questObjective>[]).map((o, ordinal) => ({
        ordinal,
        kind: o.kind,
        targetKey: o.targetKey,
        targetCount: o.targetCount,
      })),
    },
  }),

  toUpdateData: (input) =>
    defined({
      title: input.title,
      summary: input.summary,
      chapter: input.chapter,
      requires: relation(input.requiresQuest, "questKey", false),
      status: input.status,
      sortOrder: input.sortOrder,
      bundle: bundleRelation(input.bundleKey, false),
      // Thay mục tiêu sẽ xoá luôn tiến độ của người chơi (player_quest_objective
      // cascade theo quest_objective). Service chặn việc này khi nhiệm vụ đã
      // published — xem admin-content.service.ts.
      objectives:
        input.objectives === undefined
          ? undefined
          : {
              deleteMany: {},
              create: (input.objectives as z.infer<typeof questObjective>[]).map((o, ordinal) => ({
                ordinal,
                kind: o.kind,
                targetKey: o.targetKey,
                targetCount: o.targetCount,
              })),
            },
    }),
};

// --- 10. Thành tựu ---------------------------------------------------------

const achievementBase = z.object({
  achievementKey: key,
  title: text(200).min(1),
  description: text(1000).default(""),
  kind: z.nativeEnum(ObjectiveKind),
  targetKey: z.string().min(1).max(64).nullable().default(null),
  /** Đếm bằng đồng với thành tựu tiêu tiền, nên trần phải rộng. */
  targetCount: z.number().int().min(1).max(1_000_000_000_000),
  bundleKey,
  status,
  sortOrder,
});

const achievementResource: AdminResource = {
  name: "achievements",
  model: "achievement",
  table: "content.achievement",
  idField: "achievementKey",
  idKind: "string",
  createSchema: achievementBase,
  updateSchema: achievementBase.omit({ achievementKey: true }).partial(),
  orderBy: [{ sortOrder: "asc" }, { achievementKey: "asc" }],
  searchField: "title",
  hasStatus: true,

  toCreateData: (input) => ({
    achievementKey: input.achievementKey,
    title: input.title,
    description: input.description,
    kind: input.kind,
    targetKey: input.targetKey,
    targetCount: BigInt(input.targetCount as number),
    status: input.status,
    sortOrder: input.sortOrder,
    bundle: bundleRelation(input.bundleKey, true),
  }),

  toUpdateData: (input) =>
    defined({
      title: input.title,
      description: input.description,
      kind: input.kind,
      targetKey: input.targetKey,
      targetCount: input.targetCount === undefined ? undefined : BigInt(input.targetCount as number),
      status: input.status,
      sortOrder: input.sortOrder,
      bundle: bundleRelation(input.bundleKey, false),
    }),
};

// --- 11. Mẫu thư -----------------------------------------------------------

const mailTemplateBase = z.object({
  templateKey: key,
  /** Giữ nguyên cặp ngoặc vuông "[Thư cá nhân]" — client tự bỏ khi hiện tiêu đề. */
  title: text(200).min(1),
  sender: text(128).default(""),
  /** Dùng token {player_name}. Escape rich text là việc của client. */
  body: text(4000).default(""),
  bundleKey,
  ttlSeconds: intervalSeconds,
  status,
});

const mailTemplateResource: AdminResource = {
  name: "mail-templates",
  model: "mailTemplate",
  table: "content.mail_template",
  idField: "templateKey",
  idKind: "string",
  createSchema: mailTemplateBase,
  updateSchema: mailTemplateBase.omit({ templateKey: true }).partial(),
  orderBy: { templateKey: "asc" },
  searchField: "title",
  hasStatus: true,

  toCreateData: (input) => ({
    templateKey: input.templateKey,
    title: input.title,
    sender: input.sender,
    body: input.body,
    status: input.status,
    bundle: bundleRelation(input.bundleKey, true),
  }),

  toUpdateData: (input) =>
    defined({
      title: input.title,
      sender: input.sender,
      body: input.body,
      status: input.status,
      bundle: bundleRelation(input.bundleKey, false),
    }),

  async postWrite(tx, id, input) {
    if (input.ttlSeconds === undefined) return;
    const seconds = input.ttlSeconds as number | null;
    await tx.$executeRaw`
      UPDATE content.mail_template
         SET ttl = ${seconds === null ? null : `${seconds} seconds`}::interval
       WHERE template_key = ${id as string}
    `;
  },
};

// --- 12. Sổ tay di sản -----------------------------------------------------

const codexBase = z.object({
  entryKey: key,
  title: text(200).min(1),
  body: text(8000).default(""),
  /** Ví dụ: tranh_kieng, long_den, cu_lao. */
  category: text(64).min(1),
  status,
  sortOrder,
});

const codexResource: AdminResource = {
  name: "codex-entries",
  model: "codexEntry",
  table: "content.codex_entry",
  idField: "entryKey",
  idKind: "string",
  createSchema: codexBase,
  updateSchema: codexBase.omit({ entryKey: true }).partial(),
  orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  searchField: "title",
  hasStatus: true,
  toCreateData: (input) => ({ ...input }),
  toUpdateData: (input) => defined(input),
};

// ---------------------------------------------------------------------------

export const RESOURCES: AdminResource[] = [
  itemResource,
  cropResource,
  patternResource,
  npcResource,
  bundleResource,
  gachaItemResource,
  bannerResource,
  shopProductResource,
  questResource,
  achievementResource,
  mailTemplateResource,
  codexResource,
];

export const RESOURCE_BY_NAME = new Map(RESOURCES.map((r) => [r.name, r]));
