import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinDate } from 'class-validator';

export class CreateEventDto {
    @IsString()
    @IsNotEmpty()
    name:string;

    @IsOptional()
    @IsString()
    description?:string;

    @IsString()
    @IsNotEmpty()
    location:string;

    @Type(() => Date)
    @IsDate()
    @MinDate(() => new Date(), { message: 'starts_at deve ser uma data futura' })
    starts_at:Date;

    @IsInt()
    @Min(1)
    @Max(100000)
    capacity:number;
}
