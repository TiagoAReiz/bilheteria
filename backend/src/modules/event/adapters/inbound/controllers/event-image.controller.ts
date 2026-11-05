import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  EVENT_IMAGE_SERVICE,
  type EventImageServicePort,
} from '../../../application/ports/inbound/services/event-image.service.port.js';
import { ImageEditor } from '../../../core/entities/event-image.entity.js';
import {
  ConfirmImageUploadDto,
  CreateImageUploadDto,
} from '../../../../storage/adapters/dto/image-upload-dto.js';
import { ReorderEventPhotosDto } from '../../dto/reorder-event-photos-dto.js';

const editorOf = (session: UserSession): ImageEditor => ({
  id: session.user.id,
  role: typeof session.user.role === 'string' ? session.user.role : '',
});

// Capa e galeria. Todas as rotas exigem sessão (guard global); dono do evento ou ADMIN é checado no service.
@Controller('events')
export class EventImageController {
  constructor(
    @Inject(EVENT_IMAGE_SERVICE) private readonly images: EventImageServicePort,
  ) {}

  @Post(':id/cover/upload-url')
  createCoverUpload(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateImageUploadDto,
  ) {
    return this.images.createCoverUpload(
      id,
      editorOf(session),
      dto.content_type,
    );
  }

  @Put(':id/cover')
  confirmCover(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmImageUploadDto,
  ) {
    return this.images.confirmCover(id, editorOf(session), dto.key);
  }

  @Delete(':id/cover')
  @HttpCode(204)
  removeCover(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.images.removeCover(id, editorOf(session));
  }

  @Post(':id/photos/upload-url')
  createPhotoUpload(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateImageUploadDto,
  ) {
    return this.images.createPhotoUpload(
      id,
      editorOf(session),
      dto.content_type,
    );
  }

  @Post(':id/photos')
  confirmPhoto(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmImageUploadDto,
  ) {
    return this.images.confirmPhoto(id, editorOf(session), dto.key);
  }

  @Patch(':id/photos/order')
  reorderPhotos(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReorderEventPhotosDto,
  ) {
    return this.images.reorderPhotos(id, editorOf(session), dto.photo_ids);
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(204)
  removePhoto(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ) {
    return this.images.removePhoto(id, editorOf(session), photoId);
  }
}
