import { prisma } from "../../core/database/prisma";
import type { TxClient } from "../../common/services/economy.service";

export function getConfigState(client: TxClient | typeof prisma = prisma) {
  return client.configState.findUnique({
    where: { id: true },
    include: { publisher: { select: { email: true, displayName: true } } },
  });
}

/**
 * Tăng version. `version: { increment: 1 }` chứ không đọc-rồi-ghi: hai admin
 * bấm Xuất bản cùng lúc thì phép tăng nguyên tử của Postgres cho ra 2 lần tăng,
 * còn đọc-rồi-ghi cho ra 1 và một trong hai lần xuất bản biến mất không dấu vết.
 */
export function bumpVersion(tx: TxClient, adminId: string) {
  return tx.configState.update({
    where: { id: true },
    data: {
      version: { increment: 1 },
      publishedAt: new Date(),
      publishedBy: adminId,
    },
  });
}

/** Một vấn đề tìm thấy lúc duyệt đồ thị nội dung trước khi xuất bản. */
export interface PublishIssue {
  severity: "error" | "warning";
  code: string;
  table: string;
  rowKey: string;
  message: string;
}

/**
 * Duyệt đồ thị nội dung, tìm những chỗ gãy mà khoá ngoại KHÔNG bắt được.
 *
 * Ba loại lỗ hổng mà lược đồ cố ý để lại cho tầng này:
 *   1. quest_objective.target_key trỏ nhiều bảng khác nhau tuỳ `kind`, nên không
 *      đặt khoá ngoại được. Nhiệm vụ bảo "thu thập 3 ca_rot" trong khi ca_rot đã
 *      bị lưu trữ là nhiệm vụ không bao giờ xong được.
 *   2. Khoá ngoại chỉ ép "dòng có tồn tại", không ép "dòng đó đã xuất bản". Một
 *      nhiệm vụ published trỏ tới gói thưởng chứa vật phẩm draft thì lúc trả
 *      thưởng mới vỡ.
 *   3. quest.requires_quest tạo được vòng A→B→A; CHECK bên SQL chỉ chặn tự trỏ
 *      chính mình.
 *
 * Mỗi truy vấn trả về đúng dạng PublishIssue để gộp thẳng vào một mảng.
 */
export async function findPublishIssues(): Promise<PublishIssue[]> {
  const issues = await Promise.all([
    // 1. Nhiệm vụ published đòi một nhiệm vụ chưa published ⇒ khoá vĩnh viễn.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'error'::text AS severity,
             'quest_requires_unpublished'::text AS code,
             'content.quest'::text AS table,
             q.quest_key AS "rowKey",
             format('Nhiệm vụ "%s" đòi nhiệm vụ "%s" nhưng nhiệm vụ đó chưa xuất bản',
                    q.title, q.requires_quest)::text AS message
        FROM content.quest q
        JOIN content.quest r ON r.quest_key = q.requires_quest
       WHERE q.status = 'published' AND r.status <> 'published'
    `,

    // 2. Mục tiêu nhiệm vụ trỏ tới vật phẩm không tồn tại hoặc chưa xuất bản.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'error'::text AS severity,
             'objective_item_missing'::text AS code,
             'content.quest_objective'::text AS table,
             (qo.quest_key || '#' || qo.ordinal)::text AS "rowKey",
             format('Mục tiêu %s của nhiệm vụ "%s" trỏ tới vật phẩm "%s" không tồn tại hoặc chưa xuất bản',
                    qo.ordinal, q.title, qo.target_key)::text AS message
        FROM content.quest_objective qo
        JOIN content.quest q ON q.quest_key = qo.quest_key
       WHERE q.status = 'published'
         AND qo.kind IN ('thu_thap', 'giao_vat_pham', 'so_huu_vat_pham')
         AND qo.target_key IS NOT NULL
         AND NOT EXISTS (
               SELECT 1 FROM content.item i
                WHERE i.item_key = qo.target_key AND i.status = 'published'
             )
    `,

    // 3. Mục tiêu "nói chuyện NPC" trỏ tới NPC không có thật.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'error'::text AS severity,
             'objective_npc_missing'::text AS code,
             'content.quest_objective'::text AS table,
             (qo.quest_key || '#' || qo.ordinal)::text AS "rowKey",
             format('Mục tiêu %s của nhiệm vụ "%s" trỏ tới NPC "%s" không tồn tại',
                    qo.ordinal, q.title, qo.target_key)::text AS message
        FROM content.quest_objective qo
        JOIN content.quest q ON q.quest_key = qo.quest_key
       WHERE q.status = 'published'
         AND qo.kind = 'noi_chuyen_npc'
         AND qo.target_key IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM content.npc n WHERE n.npc_key = qo.target_key)
    `,

    // 4. Dòng thưởng trỏ tới vật phẩm chưa xuất bản — lúc trả thưởng mới vỡ.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'error'::text AS severity,
             'reward_item_unpublished'::text AS code,
             'content.reward_line'::text AS table,
             (b.bundle_key || '#' || rl.ordinal)::text AS "rowKey",
             format('Gói thưởng "%s" trả vật phẩm "%s" nhưng vật phẩm đó chưa xuất bản',
                    b.bundle_key, rl.item_key)::text AS message
        FROM content.reward_line rl
        JOIN content.reward_bundle b ON b.bundle_id = rl.bundle_id
        JOIN content.item i ON i.item_key = rl.item_key
       WHERE rl.item_key IS NOT NULL AND i.status <> 'published'
    `,

    // 5. Gói thưởng rỗng gắn vào nội dung đã xuất bản ⇒ người chơi bấm "Nhận"
    //    và không nhận được gì.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'warning'::text AS severity,
             'empty_bundle'::text AS code,
             'content.reward_bundle'::text AS table,
             b.bundle_key AS "rowKey",
             format('Gói thưởng "%s" không có dòng thưởng nào', b.bundle_key)::text AS message
        FROM content.reward_bundle b
       WHERE NOT EXISTS (SELECT 1 FROM content.reward_line rl WHERE rl.bundle_id = b.bundle_id)
         AND (
           EXISTS (SELECT 1 FROM content.quest q WHERE q.bundle_id = b.bundle_id AND q.status = 'published')
           OR EXISTS (SELECT 1 FROM content.achievement a WHERE a.bundle_id = b.bundle_id AND a.status = 'published')
           OR EXISTS (SELECT 1 FROM content.mail_template m WHERE m.bundle_id = b.bundle_id AND m.status = 'published')
           OR EXISTS (SELECT 1 FROM content.shop_product s WHERE s.bundle_id = b.bundle_id AND s.status = 'published')
         )
    `,

    // 6. Banner đang mở nhưng bể quay rỗng ⇒ quay mất tiền, không ra gì.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'error'::text AS severity,
             'empty_banner'::text AS code,
             'content.banner'::text AS table,
             b.banner_key AS "rowKey",
             format('Banner "%s" đã xuất bản nhưng không có vật phẩm nào', b.display_name)::text AS message
        FROM content.banner b
       WHERE b.status = 'published'
         AND NOT EXISTS (SELECT 1 FROM content.banner_entry e WHERE e.banner_id = b.banner_id)
    `,

    // 7. Vật phẩm gacha trả về một item chưa xuất bản.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'error'::text AS severity,
             'gacha_grant_unpublished'::text AS code,
             'content.gacha_item'::text AS table,
             g.gacha_item_key AS "rowKey",
             format('Vật phẩm gacha "%s" trả về "%s" nhưng vật phẩm đó chưa xuất bản',
                    g.display_name, g.grants_item_key)::text AS message
        FROM content.gacha_item g
        JOIN content.item i ON i.item_key = g.grants_item_key
       WHERE g.grants_item_key IS NOT NULL
         AND i.status <> 'published'
         AND EXISTS (
               SELECT 1 FROM content.banner_entry e
                 JOIN content.banner b ON b.banner_id = e.banner_id
                WHERE e.gacha_item_key = g.gacha_item_key AND b.status = 'published'
             )
    `,

    // 8. Cây trồng trỏ tới hạt giống hoặc nông sản chưa xuất bản.
    prisma.$queryRaw<PublishIssue[]>`
      SELECT 'error'::text AS severity,
             'crop_item_unpublished'::text AS code,
             'content.crop'::text AS table,
             c.crop_key AS "rowKey",
             format('Cây "%s" dùng vật phẩm "%s" chưa xuất bản', c.crop_key, i.item_key)::text AS message
        FROM content.crop c
        JOIN content.item i ON i.item_key IN (c.seed_item_key, c.harvest_item_key)
       WHERE i.status <> 'published'
    `,

    // 9. Vòng phụ thuộc nhiệm vụ. CHECK bên SQL chỉ chặn A→A; A→B→A phải bắt ở
    //    đây bằng WITH RECURSIVE. UNION (không phải UNION ALL) là thứ chặn vòng
    //    lặp vô hạn: gặp lại cặp đã thấy thì dừng.
    prisma.$queryRaw<PublishIssue[]>`
      WITH RECURSIVE chain(start_key, current_key, depth) AS (
          SELECT quest_key, requires_quest, 1
            FROM content.quest
           WHERE requires_quest IS NOT NULL
          UNION
          SELECT c.start_key, q.requires_quest, c.depth + 1
            FROM chain c
            JOIN content.quest q ON q.quest_key = c.current_key
           WHERE q.requires_quest IS NOT NULL AND c.depth < 50
      )
      SELECT DISTINCT
             'error'::text AS severity,
             'quest_cycle'::text AS code,
             'content.quest'::text AS table,
             start_key AS "rowKey",
             format('Nhiệm vụ "%s" nằm trong một vòng phụ thuộc', start_key)::text AS message
        FROM chain
       WHERE current_key = start_key
    `,
  ]);

  return issues.flat();
}

/** Vài con số cho trang chủ quản trị. */
export async function dashboardCounts() {
  const [players, items, quests, achievements, banners, shopProducts, mails, pulls] =
    await Promise.all([
      prisma.player.count(),
      prisma.item.count({ where: { status: "published" } }),
      prisma.quest.count({ where: { status: "published" } }),
      prisma.achievement.count({ where: { status: "published" } }),
      prisma.banner.count({ where: { status: "published" } }),
      prisma.shopProduct.count({ where: { status: "published" } }),
      prisma.mail.count({ where: { deletedAt: null } }),
      prisma.gachaPull.count(),
    ]);

  return {
    players,
    publishedItems: items,
    publishedQuests: quests,
    publishedAchievements: achievements,
    publishedBanners: banners,
    publishedShopProducts: shopProducts,
    mailsInFlight: mails,
    gachaPulls: pulls,
  };
}

/** Số bản nháp đang chờ — trang chủ hiện "có N thay đổi chưa xuất bản". */
export async function draftCounts() {
  const [items, quests, achievements, mailTemplates, banners, shopProducts, codex] =
    await Promise.all([
      prisma.item.count({ where: { status: "draft" } }),
      prisma.quest.count({ where: { status: "draft" } }),
      prisma.achievement.count({ where: { status: "draft" } }),
      prisma.mailTemplate.count({ where: { status: "draft" } }),
      prisma.banner.count({ where: { status: "draft" } }),
      prisma.shopProduct.count({ where: { status: "draft" } }),
      prisma.codexEntry.count({ where: { status: "draft" } }),
    ]);

  const total = items + quests + achievements + mailTemplates + banners + shopProducts + codex;
  return { items, quests, achievements, mailTemplates, banners, shopProducts, codex, total };
}
