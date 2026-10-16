import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentCafe = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().cafe);
