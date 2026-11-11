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

function mapSupabaseUser(sbUser: SupabaseUser): User {
  // Anonymous (guest) sessions have no name and no email: call them what they
  // are — "Guest" — never the generic "User", which reads as a signed-in name.
  const name = sbUser.is_anonymous
    ? "Guest"
    : sbUser.user_metadata?.name || sbUser.email?.split("@")[0] || "User";
  return {
    id: sbUser.id,
    email: sbUser.email || "",
    name: name.charAt(0).toUpperCase() + name.slice(1),
    avatar_url: sbUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
    created_at: sbUser.created_at,
  };
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
  supabase.auth.onAuthStateChange((_event, session) => {
    activeToken = session?.access_token || null;
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

export const supabaseAuthProvider: AuthProvider = {
  async register(name: string, email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // the confirmation link lands straight in the studio (without this it falls back to the landing page)
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/start` : undefined,
        data: {
          name,
          avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
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
    return !!activeToken || !!getPersistedToken();
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
    const { data, error } = await supabase.auth.updateUser({
      data: { ...(fields.name !== undefined ? { name: fields.name } : {}) },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (!data.user) {
      throw new Error("Profile update failed. No user returned.");
    }
    return mapSupabaseUser(data.user);
  },
};
