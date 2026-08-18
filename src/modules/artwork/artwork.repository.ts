import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/database/prisma";

export function findPattern(patternKey: string) {
  return prisma.tranhKiengPattern.findUnique({ where: { patternKey } });
}

export interface CreateArtworkData {
  playerId: string;
  patternKey: string;
  score: number;
  stars: number;
  strokes?: Prisma.InputJsonValue;
}

export function createArtwork(data: CreateArtworkData) {
  return prisma.artwork.create({ data });
}

export function listArtworks(playerId: string, limit: number, cursor?: bigint) {
  return prisma.artwork.findMany({
    where: { playerId, ...(cursor ? { artworkId: { lt: cursor } } : {}) },
    orderBy: { artworkId: "desc" },
    take: limit,
  });
}

/** Điểm cao nhất từng đạt cho mỗi mẫu — cái sổ tay hiển thị, không phải lần vẽ gần nhất. */
export function listBestScores(playerId: string) {
  return prisma.artwork.groupBy({
    by: ["patternKey"],
    where: { playerId },
    _max: { score: true, stars: true },
  });
}
