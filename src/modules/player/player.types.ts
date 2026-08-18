import type { CurrencyCode, EquipSlot, LedgerReason, QuestStatus } from "@prisma/client";

export interface WalletDto {
  currency: CurrencyCode;
  balance: number;
}

export interface SaveDto {
  sceneName: string;
  posX: number;
  posY: number;
  posZ: number;
  /** Chỉ yaw — ThirdPersonLook giữ pivot ở identity nên pitch không thuộc về nhân vật. */
  yaw: number;
  /** DayNightCycle.timeOfDay, 0–24. */
  dayTime: number;
  updatedAt: Date;
}

export interface InventoryEntryDto {
  itemKey: string;
  quantity: number;
  acquiredAt: Date;
  expiresAt: Date | null;
}

export interface EquipmentEntryDto {
  slot: EquipSlot;
  itemKey: string;
}

export interface QuestProgressDto {
  questKey: string;
  status: QuestStatus;
  startedAt: Date;
  completedAt: Date | null;
  claimedAt: Date | null;
  objectives: { ordinal: number; progress: number }[];
}

export interface AchievementProgressDto {
  achievementKey: string;
  progress: number;
  unlockedAt: Date | null;
  claimedAt: Date | null;
}

export interface FarmPlotDto {
  plotIndex: number;
  cropKey: string | null;
  plantedAt: Date | null;
  readyAt: Date | null;
  waterCount: number;
  /** Suy ra từ readyAt so với giờ SERVER. Client không được tự tính — đồng hồ client chỉnh được. */
  isReady: boolean;
}

export interface LedgerEntryDto {
  entryId: string;
  currency: CurrencyCode;
  delta: number;
  balanceAfter: number;
  reason: LedgerReason;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
}

/**
 * Ảnh chụp toàn bộ trạng thái người chơi — cái client gọi ngay sau khi đăng nhập
 * để dựng lại thế giới. Một lượt đi-về thay vì tám.
 *
 * KHÔNG chứa hòm thư (có thể rất dài, và có phân trang riêng) — chỉ đếm số thư
 * chưa đọc để hiện chấm đỏ trên nút.
 */
export interface PlayerStateDto {
  playerId: string;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  exp: number;
  mailCapacity: number;
  createdAt: Date;
  wallets: WalletDto[];
  save: SaveDto | null;
  inventory: InventoryEntryDto[];
  equipment: EquipmentEntryDto[];
  quests: QuestProgressDto[];
  achievements: AchievementProgressDto[];
  farmPlots: FarmPlotDto[];
  codexUnlocks: string[];
  unreadMailCount: number;
  /** Số thư còn phần thưởng chưa nhận — nguồn của huy hiệu trên nút "Nhận hết". */
  unclaimedMailCount: number;
}
