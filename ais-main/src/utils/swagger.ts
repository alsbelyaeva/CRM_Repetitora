import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

/**
 * Sets up Swagger UI at /docs, using ./openapi.yaml
 */
export function setupSwagger(app: import('express').Express) {
  const specPath = path.join(__dirname, '..', 'openapi.yaml');
  let openapiDoc: any;
  try {
    const file = fs.readFileSync(specPath, 'utf-8');
    openapiDoc = yaml.parse(file);
  } catch (e) {
    console.warn('Swagger: failed to read openapi.yaml', e);
    return;
  }
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));
}