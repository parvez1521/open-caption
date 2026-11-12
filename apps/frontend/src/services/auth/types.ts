import { User } from "../types";

/**
 * Source: Sprint 1.6 brief > Authentication ("Make replacing it with
 * Supabase Auth a single-module change."). Every provider (mock today,
 * Supabase later) implements this interface; callers (pages, api-client)
 * only ever depend on this shape, never on a concrete provider.
 */
export interface AuthProvider {
  login(email: string, password: string): Promise<{ user: User; token: string }>;
  loginWithGoogle(): Promise<void>;
  register(name: string, email: string, password: string): Promise<{ user: User; token: string }>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  getToken(): Promise<string | null>;
  isAuthenticated(): boolean;
  /** Sends a real password-recovery email. Resolves on success; throws on
   * failure (e.g. provider error) — callers show the result as a graceful
   * error rather than a fake "check your email" success. */
  requestPasswordReset(email: string): Promise<void>;
  /** Completes a password reset from the recovery link's session
   * (established client-side by Supabase's redirect before this is called). */
  updatePassword(newPassword: string): Promise<void>;
  /** Updates the current user's profile (display name today). Returns the
   * updated user so callers can refresh local state without a refetch. */
  updateProfile(fields: { name?: string }): Promise<User>;
  /** Subscribes to signed-in user changes (profile save, sign-in/out). The
   * callback receives the mapped user (null after sign-out); returns an
   * unsubscribe function. Lets the shell and pages show a saved name
   * without a reload. */
  subscribeToUserChanges(cb: (user: User | null) => void): () => void;
}
