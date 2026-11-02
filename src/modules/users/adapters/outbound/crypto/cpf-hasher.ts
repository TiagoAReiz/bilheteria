import {Injectable} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {createHmac} from "node:crypto";
import {Cpf} from "../../../core/entities/cpf.js";
import {CpfHasherPort} from "../../../application/ports/outbound/crypto/cpf-hasher.port.js";

@Injectable()
export class CpfHasher implements CpfHasherPort {
    private readonly secret: string;

    constructor(configService: ConfigService) {
        this.secret = configService.getOrThrow<string>('CPF_HASH_SECRET');
    }

    hash(cpf: Cpf): string {
        return createHmac('sha256', this.secret).update(cpf.value).digest('hex');
    }
}
