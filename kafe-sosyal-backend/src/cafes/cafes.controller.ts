import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CafesService } from './cafes.service';

export class ListCafesQuery {
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsString() @MaxLength(60) district?: string;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

@Controller('cafes')
@UseGuards(JwtAuthGuard)
export class CafesController {
  constructor(private readonly cafes: CafesService) {}

  @Get()
  list(@Query() q: ListCafesQuery) {
    return this.cafes.list({ city: q.city, district: q.district, q: q.q }, q.limit);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cafes.detail(id, user.id);
  }

  @Get(':id/events')
  events(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cafes.events(id, user.id);
  }
}
