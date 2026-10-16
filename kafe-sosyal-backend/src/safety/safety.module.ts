import { Module } from '@nestjs/common';
import { CheckinsModule } from '../checkins/checkins.module';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

@Module({ imports: [CheckinsModule], controllers: [SafetyController], providers: [SafetyService] })
export class SafetyModule {}
