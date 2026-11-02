export type SocialProvider = "google" | "facebook";

/** Body de POST /api/auth/sign-in/social */
export interface SocialSignInRequest {
  provider: SocialProvider;
  /** URL absoluta do front para onde o Better Auth volta depois do OAuth. */
  callbackURL: string;
}

/** Resposta de POST /api/auth/sign-in/social */
export interface SocialSignInResponse {
  url: string;
  redirect: boolean;
}
