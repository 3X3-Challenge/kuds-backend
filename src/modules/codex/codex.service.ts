import * as codexRepository from "./codex.repository";
import { NotFoundError } from "../../common/errors";

export async function listUnlocks(playerId: string) {
  const rows = await codexRepository.listUnlocks(playerId);
  return rows.map((c) => ({ entryKey: c.entryKey, unlockedAt: c.unlockedAt }));
}

export async function unlock(playerId: string, entryKey: string) {
  const entry = await codexRepository.findPublishedEntry(entryKey);
  if (!entry) {
    throw new NotFoundError("Mục sổ tay không tồn tại hoặc chưa mở");
  }

  const isNew = await codexRepository.unlock(playerId, entryKey);
  // isNew phân biệt "vừa mở lần đầu" (client chạy hoạt ảnh mở khoá) với "đã có
  // từ trước" (im lặng). Cả hai đều là 200 — không có gì sai ở đây.
  return { entryKey, isNew };
}
