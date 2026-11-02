import {Controller, Get} from '@nestjs/common';
import {Session, type UserSession} from "@thallesp/nestjs-better-auth";

@Controller("users")
export class UserController {

  @Get("me")
  me(@Session() session: UserSession) {
    return session.user;
  }
}
