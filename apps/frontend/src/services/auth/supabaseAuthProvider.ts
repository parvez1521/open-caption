import type { User as SupabaseUser } from "@supabase/supabase-js";
import { User } from "../types";
import { AuthProvider } from "./types";
import { supabase } from "./supabaseClient";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const getProjectRef = (url: string | undefined): string => {
  if (!url) return "";
  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0] || "";
  } catch {
    return "";
  }
};

const projectRef = getProjectRef(supabaseUrl);
const STORAGE_KEY = projectRef ? `sb-${projectRef}-auth-token` : "sb-auth-token";

function resolveDisplayName(sbUser: SupabaseUser): string {
  // Anonymous (guest) sessions have no name and no email: call them what they
  // are — "Guest" — never the generic "User", which reads as a signed-in name.
  if (sbUser.is_anonymous) return "Guest";
  const meta = sbUser.user_metadata ?? {};
  const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  // The app-level override lives under `display_name`, a key Google never
  // sends: a name saved in /settings survives the next Google sign-in, which
  // refreshes `name` from the provider's profile and would otherwise
  // overwrite it. Blank overrides fall through, never blank the name.
  return (
    text(meta.display_name) ||
    text(meta.name) ||
    sbUser.email?.split("@")[0] ||
    "User"
  );
}

function mapSupabaseUser(sbUser: SupabaseUser): User {
  const name = resolveDisplayName(sbUser);
  return {
    id: sbUser.id,
    email: sbUser.email || "",
    name: name.charAt(0).toUpperCase() + name.slice(1),
    avatar_url: sbUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
    created_at: sbUser.created_at,
  };
}

type UserChangeListener = (user: User | null) => void;
const userChangeListeners = new Set<UserChangeListener>();

function notifyUserChange(user: User | null) {
  userChangeListeners.forEach((cb) => cb(user));
}

let activeToken: string | null = null;

if (typeof window !== "undefined") {
  // Track auth state changes (login/logout/token refresh) to dynamically
  // cache the token. supabase-js fires "INITIAL_SESSION" once its own
  // startup refresh-if-expired completes, but that's async — until it
  // fires, getToken() below would otherwise fall back to the raw,
  // possibly-expired token straight from localStorage. Eagerly awaiting
  // getSession() here (which itself waits on that same internal refresh)
  // closes most of that race on page load.
  supabase.auth.onAuthStateChange((event, session) => {
    activeToken = session?.access_token || null;
    // A profile save (updateUser → USER_UPDATED) or a fresh sign-in changes
    // the user object: push it to every subscribed shell/page so a saved
    // name shows without a reload. Token refreshes carry no new name, so
    // they notify nobody.
    if (event === "USER_UPDATED" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
      notifyUserChange(session?.user ? mapSupabaseUser(session.user) : null);
    }
  });
  supabase.auth.getSession().then(({ data: { session } }) => {
    activeToken = session?.access_token || null;
  });
}

function getPersistedToken(): string | null {
  if (typeof window === "undefined") return null;
  const sessionStr = localStorage.getItem(STORAGE_KEY);
  if (!sessionStr) return null;
  try {
    const session = JSON.parse(sessionStr);
    return session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Decode a JWT payload WITHOUT verifying it — expiry/anonymous checks
 * only; the server verifies every API call itself. Undecodable → null.
 */
function decodeSessionToken(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True when the token is a JWT whose exp has passed. Undecodable tokens
 * and tokens without an exp claim are never stale here — the server decides. */
export function isExpiredSessionToken(token: string): boolean {
  const payload = decodeSessionToken(token);
  if (!payload) return false;
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  return exp !== null && exp * 1000 <= Date.now();
}

/**
 * True when a 401 on a call carrying this token means "sign in again": a
 * decodable, non-anonymous session JWT. Guest (anonymous) sessions and
 * opaque tokens keep the old behaviour — guests get a fresh guest session
 * from the dashboard layout, and callers that handle 401s themselves
 * (Studio) still see their error.
 */
export function isSignInAgainToken(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeSessionToken(token);
  if (!payload) return false;
  return payload.is_anonymous !== true;
}

export const supabaseAuthProvider: AuthProvider = {
  async register(name: string, email: string, password: string, opts?: { marketingOptIn?: boolean }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // the confirmation link lands straight in the studio (without this it falls back to the landing page)
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/start` : undefined,
        data: {
          name,
          avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
          // signup-time marketing consent (unchecked by default on any form
          // that passes it); the capture route honours it on first insert
          marketing_opt_in: opts?.marketingOptIn === true,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error("Registration failed. No user returned.");
    }

    const user = mapSupabaseUser(data.user);
    const token = data.session?.access_token || getPersistedToken() || "";
    activeToken = token;

    return { user, token };
  },

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user || !data.session) {
      throw new Error("Login failed. No session returned.");
    }

    const user = mapSupabaseUser(data.user);
    const token = data.session.access_token;
    activeToken = token;

    return { user, token };
  },

  async loginWithGoogle() {
    // FALLBACK flow, kept deliberately: the login page and SignupGate prefer the Google
    // Identity Services button (services/auth/googleIdToken.ts — the chooser says
    // captionit.in, no client secret needed) and use this OAuth redirect only when the
    // GIS client ID is unset or its script fails to load. Do not delete: it is the only
    // sign-in path until a live login proves the GIS chooser text.
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/start` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
    if (error) {
      throw new Error(error.message);
    }
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    activeToken = null;
  },

  async getCurrentUser() {
    // the signed-in user is already in the stored session: no round-trip to learn the name and avatar (the server
    // verifies every API call itself, so nothing here is a security decision)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return mapSupabaseUser(session.user);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return mapSupabaseUser(user);
  },

  async getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || null;
    activeToken = token;
    return token;
  },

  isAuthenticated() {
    // C-07: a persisted token is not proof of a live session — its exp may
    // have passed hours ago, and the old `!!token` check then let /growth
    // render as signed-in while every API call 401'd. Either live token
    // counts (the in-memory one can lag a refresh, the persisted one can
    // lag a sign-out); an undecodable token keeps the old behaviour.
    const tokens = [activeToken, getPersistedToken()].filter((t): t is string => !!t);
    if (tokens.length === 0) return false;
    return tokens.some((t) => !isExpiredSessionToken(t));
  },

  async requestPasswordReset(email: string) {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      throw new Error(error.message);
    }
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }
  },

  async updateProfile(fields: { name?: string }) {
    const name = fields.name?.trim() ?? "";
    if (!name) {
      throw new Error("Display name can't be empty.");
    }
    const { data, error } = await supabase.auth.updateUser({
      // `display_name` is the durable override: Google never sends that key,
      // so the next sign-in can't overwrite it. `name` stays in sync for
      // anything else reading the provider name.
      data: { display_name: name, name },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (!data.user) {
      throw new Error("Profile update failed. No user returned.");
    }
    return mapSupabaseUser(data.user);
  },

  subscribeToUserChanges(cb: (user: User | null) => void) {
    userChangeListeners.add(cb);
    return () => {
      userChangeListeners.delete(cb);
    };
  },
};
