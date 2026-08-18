import type { CurrencyCode } from "@prisma/client";
import * as contentRepository from "./content.repository";
import { toNumber } from "../../common/utils/serialize.util";
import { NotFoundError } from "../../common/errors";
import type {
  AchievementDto,
  BannerDto,
  CatalogDto,
  CodexEntryDto,
  CropDto,
  GachaItemDto,
  ItemDto,
  MailTemplateDto,
  NpcDto,
  PatternDto,
  QuestDto,
  RewardDto,
  ShopProductDto,
} from "./content.types";

type RewardIndex = Map<string, { currency: string | null; itemKey: string | null; amount: number }[]>;

/** Bung một bundleId thành mảng thưởng phẳng. bundleId NULL ⇒ mảng rỗng, không phải lỗi. */
function rewardsOf(index: RewardIndex, bundleId: bigint | null): RewardDto[] {
  if (bundleId === null) return [];
  const lines = index.get(bundleId.toString()) ?? [];
  return lines.map((l) => ({
    currency: l.currency as CurrencyCode | null,
    itemKey: l.itemKey,
    amount: l.amount,
  }));
}

/**
 * EXTRACT(EPOCH FROM interval) trả kiểu numeric, và driver đưa numeric về đây
 * dưới dạng chuỗi để khỏi mất chính xác. Đổi sang số nguyên giây tại đây.
 */
function secondsOf(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : null;
}

export async function getVersion() {
  const state = await contentRepository.getConfigState();
  if (!state) {
    // Bảng chỉ có đúng một dòng và migration đã tạo sẵn. Thiếu = DB bị sửa tay.
    throw new NotFoundError("Chưa có trạng thái xuất bản");
  }
  return { version: state.version.toString(), publishedAt: state.publishedAt };
}

export async function listItems(): Promise<ItemDto[]> {
  const rows = await contentRepository.listItems();
  return rows.map((r) => ({
    itemKey: r.item_key,
    displayName: r.display_name,
    description: r.description,
    category: r.category,
    grade: r.grade,
    stackMax: r.stack_max,
    isEquippable: r.is_equippable,
    isConsumable: r.is_consumable,
    shelfLifeSeconds: secondsOf(r.shelf_life_seconds),
    sortOrder: r.sort_order,
    equip: r.equip_slot ? { slot: r.equip_slot, stats: r.equip_stats } : null,
  }));
}

export async function listCrops(): Promise<CropDto[]> {
  const rows = await contentRepository.listCrops();
  return rows.map((c) => ({
    cropKey: c.cropKey,
    seedItemKey: c.seedItemKey,
    harvestItemKey: c.harvestItemKey,
    growSeconds: c.growSeconds,
    waterStages: c.waterStages,
    yieldMin: c.yieldMin,
    yieldMax: c.yieldMax,
  }));
}

export async function listPatterns(): Promise<PatternDto[]> {
  const rows = await contentRepository.listPatterns();
  return rows.map((p) => ({
    patternKey: p.patternKey,
    displayName: p.displayName,
    difficulty: p.difficulty,
    outline: p.outline,
    sortOrder: p.sortOrder,
  }));
}

export async function listNpcs(): Promise<NpcDto[]> {
  const rows = await contentRepository.listNpcs();
  return rows.map((n) => ({
    npcKey: n.npcKey,
    displayName: n.displayName,
    sceneName: n.sceneName,
  }));
}

export async function listQuests(index?: RewardIndex): Promise<QuestDto[]> {
  const rewards = index ?? (await contentRepository.loadRewardLines());
  const rows = await contentRepository.listQuests();
  return rows.map((q) => ({
    questKey: q.questKey,
    title: q.title,
    summary: q.summary,
    chapter: q.chapter,
    requiresQuest: q.requiresQuest,
    sortOrder: q.sortOrder,
    objectives: q.objectives.map((o) => ({
      ordinal: o.ordinal,
      kind: o.kind,
      targetKey: o.targetKey,
      targetCount: o.targetCount,
    })),
    rewards: rewardsOf(rewards, q.bundleId),
  }));
}

export async function listAchievements(index?: RewardIndex): Promise<AchievementDto[]> {
  const rewards = index ?? (await contentRepository.loadRewardLines());
  const rows = await contentRepository.listAchievements();
  return rows.map((a) => ({
    achievementKey: a.achievementKey,
    title: a.title,
    description: a.description,
    kind: a.kind,
    targetKey: a.targetKey,
    targetCount: toNumber(a.targetCount),
    sortOrder: a.sortOrder,
    rewards: rewardsOf(rewards, a.bundleId),
  }));
}

export async function listMailTemplates(index?: RewardIndex): Promise<MailTemplateDto[]> {
  const rewards = index ?? (await contentRepository.loadRewardLines());
  const rows = await contentRepository.listMailTemplates();
  return rows.map((m) => ({
    templateKey: m.template_key,
    title: m.title,
    sender: m.sender,
    body: m.body,
    ttlSeconds: secondsOf(m.ttl_seconds),
    rewards: rewardsOf(rewards, m.bundle_id),
  }));
}

export async function listCodexEntries(): Promise<CodexEntryDto[]> {
  const rows = await contentRepository.listCodexEntries();
  return rows.map((c) => ({
    entryKey: c.entryKey,
    title: c.title,
    body: c.body,
    category: c.category,
    sortOrder: c.sortOrder,
  }));
}

export async function listGachaItems(): Promise<GachaItemDto[]> {
  const rows = await contentRepository.listGachaItems();
  return rows.map((g) => ({
    gachaItemKey: g.gachaItemKey,
    displayName: g.displayName,
    subtitle: g.subtitle,
    description: g.description,
    quote: g.quote,
    rarity: g.rarity,
    grantsItemKey: g.grantsItemKey,
  }));
}

export async function listBanners(): Promise<BannerDto[]> {
  const rows = await contentRepository.listOpenBanners(new Date());
  return rows.map((b) => ({
    bannerKey: b.bannerKey,
    displayName: b.displayName,
    costCurrency: b.costCurrency,
    costAmount: b.costAmount,
    pity5Star: b.pity5Star,
    pity4Star: b.pity4Star,
    opensAt: b.opensAt,
    closesAt: b.closesAt,
    entries: b.entries.map((e) => ({
      gachaItemKey: e.gachaItemKey,
      weight: e.weight,
      isFeatured: e.isFeatured,
    })),
  }));
}

export async function listShopProducts(index?: RewardIndex): Promise<ShopProductDto[]> {
  const rewards = index ?? (await contentRepository.loadRewardLines());
  const rows = await contentRepository.listShopProducts(new Date());
  return rows.map((p) => ({
    productKey: p.productKey,
    tab: p.tab,
    displayName: p.displayName,
    storeSku: p.storeSku,
    priceVnd: p.priceVnd,
    priceCurrency: p.priceCurrency,
    priceAmount: p.priceAmount,
    bonusMultiplier: p.bonusMultiplier.toNumber(),
    oncePerAccount: p.oncePerAccount,
    sortOrder: p.sortOrder,
    rewards: rewardsOf(rewards, p.bundleId),
  }));
}

/**
 * Toàn bộ danh mục trong một lần gọi — cái client gọi lúc vào game.
 *
 * Đọc reward lines MỘT lần rồi truyền xuống bốn hàm cần nó. Gọi song song hết
 * mức: các truy vấn này độc lập nhau, và nối tiếp 11 lượt đi-về tới Supabase là
 * đủ để màn hình chờ dài thêm cả giây.
 */
export async function getCatalog(): Promise<CatalogDto> {
  const version = await getVersion();
  const rewardIndex = await contentRepository.loadRewardLines();

  const [
    items,
    crops,
    patterns,
    npcs,
    quests,
    achievements,
    mailTemplates,
    codex,
    gachaItems,
    banners,
    shopProducts,
  ] = await Promise.all([
    listItems(),
    listCrops(),
    listPatterns(),
    listNpcs(),
    listQuests(rewardIndex),
    listAchievements(rewardIndex),
    listMailTemplates(rewardIndex),
    listCodexEntries(),
    listGachaItems(),
    listBanners(),
    listShopProducts(rewardIndex),
  ]);

  return {
    ...version,
    items,
    crops,
    patterns,
    npcs,
    quests,
    achievements,
    mailTemplates,
    codex,
    gachaItems,
    banners,
    shopProducts,
  };
}
