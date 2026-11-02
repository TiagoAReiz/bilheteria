import {Body, Controller, Get, HttpCode, Inject, Patch} from '@nestjs/common';
import {Session, type UserSession} from "@thallesp/nestjs-better-auth";
import {USER_SERVICE, type UserServicePort} from "../../../application/ports/inbound/services/user.service.port.js";
import {CpfDto} from "../../dto/cpf-dto.js";

@Controller("users")
export class UserController {
  constructor(@Inject(USER_SERVICE) private readonly userService: UserServicePort) {}

  @Get("me")
  me(@Session() session: UserSession) {
    return session.user;
  }

  @Patch("me/cpf")
  @HttpCode(204)
  registerCpf(@Session() session: UserSession, @Body() dto: CpfDto) {
    return this.userService.registerCpf(session.user.id, dto.cpf);
  }
}
