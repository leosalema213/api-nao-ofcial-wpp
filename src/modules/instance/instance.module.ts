/**
 * InstanceModule - Gerenciamento de Instâncias WhatsApp
 *
 * Importa AuthModule para acesso ao AuthService.
 * Expõe endpoints para criar, conectar e gerenciar instâncias.
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstanceService } from './instance.service';
import { InstanceController } from './instance.controller';

@Module({
  imports: [AuthModule],
  controllers: [InstanceController],
  providers: [InstanceService],
  exports: [InstanceService],
})
export class InstanceModule {}
