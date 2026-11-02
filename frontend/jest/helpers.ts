import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import type { EventResponse } from "@/shared/types/event";
import type { User } from "@/shared/types/user";

/** Cria um erro do axios no formato que o NestJS devolve. */
export function nestError(status: number, message: string | string[] = "erro", error = "Error"): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = {
    status,
    statusText: error,
    data: { statusCode: status, message, error },
    headers: {},
    config,
  };
  return new AxiosError(String(message), String(status), config, {}, response);
}

export function makeEvent(overrides: Partial<EventResponse> = {}): EventResponse {
  return {
    id: 1,
    name: "Show de Rock",
    description: "Uma noite de rock",
    location: "Arena Central",
    starts_at: "2099-05-10T22:00:00.000Z",
    capacity: 100,
    organizer_id: "org-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "Maria Silva",
    email: "maria@example.com",
    emailVerified: true,
    image: null,
    role: "USER",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Mock padrão de `useSession` para componentes. */
export function sessionValue(user: User | null, status?: "loading" | "authenticated" | "unauthenticated") {
  return {
    user,
    status: status ?? (user ? "authenticated" : "unauthenticated"),
    refresh: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn().mockResolvedValue(undefined),
  };
}

/** CPF válido para testes (dígitos verificadores corretos). */
export const VALID_CPF = "52998224725";
