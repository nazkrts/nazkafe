import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BlocksService } from './blocks.service';

export class BlockDto {
  @IsUUID()
  user_id: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Post('blocks')
  @HttpCode(200)
  block(@CurrentUser() user: AuthUser, @Body() dto: BlockDto) {
    return this.blocks.block(user.id, dto.user_id);
  }

  @Delete('blocks/:userId')
  @HttpCode(204)
  async unblock(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) targetId: string): Promise<void> {
    await this.blocks.unblock(user.id, targetId);
  }

  @Get('me/blocks')
  listMine(@CurrentUser() user: AuthUser) {
    return this.blocks.listMine(user.id);
  }
}
