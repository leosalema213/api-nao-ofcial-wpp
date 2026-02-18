/**
 * AuthController - Endpoints de diagnóstico de sessões Baileys
 *
 * Estes endpoints permitem gerenciar sessões armazenadas no Supabase.
 * São úteis para diagnóstico e manutenção.
 */

import {
  Controller,
  Get,
  Delete,
  Param,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * GET /auth/sessions
   * Lista todas as sessões salvas no Supabase
   */
  @Get('sessions')
  @ApiOperation({ summary: 'Listar todas as sessões Baileys' })
  @ApiResponse({
    status: 200,
    description: 'Lista de sessões retornada com sucesso',
  })
  async listSessions() {
    const sessions = await this.authService.listSessions();

    return {
      statusCode: HttpStatus.OK,
      data: sessions,
      total: sessions.length,
    };
  }

  /**
   * GET /auth/sessions/:instanceName
   * Verifica se uma sessão específica existe
   */
  @Get('sessions/:instanceName')
  @ApiOperation({ summary: 'Verificar se sessão existe' })
  @ApiParam({
    name: 'instanceName',
    description: 'Nome da instância WhatsApp',
    example: 'vendas-whatsapp-01',
  })
  @ApiResponse({ status: 200, description: 'Status da sessão retornado' })
  async checkSession(@Param('instanceName') instanceName: string) {
    const exists = await this.authService.sessionExists(instanceName);

    return {
      statusCode: HttpStatus.OK,
      data: {
        instanceName,
        exists,
      },
    };
  }

  /**
   * DELETE /auth/sessions/:instanceName
   * Remove uma sessão do Supabase
   */
  @Delete('sessions/:instanceName')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover sessão do Supabase' })
  @ApiParam({
    name: 'instanceName',
    description: 'Nome da instância WhatsApp',
    example: 'vendas-whatsapp-01',
  })
  @ApiResponse({ status: 200, description: 'Sessão removida com sucesso' })
  @ApiResponse({ status: 500, description: 'Erro ao remover sessão' })
  async removeSession(@Param('instanceName') instanceName: string) {
    await this.authService.removeSession(instanceName);

    return {
      statusCode: HttpStatus.OK,
      message: `Sessão '${instanceName}' removida com sucesso`,
    };
  }
}
