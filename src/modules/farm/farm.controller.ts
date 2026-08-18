import type { FastifyReply, FastifyRequest } from "fastify";
import * as farmService from "./farm.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { PlantInput, PlotParams } from "./farm.schema";

export async function listPlots(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await farmService.listPlots(playerIdOf(request)));
}

export async function plant(
  request: FastifyRequest<{ Params: PlotParams; Body: PlantInput }>,
  reply: FastifyReply,
) {
  const result = await farmService.plant(
    playerIdOf(request),
    request.params.plotIndex,
    request.body,
  );
  return reply.send(result);
}

export async function water(
  request: FastifyRequest<{ Params: PlotParams }>,
  reply: FastifyReply,
) {
  return reply.send(await farmService.water(playerIdOf(request), request.params.plotIndex));
}

export async function harvest(
  request: FastifyRequest<{ Params: PlotParams }>,
  reply: FastifyReply,
) {
  return reply.send(await farmService.harvest(playerIdOf(request), request.params.plotIndex));
}
