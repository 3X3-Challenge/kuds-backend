import { prisma } from "../../core/database/prisma";

export function listUnlocks(playerId: string) {
  return prisma.codexUnlock.findMany({
    where: { playerId },
    orderBy: { entryKey: "asc" },
  });
}

export function findPublishedEntry(entryKey: string) {
  return prisma.codexEntry.findFirst({ where: { entryKey, status: "published" } });
}

/**
 * Mở khoá một mục sổ tay.
 *
 * createMany + skipDuplicates thay vì create: mở lại một mục đã mở là chuyện
 * bình thường (đi ngang qua cùng một điểm mốc lần nữa), không phải lỗi 409. Và
 * quan trọng hơn: KHÔNG được cập nhật unlockedAt của mục đã mở — mốc thời gian
 * lần đầu là thứ sổ tay hiển thị.
 */
export async function unlock(playerId: string, entryKey: string): Promise<boolean> {
  const result = await prisma.codexUnlock.createMany({
    data: [{ playerId, entryKey }],
    skipDuplicates: true,
  });
  return result.count === 1;
}
