import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  FAVORITE_SERVICE,
  type FavoriteServicePort,
} from '../../../application/ports/inbound/services/favorite.service.port.js';

/** Favoritos do usuário logado (o guard global do Better Auth exige sessão). */
@Controller()
export class FavoriteController {
  constructor(
    @Inject(FAVORITE_SERVICE) private readonly service: FavoriteServicePort,
  ) {}

  @Put('events/:id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  favorite(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.service.favorite(session.user.id, id);
  }

  @Delete('events/:id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfavorite(
    @Session() session: UserSession,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.service.unfavorite(session.user.id, id);
  }

  @Get('favorites')
  list(@Session() session: UserSession) {
    return this.service.listFavorites(session.user.id);
  }
}
