import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AdminAuthGuard, AdminUser } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminActionsService } from './admin-actions.service';
import { AdminCafesService } from './admin-cafes.service';
import { AdminPhotosService } from './admin-photos.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminLoginDto, AlertQueueQuery, CafeQueueQuery, PhotoQueueQuery, ReportQueueQuery, ReviewPhotoDto, SetCafeStatusDto, RestoreUserDto, ResolveReportDto } from './admin.dto';
import { CurrentAdmin } from './current-admin.decorator';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reports: AdminReportsService,
    private readonly actions: AdminActionsService,
    private readonly photos: AdminPhotosService,
    private readonly cafes: AdminCafesService,
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() dto: AdminLoginDto, @Req() req: any) {
    return this.auth.login(dto.email, dto.password, req.ip ?? 'unknown');
  }

  @Get('reports')
  @UseGuards(AdminAuthGuard)
  queue(@Query() q: ReportQueueQuery) {
    return this.reports.queue(q.status, q.limit, q.offset);
  }

  @Get('reports/:id')
  @UseGuards(AdminAuthGuard)
  detail(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.detail(admin.id, id);
  }

  @Post('reports/:id/resolve')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  resolve(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveReportDto) {
    return this.actions.resolve(admin, id, dto.action, dto.note);
  }

  @Post('users/:id/restore')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  restore(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RestoreUserDto) {
    return this.actions.restore(admin, id, dto.note);
  }

  @Get('safety-alerts')
  @UseGuards(AdminAuthGuard)
  alerts(@Query() q: AlertQueueQuery) {
    return this.actions.alerts(q.only_open !== 'false', q.limit);
  }

  @Post('safety-alerts/:id/handle')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  handleAlert(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.handleAlert(admin, id);
  }

  @Get('photos')
  @UseGuards(AdminAuthGuard)
  photoQueue(@Query() q: PhotoQueueQuery) {
    return this.photos.queue(q.status, q.limit);
  }

  @Get('photos/:id/file')
  @UseGuards(AdminAuthGuard)
  async photoFile(@Param('id', ParseUUIDPipe) id: string, @Res() res: any): Promise<void> {
    const { data, contentType } = await this.photos.file(id);
    res.set({ 'Content-Type': contentType, 'Content-Length': String(data.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  }

  @Post('photos/:id/review')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  reviewPhoto(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewPhotoDto) {
    return this.photos.review(admin, id, dto.decision, dto.note);
  }

  @Get('cafes')
  @UseGuards(AdminAuthGuard)
  cafeQueue(@Query() q: CafeQueueQuery) {
    return this.cafes.queue(q.status, q.limit);
  }

  @Post('cafes/:id/status')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  setCafeStatus(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCafeStatusDto) {
    return this.cafes.setStatus(admin, id, dto.status, dto.note);
  }
}
