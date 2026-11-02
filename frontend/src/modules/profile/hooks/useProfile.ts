"use client";

import { useAsync } from "@/shared/hooks/useAsync";
import { profileService } from "../services/profile.service";

export function useProfile() {
  const { data, loading, error, reload } = useAsync(() => profileService.getMe());
  return { user: data, loading, error, reload };
}
