import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CafeAuthGuard, CafeUser } from './cafe-auth.guard';
import { CafeAuthService } from './cafe-auth.service';
import { CafeLoginDto, CafeRegisterDto, CreateEventDto, CreateMeetingPointDto, StatsQuery, UpdateCafeProfileDto, UpdateEventDto, UpdateMeetingPointDto } from './cafe-panel.dto';
import { CafeEventsService } from './cafe-events.service';
import { CafeRegisterService } from './cafe-register.service';
import { CafeStatsService } from './cafe-stats.service';
import { CafePanelService } from './cafe-panel.service';
import { CurrentCafe } from './current-cafe.decorator';

@Controller('cafe')
export class CafePanelController {
  constructor(
    private readonly auth: CafeAuthService,
    private readonly panel: CafePanelService,
    private readonly events: CafeEventsService,
    private readonly stats: CafeStatsService,
    private readonly register: CafeRegisterService,
  ) {}

  @Post('register')
  @HttpCode(201)
  registerCafe(@Body() dto: CafeRegisterDto, @Req() req: any) {
    return this.register.register(dto, req.ip ?? 'unknown');
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() dto: CafeLoginDto, @Req() req: any) {
    return this.auth.login(dto.email, dto.password, req.ip ?? 'unknown');
  }

  @Get('me')
  @UseGuards(CafeAuthGuard)
  me(@CurrentCafe() u: CafeUser) {
    return this.panel.me(u);
  }

  @Patch('profile')
  @UseGuards(CafeAuthGuard)
  updateProfile(@CurrentCafe() u: CafeUser, @Body() dto: UpdateCafeProfileDto) {
    return this.panel.updateProfile(u, dto);
  }

  @Get('qr')
  @UseGuards(CafeAuthGuard)
  qr(@CurrentCafe() u: CafeUser) {
    return this.panel.qr(u);
  }

  @Get('meeting-points')
  @UseGuards(CafeAuthGuard)
  points(@CurrentCafe() u: CafeUser) {
    return this.panel.points(u);
  }

  @Post('meeting-points')
  @UseGuards(CafeAuthGuard)
  @HttpCode(201)
  addPoint(@CurrentCafe() u: CafeUser, @Body() dto: CreateMeetingPointDto) {
    return this.panel.addPoint(u, dto.label);
  }

  @Patch('meeting-points/:id')
  @UseGuards(CafeAuthGuard)
  updatePoint(@CurrentCafe() u: CafeUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMeetingPointDto) {
    return this.panel.updatePoint(u, id, dto);
  }

  @Get('safety-alerts')
  @UseGuards(CafeAuthGuard)
  alerts(@CurrentCafe() u: CafeUser) {
    return this.panel.alerts(u);
  }

  @Post('safety-alerts/:id/ack')
  @UseGuards(CafeAuthGuard)
  @HttpCode(200)
  ack(@CurrentCafe() u: CafeUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.panel.ackAlert(u, id);
  }

  @Get('events')
  @UseGuards(CafeAuthGuard)
  listEvents(@CurrentCafe() u: CafeUser) {
    return this.events.list(u);
  }

  @Post('events')
  @UseGuards(CafeAuthGuard)
  @HttpCode(201)
  createEvent(@CurrentCafe() u: CafeUser, @Body() dto: CreateEventDto) {
    return this.events.create(u, dto);
  }

  @Patch('events/:id')
  @UseGuards(CafeAuthGuard)
  updateEvent(@CurrentCafe() u: CafeUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(u, id, dto);
  }

  @Post('events/:id/cancel')
  @UseGuards(CafeAuthGuard)
  @HttpCode(200)
  cancelEvent(@CurrentCafe() u: CafeUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.cancel(u, id);
  }

  @Get('stats')
  @UseGuards(CafeAuthGuard)
  statsOf(@CurrentCafe() u: CafeUser, @Query() q: StatsQuery) {
    return this.stats.stats(u, q.days);
  }
}
