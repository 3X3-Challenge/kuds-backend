import type { EquipSlot, ItemCategory, ItemGrade } from "@prisma/client";
import { prisma } from "../../core/database/prisma";

/**
 * Đọc danh mục cho CLIENT: chỉ status = 'published'.
 *
 * Trang quản trị đọc bằng repository riêng (modules/admin) vì nó cần thấy cả
 * bản nháp lẫn bản lưu trữ. Trộn hai nhu cầu vào một hàm với cờ `includeDraft`
 * là cách chắc chắn nhất để một ngày nào đó bản nháp rò ra tới người chơi.
 */

const PUBLISHED = { status: "published" } as const;

export function getConfigState() {
  return prisma.configState.findUnique({ where: { id: true } });
}

/** Một dòng item kèm hồ sơ trang bị đã join sẵn. */
export interface ItemRow {
  item_key: string;
  display_name: string;
  description: string;
  category: ItemCategory;
  grade: ItemGrade;
  stack_max: number;
  is_equippable: boolean;
  is_consumable: boolean;
  /** numeric của EXTRACT về tới đây dưới dạng string hoặc null. */
  shelf_life_seconds: string | null;
  sort_order: number;
  equip_slot: EquipSlot | null;
  equip_stats: unknown;
}

/**
 * Raw chứ không Prisma vì `content.item.shelf_life` là kiểu `interval`, mà
 * schema.prisma đánh dấu `Unsupported` — client sinh ra không có trường đó, nên
 * không cách nào select được. EXTRACT(EPOCH ...) đổi nó sang giây ngay tại DB.
 */
export function listItems() {
  return prisma.$queryRaw<ItemRow[]>`
    SELECT i.item_key,
           i.display_name,
           i.description,
           i.category,
           i.grade,
           i.stack_max,
           i.is_equippable,
           i.is_consumable,
           EXTRACT(EPOCH FROM i.shelf_life)::text AS shelf_life_seconds,
           i.sort_order,
           ep.slot  AS equip_slot,
           ep.stats AS equip_stats
      FROM content.item i
      LEFT JOIN content.equipment_profile ep ON ep.item_key = i.item_key
     WHERE i.status = 'published'
     ORDER BY i.category, i.sort_order, i.item_key
  `;
}

export interface MailTemplateRow {
  template_key: string;
  title: string;
  sender: string;
  body: string;
  ttl_seconds: string | null;
  bundle_id: bigint | null;
}

/** Cùng lý do raw như listItems: `content.mail_template.ttl` cũng là `interval`. */
export function listMailTemplates() {
  return prisma.$queryRaw<MailTemplateRow[]>`
    SELECT template_key,
           title,
           sender,
           body,
           EXTRACT(EPOCH FROM ttl)::text AS ttl_seconds,
           bundle_id
      FROM content.mail_template
     WHERE status = 'published'
     ORDER BY template_key
  `;
}

export function listCrops() {
  return prisma.crop.findMany({ orderBy: { cropKey: "asc" } });
}

export function listPatterns() {
  return prisma.tranhKiengPattern.findMany({
    orderBy: [{ sortOrder: "asc" }, { patternKey: "asc" }],
  });
}

export function listNpcs() {
  return prisma.npc.findMany({ orderBy: { npcKey: "asc" } });
}

export function listQuests() {
  return prisma.quest.findMany({
    where: PUBLISHED,
    include: { objectives: { orderBy: { ordinal: "asc" } } },
    orderBy: [{ chapter: "asc" }, { sortOrder: "asc" }, { questKey: "asc" }],
  });
}

export function listAchievements() {
  return prisma.achievement.findMany({
    where: PUBLISHED,
    orderBy: [{ sortOrder: "asc" }, { achievementKey: "asc" }],
  });
}

export function listCodexEntries() {
  return prisma.codexEntry.findMany({
    where: PUBLISHED,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { entryKey: "asc" }],
  });
}

export function listGachaItems() {
  return prisma.gachaItem.findMany({ orderBy: { gachaItemKey: "asc" } });
}

/**
 * Banner đang mở: đã xuất bản VÀ đang trong cửa sổ thời gian. Lọc thời gian ở
 * đây chứ không để client tự so sánh — đồng hồ client là thứ người chơi chỉnh
 * được, và một banner mở sớm hơn dự định là mất tiền thật.
 */
export function listOpenBanners(now: Date) {
  return prisma.banner.findMany({
    where: {
      ...PUBLISHED,
      opensAt: { lte: now },
      OR: [{ closesAt: null }, { closesAt: { gt: now } }],
    },
    include: { entries: { orderBy: { gachaItemKey: "asc" } } },
    orderBy: { opensAt: "desc" },
  });
}

export function findOpenBannerByKey(bannerKey: string, now: Date) {
  return prisma.banner.findFirst({
    where: {
      bannerKey,
      ...PUBLISHED,
      opensAt: { lte: now },
      OR: [{ closesAt: null }, { closesAt: { gt: now } }],
    },
    include: { entries: true },
  });
}

/** Gói đang bán: đã xuất bản VÀ đang trong khoảng activeFrom/activeTo. */
export function listShopProducts(now: Date) {
  return prisma.shopProduct.findMany({
    where: {
      ...PUBLISHED,
      activeFrom: { lte: now },
      OR: [{ activeTo: null }, { activeTo: { gt: now } }],
    },
    orderBy: [{ tab: "asc" }, { sortOrder: "asc" }, { productKey: "asc" }],
  });
}

/**
 * Bung MỌI gói thưởng trong một câu, trả về Map bundleId → các dòng thưởng.
 *
 * Nhiệm vụ, thành tựu, mẫu thư và gói nạp đều trỏ về reward_bundle. Nếu mỗi
 * bảng tự include quan hệ của nó thì cùng một gói được đọc lại bốn lần, và
 * Prisma sinh ra một câu con cho mỗi dòng. Một câu ở đây, tra Map ở kia.
 */
export async function loadRewardLines(): Promise<Map<string, { currency: string | null; itemKey: string | null; amount: number }[]>> {
  const lines = await prisma.rewardLine.findMany({
    orderBy: [{ bundleId: "asc" }, { ordinal: "asc" }],
  });

  const byBundle = new Map<string, { currency: string | null; itemKey: string | null; amount: number }[]>();
  for (const line of lines) {
    const key = line.bundleId.toString();
    const list = byBundle.get(key) ?? [];
    list.push({ currency: line.currency, itemKey: line.itemKey, amount: line.amount });
    byBundle.set(key, list);
  }
  return byBundle;
}
