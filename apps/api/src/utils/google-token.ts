import { auth } from "../lib/auth";

export type GoogleTokenError =
  | "NO_GOOGLE_TOKEN"
  | "NO_REFRESH_TOKEN"
  | "TOKEN_REFRESH_FAILED"
  | "GOOGLE_CLIENT_CREDENTIALS_MISSING";

export class GoogleTokenException extends Error {
  code: GoogleTokenError;
  constructor(code: GoogleTokenError, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Returns a valid Google access token for the given user.
 *
 * Better Auth stores the Google OAuth access/refresh tokens in the `accounts`
 * table (captured during sign-in) and `getAccessToken` returns a fresh token,
 * transparently refreshing it via the stored refresh token when expired. This
 * replaces the previous hand-rolled refresh against oauth2.googleapis.com.
 */
export async function getValidGoogleToken(userId: string): Promise<string> {
  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { providerId: "google", userId },
    });

    if (!accessToken) {
      throw new GoogleTokenException(
        "NO_GOOGLE_TOKEN",
        "No Google tokens stored. Please sign in with Google again."
      );
    }

    return accessToken;
  } catch (err) {
    if (err instanceof GoogleTokenException) throw err;
    // Better Auth throws when there is no linked Google account or the refresh
    // fails (e.g. the refresh token was revoked). Surface as a re-auth prompt.
    console.error("Google token retrieval failed:", err);
    throw new GoogleTokenException(
      "TOKEN_REFRESH_FAILED",
      "Failed to get a valid Google access token. Please sign in with Google again."
    );
  }
}
