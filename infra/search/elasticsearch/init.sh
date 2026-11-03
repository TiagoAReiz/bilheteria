#!/bin/sh
# Aplica os templates versionados e garante os índices iniciais atrás dos aliases.
# Roda no container search-init (curlimages/curl) antes do Sequin; é idempotente.
#
# Por que alias: o Sequin escreve e a API lê `events`/`tickets`. Numa reindexação (mudança de
# mapping) cria-se events_v2 a partir do template, popula-se e troca-se o alias de uma vez,
# sem mudar código nem sequin.yaml (ver README da raiz).
set -eu

ES="${ELASTICSEARCH_URL:-http://elasticsearch:9200}"
DIR="$(dirname "$0")"

put_json() {
  echo "PUT $1"
  curl -fsS -X PUT "$ES$1" -H 'Content-Type: application/json' --data-binary "@$2" > /dev/null
}

# cria o primeiro índice físico só se o alias ainda não existir (não recria nada em reinícios)
ensure_alias() {
  alias="$1"
  first_index="$2"
  status="$(curl -s -o /dev/null -w '%{http_code}' "$ES/_alias/$alias")"
  case "$status" in
    200)
      echo "alias $alias já existe; mantendo o índice atual"
      ;;
    404)
      echo "criando $first_index com o alias $alias"
      curl -fsS -X PUT "$ES/$first_index" -H 'Content-Type: application/json' \
        -d "{\"aliases\":{\"$alias\":{\"is_write_index\":true}}}" > /dev/null
      ;;
    *)
      echo "resposta inesperada ($status) ao consultar o alias $alias" >&2
      exit 1
      ;;
  esac
}

# a ordem importa: o component template precisa existir antes dos index templates que o usam
put_json /_component_template/bilheteria-analysis "$DIR/component-templates/bilheteria-analysis.json"
put_json /_index_template/events "$DIR/index-templates/events.json"
put_json /_index_template/tickets "$DIR/index-templates/tickets.json"

ensure_alias events events_v1
ensure_alias tickets tickets_v1

# campos NOVOS de um template também entram no índice que já existe (o template só vale para
# índices criados depois). PUT _mapping só aceita adicionar campo; mudar um campo existente
# continua exigindo reindexação (ver README da raiz). Idempotente.
for file in "$DIR"/mapping-additions/*.json; do
  [ -e "$file" ] || continue
  alias="$(basename "$file" .json)"
  put_json "/$alias/_mapping" "$file"
done

echo "Elasticsearch pronto para o Sequin"
