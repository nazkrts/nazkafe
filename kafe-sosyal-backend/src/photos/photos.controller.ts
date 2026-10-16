import { Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PhotosService } from './photos.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get('me/photos')
  list(@CurrentUser() user: AuthUser) {
    return this.photos.list(user.id);
  }

  /** Ham gövde: Content-Type image/jpeg veya image/png (main.ts'te raw ayrıştırıcı açık). */
  @Post('me/photos')
  @HttpCode(201)
  upload(@CurrentUser() user: AuthUser, @Req() req: any, @Headers('content-type') contentType?: string) {
    return this.photos.upload(user.id, req.body, contentType);
  }

  @Delete('me/photos/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.photos.remove(user.id, id);
  }

  /** Keşif ve eşleşme yanıtlarındaki `photo_key` bu uçtan alınır. */
  @Get('media/:key')
  async file(@CurrentUser() user: AuthUser, @Param('key') key: string, @Res() res: any): Promise<void> {
    const { data, contentType } = await this.photos.file(user.id, key);
    res.set({
      'Content-Type': contentType,
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  }
}
