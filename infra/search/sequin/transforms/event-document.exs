# public.event -> documento do índice `events`
# (mapping: infra/search/elasticsearch/index-templates/events.json, dynamic: strict).
#
# Regras do sandbox de transforms do Sequin: só `transform/4`, sem outras funções nomeadas,
# `record` acessado com [] e um subconjunto da stdlib (Map, String, DateTime, NaiveDateTime...).
#
# Soft delete: `deleted_at` preenchido é um UPDATE no Postgres; o sink do Elasticsearch só
# remove documento para DELETE de verdade, então o evento continua indexado com
# `deleted: true` e a API filtra. No DELETE físico o Sequin apaga pelo _id e ignora esta saída.
def transform(_action, record, _changes, _metadata) do
  # colunas TIMESTAMP(3) do Prisma são gravadas em UTC sem fuso: explicita o "Z"
  iso8601 = fn value ->
    cond do
      is_nil(value) -> nil
      is_struct(value, NaiveDateTime) -> NaiveDateTime.to_iso8601(value) <> "Z"
      is_struct(value, DateTime) -> DateTime.to_iso8601(value)
      true -> value
    end
  end

  %{
    "id" => record["id"],
    # `name` alimenta o autocomplete (search_as_you_type, sem stemming);
    # `name_stemmed` a busca textual com o analisador pt-BR
    "name" => record["name"],
    "name_stemmed" => record["name"],
    "description" => record["description"],
    "location" => record["location"],
    "starts_at" => iso8601.(record["starts_at"]),
    # início das vendas ("Em breve" enquanto no futuro); nil = vendendo
    "sales_starts_at" => iso8601.(record["sales_starts_at"]),
    "capacity" => record["capacity"],
    "available_tickets" => record["available_tickets"],
    # só a chave do objeto no bucket: a API monta a URL com STORAGE_PUBLIC_URL
    "cover_key" => record["cover_key"],
    "organizer_id" => record["organizer_id"],
    "deleted" => not is_nil(record["deleted_at"])
  }
end
