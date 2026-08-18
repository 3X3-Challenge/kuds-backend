import type { FastifyError, FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { AppError } from "../common/errors";

export function errorMiddleware(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.details });
    }

    // Rất nhiều luật của lược đồ này chỉ sống ở DB (CHECK tiền/vật phẩm loại trừ
    // nhau, partial unique index chống nhận thưởng hai lần, khoá ngoại ghép
    // (item, slot) của trang bị). Không dịch chúng ở đây thì mọi vi phạm luật
    // game đều hiện ra là 500 và không ai biết chuyện gì xảy ra.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case "P2002":
          return reply.code(409).send({ error: "Dữ liệu đã tồn tại", meta: error.meta });
        case "P2003":
          return reply.code(400).send({ error: "Tham chiếu tới dữ liệu không tồn tại", meta: error.meta });
        case "P2025":
          return reply.code(404).send({ error: "Không tìm thấy dữ liệu" });
        // 23514 = check_violation. Prisma gói lỗi Postgres thô vào P2010 khi đi
        // qua $queryRaw / $executeRaw.
        case "P2010":
          if (String((error.meta as { code?: string } | undefined)?.code) === "23514") {
            return reply.code(422).send({ error: "Vi phạm ràng buộc dữ liệu" });
          }
          break;
      }
    }

    // Fastify's own errors (malformed JSON, payload too large, etc.) carry a statusCode.
    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });
}
