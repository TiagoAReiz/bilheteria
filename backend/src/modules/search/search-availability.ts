import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { errors } from '@elastic/elasticsearch';

export const SEARCH_UNAVAILABLE_MESSAGE =
  'A busca está temporariamente indisponível. Tente novamente em instantes.';

// falhas de infraestrutura (Elasticsearch fora, lento, sobrecarregado ou sem o indice criado) viram 503;
// erros de requisicao (ex.: 400 por query invalida) sao bug nosso e seguem como 500
export function isSearchBackendUnavailable(error: unknown): boolean {
  if (
    error instanceof errors.ConnectionError ||
    error instanceof errors.TimeoutError ||
    error instanceof errors.NoLivingConnectionsError
  ) {
    return true;
  }
  if (error instanceof errors.ResponseError) {
    const status = error.statusCode ?? 0;
    return status >= 500 || status === 429 || isIndexNotFound(error);
  }
  return false;
}

function isIndexNotFound(
  error: InstanceType<typeof errors.ResponseError>,
): boolean {
  const body: unknown = error.body;
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }
  const cause = (body as { error?: { type?: unknown } }).error;
  return cause?.type === 'index_not_found_exception';
}

export async function withSearchAvailability<T>(
  logger: Logger,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isSearchBackendUnavailable(error)) {
      logger.warn(`Elasticsearch indisponível: ${(error as Error).message}`);
      throw new ServiceUnavailableException(SEARCH_UNAVAILABLE_MESSAGE, {
        cause: error,
      });
    }
    throw error;
  }
}
