/**
 * Configuração do Redis (para BullMQ)
 *
 * Este módulo exporta as configurações de conexão do Redis
 * usadas pelas filas BullMQ.
 *
 * Suporta duas formas de configuração:
 * 1. REDIS_URL completa (recomendado para Redis remoto)
 * 2. REDIS_HOST + REDIS_PORT + REDIS_PASSWORD (configuração separada)
 */

import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Configuração do Redis
 *
 * Se REDIS_URL estiver definida, usa ela diretamente (formato: redis://user:pass@host:port)
 * Caso contrário, usa configuração separada (host, port, password)
 */
export const redisConfig = process.env.REDIS_URL
  ? {
      url: process.env.REDIS_URL,
      maxRetriesPerRequest: null, // Necessário para BullMQ
    }
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // Necessário para BullMQ
    };
