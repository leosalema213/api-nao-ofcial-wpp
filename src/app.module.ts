import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { InstanceModule } from './modules/instance/instance.module';

@Module({
  imports: [AuthModule, InstanceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
