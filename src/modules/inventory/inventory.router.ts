import type { FastifyInstance } from "fastify";
import * as inventoryController from "./inventory.controller";
import {
  discardSchema,
  equipParamsSchema,
  equipSchema,
  useItemSchema,
  type DiscardInput,
  type EquipInput,
  type EquipParams,
  type UseItemInput,
} from "./inventory.schema";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../../middlewares/auth.middleware";

export async function inventoryRouter(app: FastifyInstance) {
  app.get("/me/inventory", { preHandler: requireAuth }, inventoryController.listInventory);

  app.post<{ Body: UseItemInput }>(
    "/me/inventory/use",
    { preHandler: [requireAuth, validateBody(useItemSchema)] },
    inventoryController.useItem,
  );

  app.post<{ Body: DiscardInput }>(
    "/me/inventory/discard",
    { preHandler: [requireAuth, validateBody(discardSchema)] },
    inventoryController.discardItem,
  );

  app.get("/me/equipment", { preHandler: requireAuth }, inventoryController.listEquipment);

  app.put<{ Params: EquipParams; Body: EquipInput }>(
    "/me/equipment/:slot",
    { preHandler: [requireAuth, validateParams(equipParamsSchema), validateBody(equipSchema)] },
    inventoryController.equip,
  );

  app.delete<{ Params: EquipParams }>(
    "/me/equipment/:slot",
    { preHandler: [requireAuth, validateParams(equipParamsSchema)] },
    inventoryController.unequip,
  );
}
