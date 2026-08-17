# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Auth + game-progress backend for the "3x3 Ký Ức Di Sản" game. Node.js + TypeScript + Fastify + Prisma + PostgreSQL.

## Commands

```bash
npm run dev              # dev server with hot-reload (tsx watch), http://localhost:3000
npm run build             # compile to dist/ (tsc -p tsconfig.json)
npm start                 # run compiled build (dist/server.js)
npm run typecheck         # tsc --noEmit, no build output
npm run prisma:generate   # regenerate Prisma client after schema.prisma changes
npm run prisma:migrate    # create/apply a migration from prisma/schema.prisma
npm run prisma:studio     # open Prisma Studio to inspect/edit data
```

There is no test suite, linter, or CI pipeline configured yet.

Setup requires a running PostgreSQL instance with `DATABASE_URL` in `.env` pointing to it (copy `.env.example` → `.env` and fill in real `DATABASE_URL` / `JWT_SECRET` first).

## Architecture

Layered, module-per-feature structure. Request flow: `src/server.ts` calls `buildApp()` from `src/app.ts`, which creates the Fastify instance, wires the global error handler, and registers `src/routes/index.ts` — the single place that mounts every module's router.

Each feature lives under `src/modules/<name>/` as a vertical slice with a fixed layer breakdown (mirror this for any new module):
- `*.router.ts` — registers Fastify routes, wires `validateBody(schema)` and `requireAuth` preHandlers, points at controller functions. No logic here.
- `*.controller.ts` — thin HTTP adapter: reads `request.body`/`request.userId`, calls the service, shapes the `reply`. No business logic, no direct `prisma` access.
- `*.service.ts` — business logic. Calls the repository + `common/utils` helpers, throws `common/errors` classes on failure (never replies directly).
- `*.repository.ts` — the only layer that touches `prisma`. Plain functions wrapping `prisma.<model>.*` calls, including multi-table `$transaction`s.
- `*.schema.ts` — Zod request schemas + inferred TS input types.
- `*.types.ts` — shared response/DTO shapes for the module (e.g. `PublicUser`, `AuthTokens`).

Currently only `modules/auth` exists (register/login/refresh/logout/reset-password/me — see API table above). Add new features as new `modules/<name>/` directories with the same six-file shape; don't bolt new routes onto `auth`.

Cross-cutting layout:
- `src/config/env.ts` — loads `.env` and throws at startup if `DATABASE_URL` or `JWT_SECRET` is missing (no silent fallbacks). `src/config/database.ts` derives DB-specific config from it.
- `src/core/database/prisma.ts` — the shared `PrismaClient` singleton; only repositories should import this.
- `src/core/logger/logger.ts` — Fastify/pino logger config passed into `Fastify({ logger })`.
- `src/middlewares/validation.middleware.ts` — `validateBody(zodSchema)` preHandler factory; parses `request.body`, replaces it with the validated value, or throws `BadRequestError`.
- `src/middlewares/auth.middleware.ts` — `requireAuth` preHandler; verifies the `Authorization: Bearer` access token and sets `request.userId`, or throws `UnauthorizedError`.
- `src/middlewares/error.middleware.ts` — the single `setErrorHandler`. Catches `common/errors` `AppError` subclasses and replies with their `statusCode`/`details`; falls back to a Fastify error's own `statusCode` (e.g. malformed JSON), then a generic 500.
- `src/common/errors/` — `AppError` base class + `BadRequestError`/`UnauthorizedError`/`ConflictError`/`NotFoundError`. Services and middleware `throw` these; only `error.middleware.ts` ever formats an error response.
- `src/common/utils/` — cross-module stateless helpers: `password.util.ts` (bcrypt hashing + recovery-code generation), `token.util.ts` (JWT access tokens, opaque refresh tokens).
- `src/common/types/fastify.ts` — `FastifyRequest.userId` module augmentation.
- `prisma/schema.prisma` — single source of truth for the DB shape (`User`, `Session`, `UserProgress`).

Route handlers/services never call `reply.code(...).send(...)` for error cases — they `throw`, and `error.middleware.ts` is the only place that turns an error into an HTTP response. Keep this separation for new routes rather than replying inline.

### Auth model

Accounts use **username + password**, no email. Because there's no email, password reset relies on a **recovery code**: a high-entropy string returned exactly once, at registration or reset time (see `generateRecoveryCode` in `src/common/utils/password.util.ts`). Only its bcrypt hash is stored (`recoveryCodeHash`); losing the code means losing self-service recovery.

Two-token scheme:
- **Access token**: JWT, short-lived (`ACCESS_TOKEN_TTL`, default 15m), signed with `JWT_SECRET`, carries `{ sub: userId }`.
- **Refresh token**: opaque random string (`generateRefreshToken`), never stored raw — only its SHA-256 hash lives in the `sessions` table. Longer-lived (`REFRESH_TOKEN_TTL_DAYS`, default 30). Every use rotates it: `POST /auth/refresh` revokes the presented session row and issues a brand-new pair (see `refresh` in `src/modules/auth/auth.service.ts`).

Resetting a password (`POST /auth/reset-password`) revokes all of a user's active sessions (forces re-login everywhere) and issues a new recovery code, inside a single `prisma.$transaction` (`resetCredentials` in `src/modules/auth/auth.repository.ts`).

User-facing error strings returned by the API are in Vietnamese — match this when adding routes.

### Known gaps (see README "Chưa làm")

- `UserProgress` model exists in `prisma/schema.prisma` but has no route/controller yet.
- No rate limiting on `/auth/login` or `/auth/register`.
