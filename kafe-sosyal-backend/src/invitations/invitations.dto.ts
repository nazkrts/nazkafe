import { IsIn, IsUUID } from 'class-validator';

export class CreateInvitationDto {
  @IsUUID()
  meeting_point_id: string;
}

export class RespondInvitationDto {
  @IsIn(['accept', 'later', 'decline'])
  response: 'accept' | 'later' | 'decline';
}
