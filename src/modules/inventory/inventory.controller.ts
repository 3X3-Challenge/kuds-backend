import type { FastifyReply, FastifyRequest } from "fastify";
import * as inventoryService from "./inventory.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { DiscardInput, EquipInput, EquipParams, UseItemInput } from "./inventory.schema";

export async function listInventory(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await inventoryService.listInventory(playerIdOf(request)));
}

export async function useItem(
  request: FastifyRequest<{ Body: UseItemInput }>,
  reply: FastifyReply,
) {
  return reply.send(await inventoryService.useItem(playerIdOf(request), request.body));
}

export async function discardItem(
  request: FastifyRequest<{ Body: DiscardInput }>,
  reply: FastifyReply,
) {
  return reply.send(await inventoryService.discardItem(playerIdOf(request), request.body));
}

export async function listEquipment(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await inventoryService.listEquipment(playerIdOf(request)));
}

export async function equip(
  request: FastifyRequest<{ Params: EquipParams; Body: EquipInput }>,
  reply: FastifyReply,
) {
  const result = await inventoryService.equip(
    playerIdOf(request),
    request.params.slot,
    request.body,
  );
  return reply.send(result);
}

export async function unequip(
  request: FastifyRequest<{ Params: EquipParams }>,
  reply: FastifyReply,
) {
  return reply.send(await inventoryService.unequip(playerIdOf(request), request.params.slot));
}
