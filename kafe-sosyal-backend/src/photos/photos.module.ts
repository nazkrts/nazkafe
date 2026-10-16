import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { LocalPhotoStorage, PHOTO_STORAGE } from './photo-storage';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  controllers: [PhotosController],
  providers: [
    PhotosService,
    { provide: PHOTO_STORAGE, inject: [APP_CONFIG], useFactory: (cfg: AppConfig) => new LocalPhotoStorage(cfg.uploadDir) },
  ],
  exports: [PhotosService, PHOTO_STORAGE],
})
export class PhotosModule {}
