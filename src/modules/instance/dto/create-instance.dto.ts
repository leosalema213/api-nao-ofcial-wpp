/**
 * DTO para criação de instância WhatsApp
 */

import { IsNotEmpty, IsString, IsUrl, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInstanceDto {
  @ApiProperty({
    description: 'UUID do usuário proprietário',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'user_id deve ser um UUID válido' })
  @IsNotEmpty({ message: 'user_id é obrigatório' })
  user_id: string;

  @ApiProperty({
    description: 'Nome único da instância',
    example: 'vendas-whatsapp-01',
  })
  @IsString()
  @IsNotEmpty({ message: 'instance_name é obrigatório' })
  instance_name: string;

  @ApiProperty({
    description: 'URL do webhook para receber mensagens (n8n)',
    example: 'https://n8n.exemplo.com/webhook/whatsapp',
  })
  @IsUrl({}, { message: 'webhook_url deve ser uma URL válida' })
  @IsNotEmpty({ message: 'webhook_url é obrigatório' })
  webhook_url: string;
}
