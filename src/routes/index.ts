import type { FastifyInstance } from "fastify";
import { authRouter } from "../modules/auth/auth.router";

export async function registerRoutes(app: FastifyInstance) {
  app.register(authRouter);
}
