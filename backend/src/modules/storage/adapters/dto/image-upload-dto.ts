import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IMAGE_CONTENT_TYPES } from '../../core/entities/image.js';

const CONTENT_TYPES = Object.keys(IMAGE_CONTENT_TYPES);

/** Body dos POST .../upload-url: o tipo do arquivo (o tamanho é o S3 que garante). */
export class CreateImageUploadDto {
  @IsIn(CONTENT_TYPES, {
    message: `content_type deve ser um destes: ${CONTENT_TYPES.join(', ')}`,
  })
  content_type: string;
}

/** Body da confirmação: a chave devolvida pelo upload-url. */
export class ConfirmImageUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key: string;
}
