#!/bin/sh
# Hook de init do LocalStack (/etc/localstack/init/ready.d): roda quando o S3 está pronto.
# Idempotente: pode rodar a cada subida do container.
#
# - bucket das imagens (STORAGE_S3_BUCKET)
# - CORS: o navegador faz o upload direto no bucket (POST pré-assinado) a partir do front
# - política de leitura pública (s3:GetObject): as URLs servidas ao front são públicas.
#   O LocalStack community não avalia políticas (lê sem elas), mas o mesmo JSON vale no S3 de verdade.
set -eu

BUCKET="${STORAGE_S3_BUCKET:-bilheteria-images}"
ORIGINS="${STORAGE_CORS_ORIGINS:-http://localhost:3001}"

if awslocal s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket $BUCKET já existe"
else
  echo "criando bucket $BUCKET"
  awslocal s3api create-bucket --bucket "$BUCKET" > /dev/null
fi

# "a, b" -> a","b  (vira ["a","b"] dentro do JSON abaixo)
ORIGINS_JSON="$(printf '%s' "$ORIGINS" | sed 's/[[:space:]]//g; s/,/","/g')"

awslocal s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "{
  \"CORSRules\": [{
    \"AllowedOrigins\": [\"$ORIGINS_JSON\"],
    \"AllowedMethods\": [\"GET\", \"HEAD\", \"POST\"],
    \"AllowedHeaders\": [\"*\"],
    \"ExposeHeaders\": [\"ETag\", \"Location\"],
    \"MaxAgeSeconds\": 3000
  }]
}"

awslocal s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"LeituraPublicaDasImagens\",
    \"Effect\": \"Allow\",
    \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::$BUCKET/*\"
  }]
}"

echo "bucket $BUCKET pronto (CORS: $ORIGINS)"
