import {Cpf} from "../../../../core/entities/cpf.js";

export const CPF_HASHER = Symbol('CPF_HASHER');

export interface CpfHasherPort {
    hash(cpf: Cpf): string;
}
