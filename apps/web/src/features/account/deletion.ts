/**
 * Account deletion on the website (Account → Delete account; Google Play requires a web route).
 * The signed-in user confirms by typing the word, then the server calls the same `delete-account`
 * Edge Function as the app, with the user's own JWT – one deletion path for both surfaces.
 */

/** The word the user types to confirm (not translated, same as in the app). */
export const DELETE_CONFIRMATION = 'DELETE';

export const confirmsDeletion = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() === DELETE_CONFIRMATION;

/** Calls `delete-account`; true once the account is gone (the function is idempotent). */
export async function requestDeletion(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(
      `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/delete-account`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, apikey: publishableKey },
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
