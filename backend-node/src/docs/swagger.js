import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'RSSEE RAG API', version: '3.0.0', description: 'True LLM RAG chatbot API' },
  },
  apis: ['./src/routes/*.js'],
};

export const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(options)));
};
