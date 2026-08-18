import type { FastifyInstance } from "fastify";
import * as farmController from "./farm.controller";
import { plantSchema, plotParamsSchema, type PlantInput, type PlotParams } from "./farm.schema";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function farmRouter(app: FastifyInstance) {
  app.get("/me/farm", { preHandler: requireAuth }, farmController.listPlots);

  app.post<{ Params: PlotParams; Body: PlantInput }>(
    "/me/farm/:plotIndex/plant",
    { preHandler: [requireAuth, validateParams(plotParamsSchema), validateBody(plantSchema)] },
    farmController.plant,
  );

  app.post<{ Params: PlotParams }>(
    "/me/farm/:plotIndex/water",
    { preHandler: [requireAuth, validateParams(plotParamsSchema)] },
    farmController.water,
  );

  app.post<{ Params: PlotParams }>(
    "/me/farm/:plotIndex/harvest",
    { preHandler: [requireAuth, validateParams(plotParamsSchema)] },
    farmController.harvest,
  );
}
