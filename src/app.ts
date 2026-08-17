import Fastify from 'fastify';
import { registerRoutes } from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { loggerConfig } from './core/logger/logger';

export function buildApp() {
  const app = Fastify({ logger: loggerConfig });

  errorMiddleware(app);

  app.get('/', async () => ({ message: 'Ký ức di sản - Server is running' }));

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(registerRoutes);

  return app;
}
