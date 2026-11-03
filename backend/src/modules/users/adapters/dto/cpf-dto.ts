import { IsString } from 'class-validator';
import { IsCPF } from 'cpf-cnpj-validator/class-validator';

export class CpfDto {
    @IsString()
    @IsCPF({message: 'CPF inválido'})
    cpf:string;
}
