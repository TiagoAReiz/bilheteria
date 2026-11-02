import { IsInt, IsString } from 'class-validator';

export class WebhookDto {
    @IsInt()
    id:number;

    @IsString()
    user_id:string;
}
