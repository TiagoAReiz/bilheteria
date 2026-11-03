import { errors } from '@elastic/elasticsearch';

type ResponseErrorMeta = ConstructorParameters<typeof errors.ResponseError>[0];

// ResponseError como o client do Elasticsearch lanca para respostas 4xx/5xx
export const responseError = (
  statusCode: number,
  type = 'some_exception',
): InstanceType<typeof errors.ResponseError> =>
  new errors.ResponseError({
    statusCode,
    body: { error: { type, reason: type }, status: statusCode },
    headers: {},
    warnings: null,
    meta: {},
  } as unknown as ResponseErrorMeta);
