import type {TransformFnParams} from "class-transformer";

// helpers de @Transform para DTOs de query string (tudo chega como string)

/** Remove espaços das pontas; string vazia vira `undefined` (filtro ausente). */
export function trimToUndefined({value}: TransformFnParams): unknown {
    if (typeof value !== 'string') {
        return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

/** "true"/"false" viram boolean; qualquer outro valor segue como veio para o @IsBoolean rejeitar. */
export function toBoolean({value}: TransformFnParams): unknown {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return value;
}
