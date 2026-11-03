import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinDate } from 'class-validator';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '../../core/entities/event-price.js';

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

    // centavos inteiros (nada de float para dinheiro): R$ 50,00 = 5000
    @IsInt({ message: 'price_cents deve ser um número inteiro de centavos' })
    @Min(MIN_PRICE_CENTS, { message: `price_cents deve ser no mínimo ${MIN_PRICE_CENTS} (R$ 1,00)` })
    @Max(MAX_PRICE_CENTS, { message: `price_cents deve ser no máximo ${MAX_PRICE_CENTS} (R$ 100.000,00)` })
    price_cents:number;
}
