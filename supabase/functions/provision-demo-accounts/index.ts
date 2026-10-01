import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const accounts = [
  { id: "DEMO01", name: "Dimas", role: "learner" },
  { id: "DEMO02", name: "Demo Learner 2", role: "learner" },
  { id: "DEMO03", name: "Demo Learner 3", role: "learner" },
  { id: "DEMO04", name: "Demo Learner 4", role: "learner" },
  { id: "DEMO05", name: "Demo Learner 5", role: "learner" },
  { id: "ADMIN01", name: "BD10 Admin 1", role: "admin" },
  { id: "ADMIN02", name: "BD10 Admin 2", role: "admin" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function configuredKey(legacyName: string, keySetName: string) {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try {
    const values = JSON.parse(Deno.env.get(keySetName) || "{}");
    return values.default || Object.values(values)[0] || "";
  } catch {
    return "";
  }
}

function createPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `B10-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}!`;
}

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST to provision demo accounts." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = configuredKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const serviceKey = configuredKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  if (!url || !anonKey || !serviceKey) return json({ error: "Supabase server credentials are not configured." }, 503);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in as an administrator first." }, 401);

  const callerClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  const caller = callerData?.user;
  if (callerError || !caller) return json({ error: "Your session is invalid or expired." }, 401);

  const ownerEmail = (Deno.env.get("BD10_OWNER_ADMIN_EMAIL") || "admin@example.com").toLowerCase();
  if (caller.app_metadata?.role !== "admin" && caller.email?.toLowerCase() !== ownerEmail) {
    return json({ error: "Only a BD10 administrator can create demo accounts." }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const rotateExisting = body?.rotateExisting === true;
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const results = [];
  const errors = [];

  for (const account of accounts) {
    const email = `employee-${account.id.toLowerCase()}@bd10.local`;
    const password = createPassword();
    const userMetadata = { display_name: account.name, employee_id: account.id, account_kind: account.role };
    try {
      const existing = await findUserByEmail(adminClient, email);
      let user = existing;
      let issuedPassword: string | null = null;
      let created = false;

      if (existing) {
        const isOwnedSeed = existing.app_metadata?.bd10_demo_seed === true
          && existing.app_metadata?.employee_id === account.id
          && existing.app_metadata?.role === account.role;
        if (!isOwnedSeed) {
          throw new Error("Reserved demo ID is already registered outside this provisioning flow.");
        }
        const update: Record<string, unknown> = {
          app_metadata: { ...existing.app_metadata, bd10_demo_seed: true, role: account.role, employee_id: account.id },
          user_metadata: { ...existing.user_metadata, ...userMetadata },
        };
        if (rotateExisting) {
          update.password = password;
          issuedPassword = password;
        }
        const { data, error } = await adminClient.auth.admin.updateUserById(existing.id, update);
        if (error) throw error;
        user = data.user;
      } else {
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { bd10_demo_seed: true, role: account.role, employee_id: account.id },
          user_metadata: userMetadata,
        });
        if (error) throw error;
        user = data.user;
        issuedPassword = password;
        created = true;
      }

      results.push({
        employeeId: account.id,
        displayName: account.name,
        role: account.role,
        email: user?.email,
        password: issuedPassword,
        created,
      });
    } catch (error) {
      console.error("Demo account provisioning failed", account.id, error);
      errors.push({ employeeId: account.id, message: "Could not create this account. Check Supabase Auth settings and retry." });
    }
  }

  return json({ accounts: results, errors, rotated: rotateExisting });
});
