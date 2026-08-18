import { randomInt } from "node:crypto";
import * as farmRepository from "./farm.repository";
import { prisma } from "../../core/database/prisma";
import { consumeItem, grantItem } from "../../common/services/economy.service";
import { ConflictError, NotFoundError, UnprocessableError } from "../../common/errors";
import type { PlantInput } from "./farm.schema";

export async function listPlots(playerId: string) {
  const plots = await farmRepository.listPlots(playerId);
  const now = Date.now();
  return plots.map((p) => ({
    plotIndex: p.plotIndex,
    cropKey: p.cropKey,
    plantedAt: p.plantedAt,
    readyAt: p.readyAt,
    waterCount: p.waterCount,
    /** Tính bằng giờ SERVER và gửi kèm — client không được tự so sánh với đồng hồ máy. */
    isReady: p.readyAt !== null && p.readyAt.getTime() <= now,
  }));
}

/**
 * Gieo hạt: trừ hạt giống khỏi túi rồi ghi ô đất, một transaction.
 *
 * readyAt do SERVER tính từ growSeconds ngay tại đây. Đây là lỗ hổng kinh điển
 * của mọi game nông trại: để client gửi lên "cây của tôi chín rồi" thì chỉnh
 * đồng hồ máy là thu hoạch vô hạn.
 */
export async function plant(playerId: string, plotIndex: number, input: PlantInput) {
  return prisma.$transaction(async (tx) => {
    const crop = await farmRepository.findCrop(tx, input.cropKey);
    if (!crop) {
      throw new NotFoundError(`Loại cây không tồn tại: ${input.cropKey}`);
    }

    const plot = await farmRepository.findPlot(tx, playerId, plotIndex);
    if (plot?.cropKey) {
      throw new ConflictError("Ô đất này đang có cây");
    }

    await consumeItem(tx, playerId, crop.seedItemKey, 1);

    const plantedAt = new Date();
    const readyAt = new Date(plantedAt.getTime() + crop.growSeconds * 1000);
    const saved = await farmRepository.plant(tx, playerId, plotIndex, {
      cropKey: crop.cropKey,
      plantedAt,
      readyAt,
    });

    return {
      plotIndex: saved.plotIndex,
      cropKey: saved.cropKey,
      plantedAt: saved.plantedAt,
      readyAt: saved.readyAt,
      waterCount: saved.waterCount,
      isReady: false,
    };
  });
}

export async function water(playerId: string, plotIndex: number) {
  return prisma.$transaction(async (tx) => {
    const plot = await farmRepository.findPlot(tx, playerId, plotIndex);
    if (!plot?.cropKey) {
      throw new UnprocessableError("Ô đất này đang trống");
    }

    const crop = await farmRepository.findCrop(tx, plot.cropKey);
    if (!crop) {
      throw new NotFoundError(`Loại cây không tồn tại: ${plot.cropKey}`);
    }

    const result = await farmRepository.water(tx, playerId, plotIndex, crop.waterStages);
    if (result.count === 0) {
      throw new ConflictError("Cây này đã tưới đủ nước");
    }

    return {
      plotIndex,
      waterCount: plot.waterCount + 1,
      waterStages: crop.waterStages,
    };
  });
}

/**
 * Thu hoạch.
 *
 * Hai điều kiện, cả hai đều bắt buộc: đã tới readyAt VÀ đã tưới đủ số lần.
 * Sản lượng random trong [yieldMin, yieldMax] — bằng randomInt của node:crypto
 * chứ không Math.random(), vì kết quả này quy ra vật phẩm bán được, và một PRNG
 * đoán trước được là một PRNG khai thác được.
 */
export async function harvest(playerId: string, plotIndex: number) {
  return prisma.$transaction(async (tx) => {
    const plot = await farmRepository.findPlot(tx, playerId, plotIndex);
    if (!plot?.cropKey || !plot.readyAt) {
      throw new UnprocessableError("Ô đất này đang trống");
    }
    if (plot.readyAt > new Date()) {
      throw new UnprocessableError("Cây chưa chín");
    }

    const crop = await farmRepository.findCrop(tx, plot.cropKey);
    if (!crop) {
      throw new NotFoundError(`Loại cây không tồn tại: ${plot.cropKey}`);
    }
    if (plot.waterCount < crop.waterStages) {
      throw new UnprocessableError(
        `Cây cần tưới ${crop.waterStages} lần, mới tưới ${plot.waterCount}`,
      );
    }

    // Dọn ô TRƯỚC khi cộng nông sản: câu này là chốt chặn, nếu nó không khớp
    // dòng nào thì đã có request khác thu hoạch xong rồi.
    const cleared = await farmRepository.clearPlot(tx, playerId, plotIndex, plot.cropKey);
    if (!cleared) {
      throw new ConflictError("Ô đất này vừa được thu hoạch");
    }

    // randomInt(min, max) loại trừ cận trên, nên +1 để yieldMax nằm trong khoảng.
    const yieldAmount = randomInt(crop.yieldMin, crop.yieldMax + 1);
    const quantity = await grantItem(tx, playerId, crop.harvestItemKey, yieldAmount);

    return {
      plotIndex,
      itemKey: crop.harvestItemKey,
      amount: yieldAmount,
      /** Số lượng trong túi SAU khi cộng — có thể nhỏ hơn amount nếu chạm stackMax. */
      quantity,
    };
  });
}
