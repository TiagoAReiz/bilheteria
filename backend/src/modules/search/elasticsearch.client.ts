import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');

export const DEFAULT_ELASTICSEARCH_URL = 'http://localhost:9200';
export const DEFAULT_ELASTICSEARCH_REQUEST_TIMEOUT_MS = 2000;

// o Client nao abre conexao no construtor: a API sobe mesmo com o Elasticsearch fora do ar,
// e so as rotas de busca falham (503) enquanto ele nao volta
export function createElasticsearchClient(config: ConfigService): Client {
  return new Client({
    node: config.get<string>('ELASTICSEARCH_URL') ?? DEFAULT_ELASTICSEARCH_URL,
    // busca e interativa: melhor responder 503 rapido do que segurar a requisicao
    requestTimeout: Number(
      config.get('ELASTICSEARCH_REQUEST_TIMEOUT_MS') ??
        DEFAULT_ELASTICSEARCH_REQUEST_TIMEOUT_MS,
    ),
    maxRetries: 1,
  });
}
