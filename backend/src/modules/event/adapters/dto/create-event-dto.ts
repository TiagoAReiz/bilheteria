import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinDate,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
} from '../../core/entities/event-price.js';
import {
  MAX_TICKETS_PER_CPF,
  MIN_TICKETS_PER_CPF,
} from '../../core/entities/event-ticket-limit.js';

/** O limite por CPF não pode passar da capacidade (com capacidade 1, o limite é 1). */
@ValidatorConstraint({ name: 'notAboveCapacity' })
class NotAboveCapacity implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const capacity = (args.object as { capacity?: unknown }).capacity;
    return (
      typeof value !== 'number' ||
      typeof capacity !== 'number' ||
      value <= capacity
    );
  }
  defaultMessage(): string {
    return 'max_tickets_per_cpf não pode ser maior que a capacidade do evento';
  }
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'starts_at deve ser uma data futura' })
  starts_at: Date;

  @IsInt()
  @Min(1)
  @Max(100000)
  capacity: number;

  // centavos inteiros (nada de float para dinheiro): R$ 50,00 = 5000
  @IsInt({ message: 'price_cents deve ser um número inteiro de centavos' })
  @Min(MIN_PRICE_CENTS, {
    message: `price_cents deve ser no mínimo ${MIN_PRICE_CENTS} (R$ 1,00)`,
  })
  @Max(MAX_PRICE_CENTS, {
    message: `price_cents deve ser no máximo ${MAX_PRICE_CENTS} (R$ 100.000,00)`,
  })
  price_cents: number;

  // quantos ingressos ativos (pagos ou reservados) um mesmo CPF pode ter neste evento
  @IsInt({ message: 'max_tickets_per_cpf deve ser um número inteiro' })
  @Min(MIN_TICKETS_PER_CPF, {
    message: `max_tickets_per_cpf deve ser no mínimo ${MIN_TICKETS_PER_CPF}`,
  })
  @Max(MAX_TICKETS_PER_CPF, {
    message: `max_tickets_per_cpf deve ser no máximo ${MAX_TICKETS_PER_CPF}`,
  })
  @Validate(NotAboveCapacity)
  max_tickets_per_cpf: number;
}
