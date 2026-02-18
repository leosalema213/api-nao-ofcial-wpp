import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS
  app.enableCors();

  // Validação global de DTOs (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove propriedades não decoradas
      forbidNonWhitelisted: true, // Rejeita propriedades desconhecidas
      transform: true, // Transforma payloads em instâncias de DTO
    }),
  );

  // Configuração do Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('WhatsApp API Escalável')
    .setDescription(
      'API WhatsApp não-oficial escalável com NestJS, Baileys, Supabase e BullMQ. ' +
        'Suporta 80+ instâncias simultâneas com arquitetura stateless.',
    )
    .setVersion('1.0.0')
    .addBearerAuth() // Preparado para JWT futuro
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  console.log(`📚 Swagger UI: http://localhost:${port}/api/docs`);
}
void bootstrap();
