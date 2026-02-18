/**
 * InstanceController - Endpoints de gerenciamento de instâncias WhatsApp
 *
 * CRUD + conexão + QR code para instâncias Baileys.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { InstanceService } from './instance.service';
import { CreateInstanceDto } from './dto/create-instance.dto';

@ApiTags('instances')
@Controller('instances')
export class InstanceController {
  constructor(private readonly instanceService: InstanceService) {}

  /**
   * POST /instances/create
   * Cria instância + inicia conexão Baileys
   */
  @Post('create')
  @ApiOperation({ summary: 'Criar instância e iniciar conexão WhatsApp' })
  @ApiResponse({
    status: 201,
    description: 'Instância criada e conexão iniciada',
  })
  @ApiResponse({
    status: 409,
    description: 'Instância com mesmo nome já existe',
  })
  async createInstance(@Body() dto: CreateInstanceDto) {
    const instance = await this.instanceService.createInstance(dto);

    return {
      statusCode: HttpStatus.CREATED,
      message: `Instância '${dto.instance_name}' criada — acesse GET /instances/${instance.id}/qr para o QR code`,
      data: instance,
    };
  }

  /**
   * GET /instances
   * Lista todas as instâncias
   */
  @Get()
  @ApiOperation({ summary: 'Listar todas as instâncias' })
  @ApiResponse({ status: 200, description: 'Lista retornada com sucesso' })
  async listInstances() {
    const instances = await this.instanceService.listInstances();

    return {
      statusCode: HttpStatus.OK,
      data: instances,
      total: instances.length,
    };
  }

  /**
   * GET /instances/:id
   * Detalhes de uma instância
   */
  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de uma instância' })
  @ApiParam({
    name: 'id',
    description: 'UUID da instância',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({ status: 200, description: 'Instância retornada' })
  @ApiResponse({ status: 404, description: 'Instância não encontrada' })
  async getInstance(@Param('id') id: string) {
    const instance = await this.instanceService.getInstance(id);

    return {
      statusCode: HttpStatus.OK,
      data: instance,
    };
  }

  /**
   * GET /instances/:id/qr
   * QR Code para autenticação WhatsApp
   */
  @Get(':id/qr')
  @ApiOperation({ summary: 'Obter QR Code para autenticação WhatsApp' })
  @ApiParam({
    name: 'id',
    description: 'UUID da instância',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'QR Code retornado (base64 PNG data URL)',
  })
  @ApiResponse({ status: 404, description: 'Instância não encontrada' })
  async getQrCode(@Param('id') id: string) {
    const result = await this.instanceService.getQrCode(id);

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * POST /instances/:id/restart
   * Reinicia a conexão WhatsApp
   */
  @Post(':id/restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reiniciar conexão WhatsApp' })
  @ApiParam({
    name: 'id',
    description: 'UUID da instância',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({ status: 200, description: 'Conexão reiniciada' })
  @ApiResponse({ status: 404, description: 'Instância não encontrada' })
  async restartInstance(@Param('id') id: string) {
    await this.instanceService.restartInstance(id);

    return {
      statusCode: HttpStatus.OK,
      message:
        'Conexão reiniciada — acesse GET /instances/' +
        id +
        '/qr para o QR code',
    };
  }

  /**
   * DELETE /instances/:id
   * Deleta instância + desconecta + remove sessão
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deletar instância WhatsApp' })
  @ApiParam({
    name: 'id',
    description: 'UUID da instância',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({ status: 200, description: 'Instância deletada' })
  @ApiResponse({ status: 404, description: 'Instância não encontrada' })
  async deleteInstance(@Param('id') id: string) {
    await this.instanceService.deleteInstance(id);

    return {
      statusCode: HttpStatus.OK,
      message: 'Instância deletada com sucesso',
    };
  }
}
