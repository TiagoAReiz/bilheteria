import {Body, Controller, Delete, Get, HttpCode, Inject, Patch, Post, Put} from '@nestjs/common';
import {Session, type UserSession} from "@thallesp/nestjs-better-auth";
import {USER_SERVICE, type UserServicePort} from "../../../application/ports/inbound/services/user.service.port.js";
import {CpfDto} from "../../dto/cpf-dto.js";
import {ConfirmImageUploadDto, CreateImageUploadDto} from "../../../../storage/adapters/dto/image-upload-dto.js";

@Controller("users")
export class UserController {
  constructor(@Inject(USER_SERVICE) private readonly userService: UserServicePort) {}

  /** Usuário da sessão + `hasCpf` e `cpfMasked` (***.456.789-**); o hash do CPF nunca sai da API. */
  @Get("me")
  async me(@Session() session: UserSession) {
    return {...session.user, ...(await this.userService.getCpfStatus(session.user.id))};
  }

  @Patch("me/cpf")
  @HttpCode(204)
  registerCpf(@Session() session: UserSession, @Body() dto: CpfDto) {
    return this.userService.registerCpf(session.user.id, dto.cpf);
  }

  @Patch("me/organizer")
  @HttpCode(204)
  becomeOrganizer(@Session() session: UserSession) {
    return this.userService.becomeOrganizer(session.user.id);
  }

  @Post("me/avatar/upload-url")
  createAvatarUpload(@Session() session: UserSession, @Body() dto: CreateImageUploadDto) {
    return this.userService.createAvatarUpload(session.user.id, dto.content_type);
  }

  @Put("me/avatar")
  confirmAvatar(@Session() session: UserSession, @Body() dto: ConfirmImageUploadDto) {
    return this.userService.confirmAvatar(session.user.id, dto.key);
  }

  @Delete("me/avatar")
  removeAvatar(@Session() session: UserSession) {
    return this.userService.removeAvatar(session.user.id);
  }
}
