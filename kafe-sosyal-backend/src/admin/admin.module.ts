import { Module } from '@nestjs/common';
import { AdminCafesService } from './admin-cafes.service';
import { AdminPhotosService } from './admin-photos.service';
import { AdminActionsService } from './admin-actions.service';
import { PhotosModule } from '../photos/photos.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [PhotosModule],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminAuthGuard, AdminReportsService, AdminActionsService, AdminPhotosService, AdminCafesService],
})
export class AdminModule {}
