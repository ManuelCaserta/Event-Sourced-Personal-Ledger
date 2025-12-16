import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../swagger.js';

export function createSwaggerRoutes() {
  const router = Router();

  router.use('/docs', swaggerUi.serve);
  router.get('/docs', swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
  }));

  return router;
}

