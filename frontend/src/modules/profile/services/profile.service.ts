import { api } from "@/shared/services/api";
import type { RegisterCpfRequest, UserMeResponse } from "../types/profile.dto";

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
};
