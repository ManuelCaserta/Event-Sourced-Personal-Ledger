import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Event-Sourced Personal Ledger API',
      version: '1.0.0',
      description: 'REST API for personal ledger with event sourcing',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: {
              type: 'string',
              description: 'Error code identifier',
              example: 'INVALID_AMOUNT',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Amount must be greater than zero',
            },
            details: {
              type: 'object',
              description: 'Additional error details (optional)',
              additionalProperties: true,
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Accounts', description: 'Account management' },
      { name: 'Transactions', description: 'Income and expense recording' },
      { name: 'Transfers', description: 'Money transfers between accounts' },
      { name: 'Movements', description: 'Transaction history' },
    ],
  },
  apis: ['./src/infra/http/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

