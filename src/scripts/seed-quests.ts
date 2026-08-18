/**
 * Nạp nội dung thật cho 3 nhiệm vụ đang rỗng trong content.quest.
 *
 *   npm run seed:quests                 # chỉ in ra sẽ đổi gì, không ghi
 *   npm run seed:quests -- --apply      # làm thật
 *   npm run seed:quests -- --apply --force   # ghi đè cả khi đã có người chơi nhận
 *
 * Vì sao cần: seed.sql cố ý để trống `title` và KHÔNG tạo dòng
 * content.quest_objective nào (xem phần 7 và 9 của prisma/sql/seed.sql) — lúc đó
 * repo chưa có vật phẩm nào khớp với câu văn nhiệm vụ, nên mọi target_key đều sẽ
 * là khoá bịa. Hệ quả: ba nhiệm vụ ra tới client dưới dạng vỏ rỗng, không tên và
 * không mục tiêu, nhận xong là kẹt vĩnh viễn vì không có mục tiêu nào để hoàn
 * thành.
 *
 * Kịch bản này vá đúng chỗ thiếu đó:
 *   1. thêm vật phẩm 'buong_dua_nuoc' — target_key mà nhiệm vụ dua_nuoc cần,
 *   2. đặt title cho cả ba,
 *   3. tạo content.quest_objective (0-based ordinal, ĐÚNG như trang quản trị),
 *   4. gắn gói thưởng lồng đèn cho từng nhiệm vụ,
 *   5. tăng content.config_state.version để client tải lại danh mục.
 * Tất cả trong MỘT transaction.
 *
 * CHẠY LẠI ĐƯỢC: mọi bước đều upsert, chạy hai lần không nhân đôi dòng nào.
 *
 * CẢNH BÁO: bước 3 xoá rồi tạo lại quest_objective. player_quest_objective
 * cascade theo nó, nên tiến độ của người chơi trên 3 nhiệm vụ này sẽ mất. Kịch
 * bản DỪNG nếu phát hiện có người đã nhận, trừ khi truyền --force.
 */
import "./small-pool";
import { prisma } from "../core/database/prisma";
import type { ObjectiveKind } from "@prisma/client";

/** --apply chứ không phải --yes: trên Windows npm nuốt mất --yes (xem publish-content.ts). */
const APPLY = process.argv.includes("--apply") || process.argv.includes("--yes");
const FORCE = process.argv.includes("--force");

/**
 * Vật phẩm mục tiêu của nhiệm vụ dua_nuoc.
 *
 * KHÔNG có sprite bag_item_buong_dua_nuoc.png trong repo game — ô túi đồ sẽ
 * trống ảnh nếu vật phẩm này rơi vào tay người chơi. Chấp nhận được vì hiện nó
 * chỉ đóng vai target_key của mục tiêu, không nằm trong gói thưởng nào. Có sprite
 * rồi thì không phải sửa gì ở đây.
 */
const QUEST_ITEM = {
  itemKey: "buong_dua_nuoc",
  displayName: "Buồng dừa nước",
  description: "Thu hoạch ở rặng dừa nước ven sông.",
  category: "thuc_pham",
  sortOrder: 33,
} as const;

type ObjectiveSeed = {
  kind: ObjectiveKind;
  targetKey: string | null;
  targetCount: number;
};

type QuestSeed = {
  questKey: string;
  /** Tên nhiệm vụ. Repo KHÔNG có sẵn tên — ba tên dưới đây rút từ chính summary. */
  title: string;
  /** Gói thưởng: lồng đèn là tiền mềm, đúng vai "phần thưởng nhiệm vụ" của lược đồ. */
  bundleKey: string;
  bundleNote: string;
  reward: number;
  objectives: ObjectiveSeed[];
};

const QUESTS: QuestSeed[] = [
  {
    questKey: "dua_nuoc",
    title: "Buồng dừa nước cho chú Tư",
    bundleKey: "quest_dua_nuoc",
    bundleNote: "Thưởng nhiệm vụ Buồng dừa nước cho chú Tư",
    reward: 120,
    // summary: "Thu thập 3 buồng dừa nước và mang về cho chú Tư."
    //
    // Tách làm MỘT mục tiêu chứ không phải hai. Câu văn có hai vế (thu thập +
    // mang về) nhưng giao_vat_pham cần biết giao cho NPC nào, mà quest_objective
    // chỉ có đúng một cột target_key — điền item thì mất NPC, điền NPC thì mất
    // item. Ghép thành một mục tiêu thu_thap là cách duy nhất không mất thông tin.
    objectives: [{ kind: "thu_thap", targetKey: QUEST_ITEM.itemKey, targetCount: 3 }],
  },
  {
    questKey: "chu_tu",
    title: "Chuyện cù lao",
    bundleKey: "quest_chu_tu",
    bundleNote: "Thưởng nhiệm vụ Chuyện cù lao",
    reward: 60,
    // summary: "Trò chuyện cùng chú Tư và tìm hiểu về cù lao."
    // 'chu_tu' là npc_key có thật trong content.npc (seed.sql phần 2).
    objectives: [{ kind: "noi_chuyen_npc", targetKey: "chu_tu", targetCount: 1 }],
  },
  {
    questKey: "thu_cung",
    title: "Bữa ăn của thú cưng",
    bundleKey: "quest_thu_cung",
    bundleNote: "Thưởng nhiệm vụ Bữa ăn của thú cưng",
    reward: 80,
    // summary: "Cho thú cưng ăn 3 lần."
    // target_key NULL: câu văn không nói thú cưng nào, và repo cũng chưa có bảng
    // thú cưng. Đừng bịa khoá cho đủ cột.
    objectives: [{ kind: "cho_thu_cung_an", targetKey: null, targetCount: 3 }],
  },
];

/** Người chơi đã nhận nhiệm vụ nào trong số 3 cái sắp bị thay mục tiêu. */
async function playersAtRisk() {
  const rows = await prisma.playerQuest.groupBy({
    by: ["questKey"],
    where: { questKey: { in: QUESTS.map((q) => q.questKey) } },
    _count: { playerId: true },
  });
  return rows.map((r) => ({ questKey: r.questKey, players: r._count.playerId }));
}

async function preview() {
  const existing = await prisma.quest.findMany({
    where: { questKey: { in: QUESTS.map((q) => q.questKey) } },
    include: { objectives: true },
  });
  const byKey = new Map(existing.map((q) => [q.questKey, q]));

  console.log("Sẽ ghi:\n");

  const item = await prisma.item.findUnique({ where: { itemKey: QUEST_ITEM.itemKey } });
  console.log(
    `  content.item  ${QUEST_ITEM.itemKey}  ${item ? "(đã có, cập nhật)" : "(TẠO MỚI)"}` +
      ` — ${QUEST_ITEM.displayName}`,
  );
  console.log();

  for (const seed of QUESTS) {
    const row = byKey.get(seed.questKey);
    if (!row) {
      console.log(`  content.quest ${seed.questKey}  KHÔNG TỒN TẠI — bỏ qua, chạy seed.sql trước`);
      continue;
    }

    const tenCu = row.title === "" ? "(trống)" : row.title;
    console.log(`  content.quest ${seed.questKey}`);
    console.log(`      title      ${tenCu}  ⇒  ${seed.title}`);
    console.log(`      bundle     ${row.bundleId === null ? "(không)" : row.bundleId} ⇒ ${seed.bundleKey} (${seed.reward} lồng đèn)`);
    console.log(`      mục tiêu   ${row.objectives.length} dòng  ⇒  ${seed.objectives.length} dòng`);
    for (let i = 0; i < seed.objectives.length; i++) {
      const o = seed.objectives[i];
      console.log(`        [${i}] ${o.kind}  target=${o.targetKey ?? "NULL"}  count=${o.targetCount}`);
    }
    console.log();
  }
}

async function apply() {
  await prisma.$transaction(
    async (tx) => {
      // 1. Vật phẩm mục tiêu. published ngay: draft thì không ra tới /content/catalog,
      //    mà người chơi cần thấy nó trong túi thì mới biết mình đang thu thập gì.
      await tx.item.upsert({
        where: { itemKey: QUEST_ITEM.itemKey },
        create: { ...QUEST_ITEM, status: "published" },
        update: {
          displayName: QUEST_ITEM.displayName,
          description: QUEST_ITEM.description,
          category: QUEST_ITEM.category,
          sortOrder: QUEST_ITEM.sortOrder,
          status: "published",
        },
      });

      for (const seed of QUESTS) {
        const quest = await tx.quest.findUnique({ where: { questKey: seed.questKey } });
        if (!quest) {
          console.log(`  bỏ qua ${seed.questKey} — không có dòng nào trong content.quest`);
          continue;
        }

        // 2. Gói thưởng. reward_line dùng khoá ghép (bundle_id, ordinal) nên
        //    upsert được thẳng, không cần xoá trước.
        const bundle = await tx.rewardBundle.upsert({
          where: { bundleKey: seed.bundleKey },
          create: { bundleKey: seed.bundleKey, note: seed.bundleNote },
          update: { note: seed.bundleNote },
        });

        await tx.rewardLine.upsert({
          where: { bundleId_ordinal: { bundleId: bundle.bundleId, ordinal: 0 } },
          create: {
            bundleId: bundle.bundleId,
            ordinal: 0,
            currency: "long_den",
            amount: seed.reward,
          },
          update: { currency: "long_den", itemKey: null, amount: seed.reward },
        });

        // 3. Mục tiêu: xoá sạch rồi tạo lại, giống hệt nhánh update của trang
        //    quản trị (admin-content.resources.ts). ordinal đánh từ 0 để hai
        //    đường ghi không sinh ra hai quy ước khác nhau trên cùng một bảng.
        await tx.questObjective.deleteMany({ where: { questKey: seed.questKey } });
        await tx.questObjective.createMany({
          data: seed.objectives.map((o, ordinal) => ({
            questKey: seed.questKey,
            ordinal,
            kind: o.kind,
            targetKey: o.targetKey,
            targetCount: o.targetCount,
          })),
        });

        // 4. Tên + gói thưởng + published.
        await tx.quest.update({
          where: { questKey: seed.questKey },
          data: { title: seed.title, bundleId: bundle.bundleId, status: "published" },
        });

        console.log(`  ${seed.questKey}: "${seed.title}", ${seed.objectives.length} mục tiêu, ${seed.reward} lồng đèn`);
      }

      // 5. Đổi nội dung mà không tăng version thì client vẫn dùng bản danh mục cũ
      //    trên đĩa — ContentService chỉ tải lại khi số này khác (ContentService.cs).
      const state = await tx.configState.update({
        where: { id: true },
        data: { version: { increment: 1 }, publishedAt: new Date() },
      });

      console.log(`\ncontent.config_state.version = ${state.version}`);
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

async function main() {
  console.log("\n=== Nạp nội dung nhiệm vụ ===\n");

  await preview();

  const risk = await playersAtRisk();
  if (risk.length > 0) {
    console.log("Đang có người chơi nhận những nhiệm vụ này:");
    for (const r of risk) {
      console.log(`  ${r.questKey}: ${r.players} người — tiến độ sẽ bị xoá`);
    }
    console.log();

    if (!FORCE) {
      console.log("Dừng lại. Thêm --force nếu chấp nhận xoá tiến độ đó.\n");
      return;
    }
    console.log("--force: vẫn ghi đè.\n");
  }

  if (!APPLY) {
    console.log("Chạy thử, KHÔNG ghi gì. Thêm --apply để làm thật.\n");
    return;
  }

  console.log("Đang ghi...\n");
  await apply();
  console.log("\nXong. Vào game, danh mục sẽ tự tải lại ở lần mở kế tiếp.\n");
}

main()
  .catch((err) => {
    console.error("\nHỎNG — đã rollback, DB giữ nguyên như trước khi chạy:\n");
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
