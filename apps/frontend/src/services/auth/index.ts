import { isSignInAgainToken, supabaseAuthProvider } from "./supabaseAuthProvider";

/**
 * Single authentication service reference mapping directly to the real Supabase Auth provider.
 */
export const authService = supabaseAuthProvider;

export { isExpiredSessionToken, isSignInAgainToken } from "./supabaseAuthProvider";

export type { AuthProvider } from "./types";
