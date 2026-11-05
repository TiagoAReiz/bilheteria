import { api } from "@/shared/services/api";
import type {
  SocialProvider,
  SocialSignInRequest,
  SocialSignInResponse,
} from "../types/login.dto";

export const loginService = {
  async signInSocial(
    provider: SocialProvider,
    callbackURL: string,
  ): Promise<SocialSignInResponse> {
    const body: SocialSignInRequest = { provider, callbackURL };
    const { data } = await api.post<SocialSignInResponse>(
      "/api/auth/sign-in/social",
      body,
    );
    return data;
  },
};
