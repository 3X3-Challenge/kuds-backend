import type { FastifyInstance } from "fastify";
import * as artworkController from "./artwork.controller";
import {
  artworkQuerySchema,
  submitArtworkSchema,
  type ArtworkQuery,
  type SubmitArtworkInput,
} from "./artwork.schema";
import { validateBody, validateQuery } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function artworkRouter(app: FastifyInstance) {
  app.get<{ Querystring: ArtworkQuery }>(
    "/me/artworks",
    { preHandler: [requireAuth, validateQuery(artworkQuerySchema)] },
    artworkController.listArtworks,
  );

  app.get("/me/artworks/best", { preHandler: requireAuth }, artworkController.listBestScores);

  app.post<{ Body: SubmitArtworkInput }>(
    "/me/artworks",
    {
      preHandler: [requireAuth, validateBody(submitArtworkSchema)],
      // `strokes` là mảng nét vẽ, có thể rất dài. Trần riêng 1 MB thay vì trần
      // mặc định 1 MB của cả app — để chỗ này nới được mà không nới cho mọi route.
      bodyLimit: 1_048_576,
    },
    artworkController.submit,
  );
}
