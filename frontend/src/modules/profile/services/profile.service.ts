import { api } from "@/shared/services/api";
import type {
  ConfirmImageUploadRequest,
  CreateImageUploadRequest,
  ImageContentType,
  PresignedUpload,
} from "@/shared/types/image";
import type {
  AvatarResponse,
  RegisterCpfRequest,
  UserMeResponse,
} from "../types/profile.dto";

export const profileService = {
  async getMe(): Promise<UserMeResponse> {
    const { data } = await api.get<UserMeResponse>("/users/me");
    return data;
  },

  async registerCpf(cpf: string): Promise<void> {
    const body: RegisterCpfRequest = { cpf };
    await api.patch("/users/me/cpf", body);
  },

  async becomeOrganizer(): Promise<void> {
    await api.patch("/users/me/organizer");
  },

  async createAvatarUpload(
    contentType: ImageContentType,
  ): Promise<PresignedUpload> {
    const body: CreateImageUploadRequest = { content_type: contentType };
    const { data } = await api.post<PresignedUpload>(
      "/users/me/avatar/upload-url",
      body,
    );
    return data;
  },

  async confirmAvatar(key: string): Promise<AvatarResponse> {
    const body: ConfirmImageUploadRequest = { key };
    const { data } = await api.put<AvatarResponse>("/users/me/avatar", body);
    return data;
  },

  /** Volta para a foto do Google/Facebook (ou nenhuma). */
  async removeAvatar(): Promise<AvatarResponse> {
    const { data } = await api.delete<AvatarResponse>("/users/me/avatar");
    return data;
  },
};
