import { IsInt } from 'class-validator';

export class ReservationDto {
    @IsInt()
    event_id:number;
}
