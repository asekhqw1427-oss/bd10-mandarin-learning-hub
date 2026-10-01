import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabase);
export const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || "admin@example.com";
const learnerEmailDomain = import.meta.env.VITE_LEARNER_EMAIL_DOMAIN || "bd10.local";
// Admin recovery links must return to the published app even if requested from localhost.
const adminAuthRedirectUrl = "https://bd10-engineer-learning-demo-qw1427.qw1427.chatgpt.site/admin";

export function isAdminUser(user) {
  const email = String(user?.email || "").toLowerCase();
  return user?.app_metadata?.role === "admin" || email === adminEmail.toLowerCase();
}

export function learnerEmailForLogin(employeeIdOrEmail) {
  const value = String(employeeIdOrEmail || "").trim().toLowerCase();
  if (value.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  }
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)
    ? `employee-${value}@${learnerEmailDomain}`
    : null;
}

export async function signInAdmin(password) {
  if (!supabase) return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signInWithPassword({ email: adminEmail, password });
}

export async function sendAdminLoginLink() {
  if (!supabase) return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signInWithOtp({
    email: adminEmail,
    options: {
      emailRedirectTo: adminAuthRedirectUrl,
      shouldCreateUser: true,
    },
  });
}

export async function signOutAdmin() {
  if (supabase) await supabase.auth.signOut();
}

export async function signInLearner(employeeId, password) {
  if (!supabase) return { data: null, error: new Error("Supabase is not configured") };
  const email = learnerEmailForLogin(employeeId);
  if (!email) {
    return { data: null, error: Object.assign(new Error("Enter a valid Employee ID or complete email address"), { code: "invalid_learner_identifier" }) };
  }
  return supabase.auth.signInWithPassword({ email, password });
}
