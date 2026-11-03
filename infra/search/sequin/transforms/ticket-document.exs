# public.ticket -> documento operacional do índice `tickets`
# (mapping: infra/search/elasticsearch/index-templates/tickets.json, dynamic: strict).
# Só campos operacionais: nada de CPF nem dados pessoais (o CPF nem está nesta tabela).
#
# `status` é o estado no momento da última escrita: available | reserved | paid.
# "expired" não é gravado: uma reserva vence só com o passar do tempo, sem UPDATE no Postgres
# (logo, sem evento de CDC). A API deriva "expired" na leitura: reserved com reserved_at mais
# velho que o TTL de 5 minutos.
def transform(_action, record, _changes, _metadata) do
  iso8601 = fn value ->
    cond do
      is_nil(value) -> nil
      is_struct(value, NaiveDateTime) -> NaiveDateTime.to_iso8601(value) <> "Z"
      is_struct(value, DateTime) -> DateTime.to_iso8601(value)
      true -> value
    end
  end

  reserved_at = record["reserved_at"]

  status =
    cond do
      record["is_paid"] == true -> "paid"
      is_nil(reserved_at) -> "available"
      true -> "reserved"
    end

  %{
    "id" => record["id"],
    "event_id" => record["event_id"],
    "user_id" => record["user_id"],
    "status" => status,
    "reserved_at" => iso8601.(reserved_at),
    "is_paid" => record["is_paid"] == true,
    "deleted" => not is_nil(record["deleted_at"])
  }
end
