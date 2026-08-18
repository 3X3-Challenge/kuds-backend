import "fastify";

/** Danh tính admin gắn vào request sau khi qua `requireAdmin`. */
export interface AdminContext {
  adminId: string;
  email: string;
  role: "viewer" | "editor" | "publisher";
}

declare module "fastify" {
  interface FastifyRequest {
    /**
     * game.player.player_id — khoá mà MỌI bảng trạng thái người chơi trỏ tới.
     * Đặt bởi `requireAuth`. Đây không phải account_id: một account có đúng một
     * player, nhưng lệnh cấm/xoá tài khoản làm việc trên account, còn túi đồ /
     * ví / thư thì làm việc trên player.
     */
    playerId?: string;
    /** game.account.account_id — chỉ cần cho thao tác cấp tài khoản (đăng xuất, liên kết provider). */
    accountId?: string;
    admin?: AdminContext;
  }
}
