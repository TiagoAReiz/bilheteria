import { IsString } from 'class-validator';

export class CpfDto {
    @IsString()
    cpf:string;
}
