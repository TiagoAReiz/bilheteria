import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';
import { MAX_EVENT_PHOTOS } from '../../core/entities/event-image.entity.js';

/** Body de PATCH /events/:id/photos/order: todas as fotos da galeria, na nova ordem. */
export class ReorderEventPhotosDto {
  @IsArray()
  @ArrayMaxSize(MAX_EVENT_PHOTOS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  photo_ids: number[];
}
