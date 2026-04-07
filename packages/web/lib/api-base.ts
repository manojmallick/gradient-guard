function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const raw =
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001";

  const normalized = stripTrailingSlash(raw);

  // Accept either base URL or a URL already ending in /api.
  if (normalized.endsWith("/api")) {
    return normalized.slice(0, -4);
  }

  return normalized;
}
