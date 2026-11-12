const MiB = 1024 * 1024;
const downloadLimit = 20 * MiB;
const defaults = { title: "云盘", description: "", maxUploadMiB: 20 };
const configKey = "site:config";
const imageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const columns = "id, parent_id, kind, name, mime, size, tags, share_token, created_at";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) {
    throw new HttpError(503, "登录暂不可用，请联系管理员");
  }
  const provided = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!provided) throw new HttpError(401, "请输入管理员密钥");
  const hash = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [actual, expected] = await Promise.all([hash(provided), hash(env.ADMIN_TOKEN)]);
  if (!crypto.subtle.timingSafeEqual(actual, expected)) throw new HttpError(401, "管理员密钥不正确");
}

function validateConfig(value) {
  const title = value?.title?.trim?.();
  const description = value?.description?.trim?.();
  const maxUploadMiB = value?.maxUploadMiB;
  if (!title || title.length > 60 || typeof description !== "string" || description.length > 200 ||
      !Number.isInteger(maxUploadMiB) || maxUploadMiB < 1 || maxUploadMiB > 20) {
    throw new HttpError(400, "请填写站点名称，上传限制须为 1–20 MiB");
  }
  return { title, description, maxUploadMiB };
}

async function getConfig(env) {
  const stored = await env.CONFIG.get(configKey, "json");
  return stored === null ? defaults : validateConfig(stored);
}

async function bodyJson(request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const decoder = new TextDecoder();
    let body = "";
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 8192) {
        await reader.cancel();
        throw new Error();
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch {
    throw new HttpError(400, "请求必须是有效的 JSON，且不超过 8 KiB");
  }
}

function validName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 180 ||
      /[\u0000-\u001f\u007f/\\]/.test(value) || [".", ".."].includes(value.trim())) {
    throw new HttpError(400, "名称须为 1–180 字符，且不能包含路径分隔符");
  }
  return value.trim();
}

async function database(env) {
  const db = env.DB;
  const { results: fields } = await db.prepare("PRAGMA table_info(entries)").all();
  if (!fields.length) {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES entries(id),
        kind TEXT NOT NULL CHECK (kind IN ('folder', 'file')),
        name TEXT NOT NULL,
        mime TEXT,
        size INTEGER,
        telegram_file_id TEXT,
        telegram_message_id TEXT,
        telegram_chat_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        share_token TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        deleted_at TEXT
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS entries_parent_active ON entries(parent_id, kind, created_at DESC, id) WHERE deleted_at IS NULL")
    ]);
  } else if (!fields.some(({ name }) => name === "telegram_chat_id")) {
    try {
      await db.prepare("ALTER TABLE entries ADD COLUMN telegram_chat_id TEXT").run();
    } catch (error) {
      if (!/duplicate column name: telegram_chat_id/i.test(error.message)) throw error;
    }
  }
  return db;
}

const entrySort = new Map([
  ["name-asc", "name COLLATE NOCASE ASC"],
  ["name-desc", "name COLLATE NOCASE DESC"],
  ["size-asc", "size ASC, name COLLATE NOCASE ASC"],
  ["size-desc", "size DESC, name COLLATE NOCASE ASC"],
  ["created-asc", "created_at ASC"],
  ["created-desc", "created_at DESC"]
]);

async function list(db, url) {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const tag = (url.searchParams.get("tag") ?? "").trim().slice(0, 24);
  const parent = url.searchParams.get("parent") || null;
  const offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get("offset"), 10) || 0));
  const order = entrySort.get(url.searchParams.get("sort")) ?? entrySort.get("created-desc");
  const conditions = ["deleted_at IS NULL"];
  const parameters = [];
  if (q) {
    conditions.push("instr(lower(name), lower(?)) > 0");
    parameters.push(q);
  }
  if (!q && !tag) {
    conditions.push("parent_id IS ?");
    parameters.push(parent);
  }
  if (tag) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)");
    parameters.push(tag);
  }
  const { results } = await db.prepare(
    `SELECT ${columns} FROM entries WHERE ${conditions.join(" AND ")}
     ORDER BY kind DESC, ${order}, id LIMIT 51 OFFSET ?`
  ).bind(...parameters, offset).all();
  return json({
    entries: results.slice(0, 50).map((entry) => ({ ...entry, tags: JSON.parse(entry.tags) })),
    hasMore: results.length > 50
  });
}

async function createEntry(db, { parent, kind, name, mime = null, size = null, fileId = null, messageId = null, chatId = null }) {
  const id = crypto.randomUUID();
  const result = await db.prepare(`INSERT INTO entries
    (id, parent_id, kind, name, mime, size, telegram_file_id, telegram_message_id, telegram_chat_id)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ? IS NULL OR EXISTS (SELECT 1 FROM entries WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL)`)
    .bind(id, parent, kind, name, mime, size, fileId, messageId, chatId, parent, parent).run();
  if (!result.meta.changes) throw new HttpError(404, "目录已不存在");
  return json({ id }, 201);
}

function telegramToken(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN)) {
    throw new HttpError(503, "文件服务暂不可用，请联系管理员");
  }
  return env.TELEGRAM_BOT_TOKEN;
}

async function telegram(env, method, body) {
  const token = telegramToken(env);
  let response;
  let data;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body, redirect: "manual" });
    data = await response.json();
  } catch {
    throw new HttpError(502, "文件服务连接失败，请稍后重试");
  }
  if (response.status === 429) throw new HttpError(429, "文件操作过于频繁，请稍后重试");
  if (!response.ok || !data.ok) throw new HttpError(502, "文件操作失败，请稍后重试");
  return data.result;
}

async function upload(request, db, env, url) {
  const name = validName(url.searchParams.get("name"));
  const parent = url.searchParams.get("parent") || null;
  const { maxUploadMiB } = await getConfig(env);
  const limit = maxUploadMiB * MiB;
  const tooLarge = () => new HttpError(413, `文件不能超过 ${maxUploadMiB} MiB`);
  if (Number(request.headers.get("Content-Length")) > limit) throw tooLarge();
  if (!/^-?\d+$/.test(env.TELEGRAM_STORAGE_CHAT_ID ?? "")) {
    throw new HttpError(503, "文件服务暂不可用，请联系管理员");
  }
  if (parent && !(await db.prepare("SELECT 1 FROM entries WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL").bind(parent).first())) {
    throw new HttpError(404, "目录已不存在");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "请选择非空文件");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  if (!size) throw new HttpError(400, "请选择非空文件");
  const contentType = request.headers.get("Content-Type");
  const mime = imageTypes.has(contentType) ? contentType : "application/octet-stream";
  const form = new FormData();
  form.set("chat_id", env.TELEGRAM_STORAGE_CHAT_ID);
  form.set("disable_content_type_detection", "true");
  form.set("document", new Blob(chunks, { type: mime }), name);
  const message = await telegram(env, "sendDocument", form);
  if (!message.document?.file_id) throw new HttpError(502, "文件保存失败，请稍后重试");
  return createEntry(db, {
    parent, kind: "file", name, mime, size,
    fileId: message.document.file_id, messageId: String(message.message_id),
    chatId: String(message.chat?.id ?? env.TELEGRAM_STORAGE_CHAT_ID)
  });
}

async function content(db, env, column, id, preview) {
  const item = await db.prepare(
    `SELECT name, mime, size, telegram_file_id FROM entries WHERE ${column} = ? AND kind = 'file' AND deleted_at IS NULL`
  ).bind(id).first();
  if (!item) throw new HttpError(404, "文件不存在或链接已失效");
  if (item.size > downloadLimit) throw new HttpError(413, "文件超过下载大小限制");
  const token = telegramToken(env);
  const file = await telegram(env, "getFile", new URLSearchParams({ file_id: item.telegram_file_id }));
  if (typeof file.file_path !== "string" || !/^[\w./-]+$/.test(file.file_path) || file.file_path.split("/").includes("..")) {
    throw new HttpError(502, "无法读取文件，请稍后重试");
  }
  const upstream = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { redirect: "manual" })
    .catch(() => null);
  if (!upstream?.ok || !upstream.body) throw new HttpError(502, "下载失败，请稍后重试");
  const inline = preview && imageTypes.has(item.mime);
  const encodedName = encodeURIComponent(item.name.toWellFormed()).replace(/['()*]/g, (character) =>
    "%" + character.charCodeAt(0).toString(16).toUpperCase());
  return new Response(upstream.body, {
    headers: {
      "Content-Type": inline ? item.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox"
    }
  });
}

async function moveEntry(db, id, parent) {
  if (parent !== null && (typeof parent !== "string" || !/^[a-f0-9-]{36}$/.test(parent))) {
    throw new HttpError(400, "目标目录无效");
  }
  const moved = await db.prepare(`WITH RECURSIVE ancestors(id, parent_id) AS (
    SELECT id, parent_id FROM entries WHERE id = ?1 AND kind = 'folder' AND deleted_at IS NULL
    UNION
    SELECT entries.id, entries.parent_id FROM entries JOIN ancestors ON entries.id = ancestors.parent_id
    WHERE entries.deleted_at IS NULL
  )
  UPDATE entries SET parent_id = ?1
  WHERE id = ?2 AND deleted_at IS NULL AND (
    ?1 IS NULL OR (
      EXISTS (SELECT 1 FROM ancestors WHERE id = ?1)
      AND NOT EXISTS (SELECT 1 FROM ancestors WHERE id = ?2)
    )
  )
  RETURNING id`).bind(parent, id).first();
  if (!moved) throw new HttpError(409, "无法移动：项目或目标目录已不存在，或者目标目录位于该项目内");
  return json({ ok: true });
}

async function updateEntry(db, id, body) {
  if (body?.parent !== undefined) return moveEntry(db, id, body.parent);
  if (body?.share !== undefined) {
    if (typeof body.share !== "boolean") throw new HttpError(400, "无效的分享设置");
    const item = await db.prepare(`UPDATE entries
      SET share_token = CASE WHEN ? THEN coalesce(share_token, ?) ELSE NULL END
      WHERE id = ? AND kind = 'file' AND deleted_at IS NULL RETURNING share_token`)
      .bind(Number(body.share), crypto.randomUUID().replaceAll("-", ""), id).first();
    if (!item) throw new HttpError(404, "文件不存在");
    return json(item);
  }
  if (body?.name !== undefined) {
    const { meta } = await db.prepare("UPDATE entries SET name = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(validName(body.name), id).run();
    if (!meta.changes) throw new HttpError(404, "项目不存在");
    return json({ ok: true });
  }
  if (!Array.isArray(body?.tags) || body.tags.length > 8 ||
      body.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 24)) {
    throw new HttpError(400, "最多设置 8 个标签，每个标签不超过 24 字符");
  }
  const tags = [...new Set(body.tags.map((tag) => tag.trim()))];
  const { meta } = await db.prepare("UPDATE entries SET tags = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(JSON.stringify(tags), id).run();
  if (!meta.changes) throw new HttpError(404, "项目不存在");
  return json({ ok: true });
}

async function removeEntry(db, id, env, legacyMode) {
  const tree = `WITH RECURSIVE descendants(id) AS (
    SELECT id FROM entries WHERE id = ? AND deleted_at IS NULL
    UNION ALL
    SELECT entries.id FROM entries JOIN descendants ON entries.parent_id = descendants.id
    WHERE entries.deleted_at IS NULL
  )`;
  const legacy = `SELECT 1 FROM entries JOIN descendants USING (id)
    WHERE kind = 'file' AND telegram_chat_id IS NULL AND telegram_message_id IS NOT NULL`;
  const { results } = await db.prepare(`${tree}
    UPDATE entries SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), share_token = NULL
    WHERE id IN (SELECT id FROM descendants)
      AND (? OR NOT EXISTS (${legacy}))
    RETURNING kind, telegram_chat_id, telegram_message_id, created_at`)
    .bind(id, Number(legacyMode === "current" || legacyMode === "skip")).all();
  if (!results.length) {
    if (await db.prepare(`${tree} ${legacy} LIMIT 1`).bind(id).first()) {
      return json({ code: "LEGACY_DESTINATION", error: "部分旧文件未记录原始存储位置" }, 409);
    }
    throw new HttpError(404, "项目不存在");
  }

  const files = results.filter((entry) => entry.kind === "file");
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const groups = new Map();
  for (const file of files) {
    if (Date.parse(file.created_at) <= cutoff) continue;
    const chatId = file.telegram_chat_id ?? (legacyMode === "current" ? env.TELEGRAM_STORAGE_CHAT_ID : null);
    const messageId = Number(file.telegram_message_id);
    if (!/^-?\d+$/.test(chatId ?? "") || !Number.isSafeInteger(messageId) || messageId < 1) continue;
    if (!groups.has(chatId)) groups.set(chatId, new Set());
    groups.get(chatId).add(messageId);
  }
  let confirmed = 0;
  let requestsLeft = 40;
  for (const [chatId, group] of groups) {
    const messages = [...group];
    for (let start = 0; start < messages.length && requestsLeft > 0; start += 100) {
      const batch = messages.slice(start, start + 100);
      requestsLeft -= 1;
      try {
        const single = batch.length === 1;
        const parameters = single ? { message_id: String(batch[0]) } : { message_ids: JSON.stringify(batch) };
        const success = await telegram(env, single ? "deleteMessage" : "deleteMessages",
          new URLSearchParams({ chat_id: chatId, ...parameters }));
        if (success === true) confirmed += batch.length;
      } catch {
        // Keep the drive deletion and report original messages that could not be confirmed.
      }
    }
  }
  return json({ removed: results.length, originalConfirmed: confirmed, originalUnconfirmed: files.length - confirmed });
}

async function handle(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;
  if (pathname === "/api/config" && method === "GET") return json(await getConfig(env));
  if (pathname === "/api/health" && method === "GET") return json({ status: "ok" });
  const shared = pathname.match(/^\/f\/([a-f0-9]{32})(\/preview)?$/);
  if (shared && method === "GET") return content(await database(env), env, "share_token", shared[1], !!shared[2]);
  if (!pathname.startsWith("/api/")) throw new HttpError(404, "地址不存在");
  await requireAdmin(request, env);
  if (pathname === "/api/session" && method === "GET") return json({ ok: true });
  if (pathname === "/api/config" && method === "PUT") {
    const settings = validateConfig(await bodyJson(request));
    try {
      await env.CONFIG.put(configKey, JSON.stringify(settings));
    } catch (error) {
      if (/429|rate.limit/i.test(error?.message ?? "")) throw new HttpError(429, "配置保存过于频繁，请稍后重试");
      throw error;
    }
    return json(settings);
  }
  const db = await database(env);
  if (pathname === "/api/entries" && method === "GET") return list(db, url);
  if (pathname === "/api/folders" && method === "POST") {
    const body = await bodyJson(request);
    const parent = body?.parent ?? null;
    if (parent !== null && typeof parent !== "string") throw new HttpError(400, "目录标识无效");
    return createEntry(db, { parent, kind: "folder", name: validName(body?.name) });
  }
  if (pathname === "/api/upload" && method === "POST") return upload(request, db, env, url);
  const entry = pathname.match(/^\/api\/entries\/([a-f0-9-]{36})(\/(?:preview|download))?$/);
  if (entry) {
    if (entry[2] && method === "GET") return content(db, env, "id", entry[1], entry[2] === "/preview");
    if (!entry[2] && method === "PATCH") return updateEntry(db, entry[1], await bodyJson(request));
    if (!entry[2] && method === "DELETE") return removeEntry(db, entry[1], env, url.searchParams.get("legacy"));
  }
  throw new HttpError(404, "接口不存在");
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: "服务暂不可用，请稍后重试" }, 500);
    }
  }
};
