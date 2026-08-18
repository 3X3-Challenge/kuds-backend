import type {
  CurrencyCode,
  EquipSlot,
  ItemCategory,
  ItemGrade,
  ObjectiveKind,
  ShopTab,
} from "@prisma/client";

/**
 * DTO của danh mục tĩnh — thứ client tải một lần rồi giữ trong bộ nhớ tới lần
 * xuất bản tiếp theo.
 *
 * Hai quy ước xuyên suốt:
 *  - Số bigint đã đổi sang number ở đây (đều là đại lượng nhỏ: số lượng, trọng
 *    số, giá). Riêng targetCount của thành tựu là number vì "700.000 đồng" vẫn
 *    thừa chỗ trong khoảng an toàn.
 *  - KHÔNG lộ bundle_id. Gói thưởng được bung phẳng thành mảng `rewards` ngay
 *    tại chỗ dùng: client không có việc gì với khoá nội bộ của bảng thưởng, và
 *    giấu nó đi thì sau này gộp/tách gói không thành thay đổi phá vỡ API.
 */

export interface RewardDto {
  currency: CurrencyCode | null;
  itemKey: string | null;
  amount: number;
}

export interface ItemDto {
  itemKey: string;
  displayName: string;
  description: string;
  category: ItemCategory;
  grade: ItemGrade;
  stackMax: number;
  isEquippable: boolean;
  isConsumable: boolean;
  /** null = không hết hạn. Giây, vì `interval` của Postgres không có kiểu JSON. */
  shelfLifeSeconds: number | null;
  sortOrder: number;
  /** Chỉ 8 vật phẩm "Trang bị" có phần này; còn lại null. */
  equip: { slot: EquipSlot; stats: unknown } | null;
}

export interface CropDto {
  cropKey: string;
  seedItemKey: string;
  harvestItemKey: string;
  growSeconds: number;
  waterStages: number;
  yieldMin: number;
  yieldMax: number;
}

export interface PatternDto {
  patternKey: string;
  displayName: string;
  difficulty: number;
  outline: unknown;
  sortOrder: number;
}

export interface NpcDto {
  npcKey: string;
  displayName: string;
  sceneName: string;
}

export interface QuestObjectiveDto {
  ordinal: number;
  kind: ObjectiveKind;
  targetKey: string | null;
  targetCount: number;
}

export interface QuestDto {
  questKey: string;
  title: string;
  summary: string;
  chapter: number;
  /** Nhiệm vụ phải xong trước. null = mở từ đầu. */
  requiresQuest: string | null;
  sortOrder: number;
  objectives: QuestObjectiveDto[];
  rewards: RewardDto[];
}

export interface AchievementDto {
  achievementKey: string;
  title: string;
  description: string;
  kind: ObjectiveKind;
  targetKey: string | null;
  targetCount: number;
  sortOrder: number;
  rewards: RewardDto[];
}

export interface MailTemplateDto {
  templateKey: string;
  title: string;
  sender: string;
  /** Chứa token {player_name}; client tự thay. */
  body: string;
  ttlSeconds: number | null;
  rewards: RewardDto[];
}

export interface CodexEntryDto {
  entryKey: string;
  title: string;
  body: string;
  category: string;
  sortOrder: number;
}

export interface GachaItemDto {
  gachaItemKey: string;
  displayName: string;
  subtitle: string;
  description: string;
  quote: string;
  rarity: number;
  grantsItemKey: string | null;
}

export interface BannerEntryDto {
  gachaItemKey: string;
  weight: number;
  isFeatured: boolean;
}

export interface BannerDto {
  bannerKey: string;
  displayName: string;
  costCurrency: CurrencyCode;
  costAmount: number;
  pity5Star: number;
  pity4Star: number;
  opensAt: Date;
  closesAt: Date | null;
  entries: BannerEntryDto[];
}

export interface ShopProductDto {
  productKey: string;
  tab: ShopTab;
  displayName: string;
  storeSku: string | null;
  priceVnd: number | null;
  priceCurrency: CurrencyCode | null;
  priceAmount: number | null;
  bonusMultiplier: number;
  oncePerAccount: boolean;
  sortOrder: number;
  rewards: RewardDto[];
}

/** Toàn bộ danh mục ở một lần gọi. Kèm version để client biết khi nào phải tải lại. */
export interface CatalogDto {
  version: string;
  publishedAt: Date;
  items: ItemDto[];
  crops: CropDto[];
  patterns: PatternDto[];
  npcs: NpcDto[];
  quests: QuestDto[];
  achievements: AchievementDto[];
  mailTemplates: MailTemplateDto[];
  codex: CodexEntryDto[];
  gachaItems: GachaItemDto[];
  banners: BannerDto[];
  shopProducts: ShopProductDto[];
}
