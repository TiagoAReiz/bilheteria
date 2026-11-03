import {IsInt, Min} from 'class-validator';

export class CreateCheckoutDto {
    // o valor NÃO vem do cliente: o preço é o do evento, lido do banco
    @IsInt()
    @Min(1)
    ticket_id: number;
}
