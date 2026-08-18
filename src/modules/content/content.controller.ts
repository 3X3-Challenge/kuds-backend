import type { FastifyReply, FastifyRequest } from "fastify";
import * as contentService from "./content.service";
import type { CatalogQuery } from "./content.schema";

export async function getVersion(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.getVersion());
}

/**
 * Danh mục đầy đủ. Client gửi `?version=` nó đang giữ; khớp thì trả 304 và
 * không tốn băng thông nào.
 *
 * ETag đặt kèm để proxy/CDN cũng dùng được cơ chế này mà không cần biết gì về
 * query của mình.
 */
export async function getCatalog(
  request: FastifyRequest<{ Querystring: CatalogQuery }>,
  reply: FastifyReply,
) {
  const { version } = await contentService.getVersion();

  if (request.query.version === version) {
    return reply.code(304).send();
  }

  const catalog = await contentService.getCatalog();
  return reply.header("etag", `"catalog-${catalog.version}"`).send(catalog);
}

export async function listItems(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listItems());
}

export async function listCrops(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listCrops());
}

export async function listPatterns(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listPatterns());
}

export async function listNpcs(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listNpcs());
}

export async function listQuests(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listQuests());
}

export async function listAchievements(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listAchievements());
}

export async function listMailTemplates(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listMailTemplates());
}

export async function listCodexEntries(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listCodexEntries());
}

export async function listGachaItems(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listGachaItems());
}

export async function listBanners(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listBanners());
}

export async function listShopProducts(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await contentService.listShopProducts());
}
