/**
 * Microsoft OAuth shared configuration.
 * Lives outside route.ts files because Next.js Route handlers only allow
 * specific named exports (GET, POST, etc.) — any other export breaks the build.
 */

export const MS_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "Mail.Send",
  "Calendars.ReadWrite",
].join(" ");

export const MS_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
