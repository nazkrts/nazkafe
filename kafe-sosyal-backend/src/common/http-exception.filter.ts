import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

/**
 * Tüm hataları `{ error: { code, message } }` biçimine çevirir.
 * Beklenmeyen hatalarda ayrıntı istemciye sızdırılmaz; istek gövdesi hiçbir zaman loglanmaz.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (body && typeof body === 'object' && body.error?.code) {
        res.status(status).json(body);
        return;
      }
      const code =
        status === 401 ? 'UNAUTHORIZED'
        : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
        : status === 429 ? 'TOO_MANY_REQUESTS'
        : status === 400 || status === 422 ? 'BAD_REQUEST'
        : 'HTTP_ERROR';
      const raw = typeof body === 'string' ? body : body?.message;
      const message = Array.isArray(raw) ? raw.join('; ') : raw ?? 'İstek işlenemedi.';
      res.status(status).json({ error: { code, message } });
      return;
    }

    this.log.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu.' } });
  }
}
