import { eq } from "drizzle-orm";
import { db, users } from "../db";

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
 * If the stored token is expired, it refreshes using the refresh token.
 */
export async function getValidGoogleToken(userId: string): Promise<string> {
  const [user] = await db
    .select({
      googleProviderToken: users.googleProviderToken,
      googleProviderRefreshToken: users.googleProviderRefreshToken,
      googleTokenExpiresAt: users.googleTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.googleProviderToken && !user?.googleProviderRefreshToken) {
    throw new GoogleTokenException(
      "NO_GOOGLE_TOKEN",
      "No Google tokens stored. Please sign in with Google again."
    );
  }

  // If token exists and is not expired (with 2-min buffer), return it
  if (user.googleProviderToken && user.googleTokenExpiresAt) {
    const bufferMs = 2 * 60 * 1000;
    if (user.googleTokenExpiresAt.getTime() - bufferMs > Date.now()) {
      return user.googleProviderToken;
    }
  }

  // Token is expired or missing — refresh it
  if (!user.googleProviderRefreshToken) {
    throw new GoogleTokenException(
      "NO_REFRESH_TOKEN",
      "No refresh token available. Please sign out and sign in with Google again."
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new GoogleTokenException(
      "GOOGLE_CLIENT_CREDENTIALS_MISSING",
      "Google OAuth client credentials are not configured on the server."
    );
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: user.googleProviderRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error("Google token refresh failed:", errorBody);
    throw new GoogleTokenException(
      "TOKEN_REFRESH_FAILED",
      "Failed to refresh Google access token. Please sign in with Google again."
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    expires_in: number;
  };

  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  await db
    .update(users)
    .set({
      googleProviderToken: tokenData.access_token,
      googleTokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return tokenData.access_token;
}
