const ADMIN_EMAIL = "admin@example.com";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function cleanFileName(value) {
  return String(value || "file").normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
}

async function requireAdmin(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "Sign in to manage lesson materials." }, 401) };
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return { error: json({ error: "Admin verification is not configured." }, 503) };
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { error: json({ error: "Your session has expired. Sign in again." }, 401) };
  const user = await response.json();
  const adminEmail = String(env.VITE_ADMIN_EMAIL || env.ADMIN_EMAIL || ADMIN_EMAIL).toLowerCase();
  const hasAdminRole = user.app_metadata?.role === "admin";
  if (!hasAdminRole && String(user.email || "").toLowerCase() !== adminEmail) return { error: json({ error: "Admin access is required." }, 403) };
  return { user };
}

function parseLesson(row) {
  try {
    return { ...JSON.parse(row.payload), id: row.id, status: row.status, updatedAt: row.updated_at, storageBackend: "sites" };
  } catch {
    return null;
  }
}

async function allRows(env) {
  const { results = [] } = await env.DB.prepare("SELECT id, status, payload, updated_at FROM lesson_materials ORDER BY updated_at DESC").all();
  return results;
}

async function listLessons(env, admin = false) {
  const rows = await allRows(env);
  const hiddenIds = rows.filter((row) => row.status === "deleted").map((row) => row.id);
  const lessons = rows
    .filter((row) => row.status !== "deleted" && (admin || row.status === "published"))
    .map(parseLesson)
    .filter(Boolean);
  return json({ lessons, hiddenIds });
}

async function saveLesson(request, env, id) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const body = await request.json();
  if (!body || typeof body !== "object" || !body.title || !body.id || String(body.id) !== id) {
    return json({ error: "Lesson ID and title are required." }, 400);
  }
  const updatedAt = new Date().toISOString();
  const lesson = { ...body, id, updatedAt, storageBackend: "sites" };
  await env.DB.prepare("INSERT INTO lesson_materials (id, status, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at")
    .bind(id, lesson.status || "draft", JSON.stringify(lesson), updatedAt).run();
  return json({ lesson });
}

async function uploadAsset(request, env, id, url) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const kind = url.searchParams.get("kind") === "source" ? "source" : "slides";
  const order = Math.max(1, Number(url.searchParams.get("order") || 1));
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.stream !== "function") return json({ error: "Choose a file to upload." }, 400);
  if (file.size > 200 * 1024 * 1024) return json({ error: "Each file must be 200 MB or smaller." }, 413);
  const key = `${id}/${kind}/${String(order).padStart(3, "0")}-${cleanFileName(file.name)}`;
  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { lessonId: id, originalName: cleanFileName(file.name) },
  });
  return json({ key, url: `/api/material-files/${encodeURIComponent(id)}/${key.slice(id.length + 1).split("/").map(encodeURIComponent).join("/")}`, name: file.name, type: file.type, size: file.size });
}

async function serveAsset(request, env, pathname) {
  const parts = pathname.slice("/api/material-files/".length).split("/").map(decodeURIComponent);
  const id = parts.shift();
  const key = `${id}/${parts.join("/")}`;
  if (!id || !parts.length || key.includes("..")) return json({ error: "File not found." }, 404);
  const row = await env.DB.prepare("SELECT status FROM lesson_materials WHERE id = ?").bind(id).first();
  if (!row || row.status === "deleted") return json({ error: "File not found." }, 404);
  if (row.status !== "published") {
    const auth = await requireAdmin(request, env);
    if (auth.error) return json({ error: "File not found." }, 404);
  }
  const object = await env.BUCKET.get(key);
  if (!object) return json({ error: "File not found." }, 404);
  const headers = new Headers({ "Cache-Control": row.status === "published" ? "public, max-age=3600" : "private, no-store" });
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function deleteLesson(request, env, id) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const updatedAt = new Date().toISOString();
  const tombstone = JSON.stringify({ id, status: "deleted", updatedAt, storageBackend: "sites" });
  await env.DB.prepare("INSERT INTO lesson_materials (id, status, payload, updated_at) VALUES (?, 'deleted', ?, ?) ON CONFLICT(id) DO UPDATE SET status = 'deleted', payload = excluded.payload, updated_at = excluded.updated_at")
    .bind(id, tombstone, updatedAt).run();
  let cursor;
  do {
    const listed = await env.BUCKET.list({ prefix: `${id}/`, cursor });
    if (listed.objects.length) await env.BUCKET.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return json({ success: true, id });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response(null, { status: 404 });
    try {
      if (url.pathname === "/api/materials" && request.method === "GET") return listLessons(env, false);
      if (url.pathname === "/api/admin/materials" && request.method === "GET") {
        const auth = await requireAdmin(request, env);
        if (auth.error) return auth.error;
        return listLessons(env, true);
      }
      if (url.pathname.startsWith("/api/material-files/") && request.method === "GET") return serveAsset(request, env, url.pathname);
      const match = url.pathname.match(/^\/api\/admin\/materials\/([^/]+)(?:\/(assets))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        if (match[2] && request.method === "POST") return uploadAsset(request, env, id, url);
        if (!match[2] && request.method === "PUT") return saveLesson(request, env, id);
        if (!match[2] && request.method === "DELETE") return deleteLesson(request, env, id);
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error("BD10 material API error", error);
      return json({ error: "The lesson storage service is temporarily unavailable. Please try again." }, 500);
    }
  },
};
