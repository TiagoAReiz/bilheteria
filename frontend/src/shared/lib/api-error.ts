import { isAxiosError } from "axios";

/** Formato de erro padrão do NestJS. */
export interface NestErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

function isNestErrorBody(data: unknown): data is NestErrorBody {
  return typeof data === "object" && data !== null && "message" in data;
}

export function getErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/** Extrai uma mensagem legível de um erro do axios/Nest. */
export function getErrorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (isNestErrorBody(data)) {
      const { message } = data;
      if (Array.isArray(message)) return message.filter(Boolean).join("\n") || fallback;
      if (typeof message === "string" && message.trim()) return message;
    }
    if (!error.response) return "Não foi possível conectar ao servidor.";
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
