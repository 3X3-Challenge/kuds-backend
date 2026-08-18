import type { Prisma } from "@prisma/client";
import * as artworkRepository from "./artwork.repository";
import { NotFoundError } from "../../common/errors";
import type { ArtworkQuery, SubmitArtworkInput } from "./artwork.schema";

/**
 * Ngưỡng điểm → số sao. Server tự suy chứ KHÔNG nhận `stars` từ client: gửi kèm
 * cả điểm lẫn sao là mời client tự khai 100 điểm 3 sao. Đổi ngưỡng ở đây là đổi
 * cho toàn bộ game, và bảng xếp hạng cũ vẫn giữ nguyên số sao đã lưu.
 */
const STAR_THRESHOLDS = [
  { min: 90, stars: 3 },
  { min: 70, stars: 2 },
  { min: 50, stars: 1 },
] as const;

function starsFor(score: number): number {
  return STAR_THRESHOLDS.find((t) => score >= t.min)?.stars ?? 0;
}

export async function submit(playerId: string, input: SubmitArtworkInput) {
  const pattern = await artworkRepository.findPattern(input.patternKey);
  if (!pattern) {
    throw new NotFoundError(`Mẫu tranh không tồn tại: ${input.patternKey}`);
  }

  const artwork = await artworkRepository.createArtwork({
    playerId,
    patternKey: input.patternKey,
    score: input.score,
    stars: starsFor(input.score),
    strokes: input.strokes as Prisma.InputJsonValue | undefined,
  });

  return {
    artworkId: artwork.artworkId.toString(),
    patternKey: artwork.patternKey,
    score: artwork.score,
    stars: artwork.stars,
    finishedAt: artwork.finishedAt,
  };
}

export async function listArtworks(playerId: string, query: ArtworkQuery) {
  const cursor = query.cursor ? BigInt(query.cursor) : undefined;
  const rows = await artworkRepository.listArtworks(playerId, query.limit, cursor);

  const items = rows.map((a) => ({
    artworkId: a.artworkId.toString(),
    patternKey: a.patternKey,
    score: a.score,
    stars: a.stars,
    strokes: a.strokes,
    finishedAt: a.finishedAt,
  }));

  return {
    items,
    nextCursor: items.length === query.limit ? items[items.length - 1]!.artworkId : null,
  };
}

export async function listBestScores(playerId: string) {
  const rows = await artworkRepository.listBestScores(playerId);
  return rows.map((r) => ({
    patternKey: r.patternKey,
    bestScore: r._max.score ?? 0,
    bestStars: r._max.stars ?? 0,
  }));
}
