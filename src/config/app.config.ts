/**
 * Configuração global da aplicação
 *
 * Carrega variáveis de ambiente e exporta constantes
 * usadas em toda a aplicação.
 */

import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  /**
   * Porta do servidor
   */
  port: parseInt(process.env.PORT || '3000', 10),

  /**
   * Ambiente de execução
   */
  nodeEnv: process.env.NODE_ENV || 'development',

  /**
   * Quantidade máxima de instâncias WhatsApp simultâneas
   */
  maxInstances: parseInt(process.env.MAX_INSTANCES || '80', 10),

  /**
   * Delay (em ms) entre inicializações de instâncias
   *
   * FUNDAMENTO: "Staggered Boot"
   * Evita pico de CPU/memória ao iniciar 80 instâncias simultaneamente.
   * Com 500ms de delay, 80 instâncias levam ~40 segundos para iniciar.
   */
  staggeredBootDelayMs: parseInt(
    process.env.STAGGERED_BOOT_DELAY_MS || '500',
    10,
  ),

  /**
   * Dias de retenção das mensagens no banco
   */
  messagesRetentionDays: parseInt(
    process.env.MESSAGES_RETENTION_DAYS || '7',
    10,
  ),
};
