const SESSION_PROFILE_STORAGE_KEY = "syseye.session-profile";

export type SessionProfile = {
  email?: string;
  name?: string;
};

export function saveSessionProfile(profile: SessionProfile) {
  if (typeof window === "undefined") return;

  const current = getSessionProfile();
  const next = {
    ...current,
    ...profile,
  };

  window.localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, JSON.stringify(next));
}

export function getSessionProfile(): SessionProfile {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(SESSION_PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionProfile;
    return {
      email: typeof parsed?.email === "string" ? parsed.email : undefined,
      name: typeof parsed?.name === "string" ? parsed.name : undefined,
    };
  } catch {
    return {};
  }
}

export function clearSessionProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_PROFILE_STORAGE_KEY);
}
