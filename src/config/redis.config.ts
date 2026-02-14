/**
 * Configuração do Redis (para BullMQ)
 *
 * Este módulo exporta as configurações de conexão do Redis
 * usadas pelas filas BullMQ.
 */

import * as dotenv from 'dotenv';

dotenv.config();

export const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Necessário para BullMQ
};
