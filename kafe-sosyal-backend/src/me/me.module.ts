import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({ imports: [PhotosModule], controllers: [MeController], providers: [MeService] })
export class MeModule {}
