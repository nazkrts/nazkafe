import { HttpException } from '@nestjs/common';

/** İstemciye `{ error: { code, message } }` olarak döner. `code` makine tarafından okunur. */
export class AppError extends HttpException {
  readonly code: string;

  constructor(code: string, message: string, status = 400) {
    super({ error: { code, message } }, status);
    this.code = code;
  }
}

/** pg hatalarında SQLSTATE koduna bakmak için. */
export function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
}
