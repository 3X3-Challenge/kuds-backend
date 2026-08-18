import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export function listPlots(playerId: string) {
  return prisma.farmPlot.findMany({
    where: { playerId },
    orderBy: { plotIndex: "asc" },
  });
}

export function findPlot(tx: TxClient, playerId: string, plotIndex: number) {
  return tx.farmPlot.findUnique({
    where: { playerId_plotIndex: { playerId, plotIndex } },
  });
}

export function findCrop(tx: TxClient, cropKey: string) {
  return tx.crop.findUnique({ where: { cropKey } });
}

export interface PlantData {
  cropKey: string;
  plantedAt: Date;
  readyAt: Date;
}

/**
 * Gieo hạt. upsert vì ô đất chỉ tồn tại thành dòng sau lần gieo đầu tiên — ruộng
 * mới tinh không có dòng nào, và đó là cách phân biệt "chưa ai đụng" với "đã thu
 * hoạch xong, đang trống".
 *
 * CHECK bên SQL ép cropKey/plantedAt/readyAt cùng NULL hoặc cùng có, và ô trống
 * thì waterCount phải bằng 0 — nên mọi lần gieo đều đặt lại waterCount về 0.
 */
export function plant(tx: TxClient, playerId: string, plotIndex: number, data: PlantData) {
  return tx.farmPlot.upsert({
    where: { playerId_plotIndex: { playerId, plotIndex } },
    create: { playerId, plotIndex, ...data, waterCount: 0 },
    update: { ...data, waterCount: 0 },
  });
}

/**
 * Tưới một lần, chặn trên ở số lần tưới cần thiết của cây.
 *
 * Điều kiện nằm trong WHERE nên hai lần bấm nhanh liên tiếp không đẩy waterCount
 * vượt mốc; câu thứ hai đơn giản là không khớp dòng nào.
 */
export function water(tx: TxClient, playerId: string, plotIndex: number, maxStages: number) {
  return tx.farmPlot.updateMany({
    where: {
      playerId,
      plotIndex,
      cropKey: { not: null },
      waterCount: { lt: maxStages },
    },
    data: { waterCount: { increment: 1 } },
  });
}

/**
 * Dọn ô sau khi thu hoạch, có điều kiện `cropKey` vẫn đúng cây đang thu.
 *
 * Điều kiện đó LÀ chốt chặn chống thu hoạch hai lần: hai request song song thì
 * chỉ một câu khớp dòng, câu kia trả count = 0 và service dừng trước khi cộng
 * nông sản vào túi.
 */
export async function clearPlot(
  tx: TxClient,
  playerId: string,
  plotIndex: number,
  cropKey: string,
): Promise<boolean> {
  const result = await tx.farmPlot.updateMany({
    where: { playerId, plotIndex, cropKey },
    data: { cropKey: null, plantedAt: null, readyAt: null, waterCount: 0 },
  });
  return result.count === 1;
}
