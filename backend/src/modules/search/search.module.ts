import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from '@elastic/elasticsearch';
import {
  createElasticsearchClient,
  ELASTICSEARCH_CLIENT,
} from './elasticsearch.client.js';

// conexao com o Elasticsearch compartilhada pelos adapters de busca dos modulos (event, ticket),
// no mesmo papel do PrismaModule para o Postgres
@Module({
  providers: [
    {
      provide: ELASTICSEARCH_CLIENT,
      inject: [ConfigService],
      useFactory: createElasticsearchClient,
    },
  ],
  exports: [ELASTICSEARCH_CLIENT],
})
export class SearchModule implements OnApplicationShutdown {
  constructor(@Inject(ELASTICSEARCH_CLIENT) private readonly client: Client) {}

  async onApplicationShutdown() {
    await this.client.close();
  }
}
