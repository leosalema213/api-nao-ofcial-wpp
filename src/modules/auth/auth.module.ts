/**
 * AuthModule - Módulo de Autenticação Baileys
 *
 * Gerencia sessões do WhatsApp via Supabase.
 * Exporta AuthService para uso por outros módulos (ex: InstanceModule).
 */

import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService], // InstanceModule vai precisar usar
})
export class AuthModule {}
