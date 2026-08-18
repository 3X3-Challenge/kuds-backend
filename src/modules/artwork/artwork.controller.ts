import type { FastifyReply, FastifyRequest } from "fastify";
import * as artworkService from "./artwork.service";
import { playerIdOf } from "../../middlewares/auth.middleware";
import type { ArtworkQuery, SubmitArtworkInput } from "./artwork.schema";

export async function submit(
  request: FastifyRequest<{ Body: SubmitArtworkInput }>,
  reply: FastifyReply,
) {
  const result = await artworkService.submit(playerIdOf(request), request.body);
  return reply.code(201).send(result);
}

export async function listArtworks(
  request: FastifyRequest<{ Querystring: ArtworkQuery }>,
  reply: FastifyReply,
) {
  return reply.send(await artworkService.listArtworks(playerIdOf(request), request.query));
}

export async function listBestScores(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await artworkService.listBestScores(playerIdOf(request)));
}
