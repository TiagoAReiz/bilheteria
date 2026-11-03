import { Transform, Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinDate, ValidateIf } from 'class-validator';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '../../core/entities/event-price.js';
import { MAX_TICKETS_PER_CPF, MIN_TICKETS_PER_CPF } from '../../core/entities/event-ticket-limit.js';

/**
 * Body de PATCH /events/:id: só os campos enviados mudam. As regras que dependem do valor atual
 * (capacidade e limite por CPF só aumentam, limite <= capacidade) ficam em checkEventUpdate.
 */
export class UpdateEventDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    name?: string;

    // "" ou null apagam a descrição
    @Transform(({ value }) => (value === '' ? null : value))
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsString()
    description?: string | null;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    location?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    @MinDate(() => new Date(), { message: 'starts_at deve ser uma data futura' })
    starts_at?: Date;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100000)
    capacity?: number;

    @IsOptional()
    @IsInt({ message: 'price_cents deve ser um número inteiro de centavos' })
    @Min(MIN_PRICE_CENTS, { message: `price_cents deve ser no mínimo ${MIN_PRICE_CENTS} (R$ 1,00)` })
    @Max(MAX_PRICE_CENTS, { message: `price_cents deve ser no máximo ${MAX_PRICE_CENTS} (R$ 100.000,00)` })
    price_cents?: number;

    @IsOptional()
    @IsInt({ message: 'max_tickets_per_cpf deve ser um número inteiro' })
    @Min(MIN_TICKETS_PER_CPF, { message: `max_tickets_per_cpf deve ser no mínimo ${MIN_TICKETS_PER_CPF}` })
    @Max(MAX_TICKETS_PER_CPF, { message: `max_tickets_per_cpf deve ser no máximo ${MAX_TICKETS_PER_CPF}` })
    max_tickets_per_cpf?: number;
}
