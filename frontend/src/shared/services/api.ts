import axios, { AxiosError } from "axios";
import { API_URL } from "@/shared/lib/env";
import { buildLoginUrl, LOGIN_PATH } from "@/shared/lib/auth-redirect";
import { hardRedirect } from "@/shared/lib/navigation";

/** Instância única do axios. O Better Auth usa cookie httpOnly, por isso `withCredentials`. */
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function handleUnauthorized(error: AxiosError): Promise<never> {
  if (error.response?.status === 401 && typeof window !== "undefined") {
    const { pathname, search } = window.location;
    if (pathname !== LOGIN_PATH) {
      hardRedirect(buildLoginUrl(`${pathname}${search}`));
    }
  }
  return Promise.reject(error);
}

api.interceptors.response.use((response) => response, handleUnauthorized);
