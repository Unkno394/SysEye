export async function getReadableApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();

    if (typeof data?.message === "string" && data.message) {
      return data.message;
    }

    if (typeof data?.title === "string" && data.title && !data.errors) {
      return data.title;
    }

    if (data?.errors && typeof data.errors === "object") {
      const messages = Object.values(data.errors)
        .flatMap((value) => (Array.isArray(value) ? value : []))
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      if (messages.length) {
        return messages.join(" ");
      }
    }

    if (typeof data?.detail === "string" && data.detail) {
      return data.detail;
    }
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) return text;
    } catch {
      return fallback;
    }
  }

  return fallback;
}
