import { previewType } from "../public/media-types.js";

const MiB = 1024 * 1024;
const downloadLimit = 20 * MiB;
const defaults = { title: "云盘", description: "", maxUploadMiB: 20 };
const configKey = "site:config";
const imageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const columns = "id, parent_id, kind, name, mime, size, tags, share_code, share_expires_at, created_at";
const activeShare = "(share_expires_at IS NULL OR share_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";
const shareDurations = new Set([3600, 86400, 604800, 2592000]);

function inboxContains(folder, code) {
  return `EXISTS (
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM entries WHERE id = ${folder} AND kind = 'folder' AND deleted_at IS NULL
      UNION
      SELECT e.id, e.parent_id FROM entries e JOIN ancestors a ON e.id = a.parent_id
      WHERE e.kind = 'folder' AND e.deleted_at IS NULL
    )
    SELECT 1 FROM ancestors JOIN entries USING (id) WHERE share_code = ${code} AND ${activeShare}
  )`;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function newShareCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_");
}

async function sharePage(env, url, page) {
  const asset = await env.ASSETS.fetch(new URL(page, url));
  const headers = new Headers(asset.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(asset.body, { status: asset.status, headers });
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 8) {
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
      db.prepare(entriesTable("entries")),
      ...entryIndexes(db)
    ]);
  } else {
    for (const column of ["telegram_chat_id", "share_expires_at", "share_code"]) {
      if (fields.some(({ name }) => name === column)) continue;
      try {
        await db.prepare(`ALTER TABLE entries ADD COLUMN ${column} TEXT`).run();
      } catch (error) {
        if (!error.message.includes("duplicate column name: " + column)) throw error;
      }
    }
    if (fields.some(({ name }) => name === "share_token")) await migrateShareCodes(db);
  }
  return db;
}

function entriesTable(table) {
  return `CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES ${table}(id),
        kind TEXT NOT NULL CHECK (kind IN ('folder', 'file')),
        name TEXT NOT NULL,
        mime TEXT,
        size INTEGER,
        telegram_file_id TEXT,
        telegram_message_id TEXT,
        telegram_chat_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        share_code TEXT,
        share_expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        deleted_at TEXT
      )`;
}

function entryIndexes(db) {
  return [
    db.prepare("CREATE INDEX IF NOT EXISTS entries_parent_active ON entries(parent_id, kind, created_at DESC, id) WHERE deleted_at IS NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS entries_share_code ON entries(share_code) WHERE share_code IS NOT NULL")
  ];
}

async function migrateShareCodes(db) {
  // SQLite requires rebuilding the table to remove a column with an inline UNIQUE constraint.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const randomCode = Array(12).fill(`substr('${alphabet}', (random() & 63) + 1, 1)`).join(" || ");
  const savedColumns = columns + ", telegram_file_id, telegram_message_id, telegram_chat_id, deleted_at";
  const migratedColumns = savedColumns.replace("share_code,", `CASE
    WHEN share_code IS NOT NULL THEN share_code
    WHEN share_token IS NOT NULL AND deleted_at IS NULL AND ${activeShare} THEN ${randomCode}
    ELSE NULL END,`);
  try {
    await db.batch([
      db.prepare("PRAGMA defer_foreign_keys = ON"),
      db.prepare(entriesTable("entries_short_links")),
      db.prepare(`INSERT INTO entries_short_links (${savedColumns}) SELECT ${migratedColumns} FROM entries`),
      db.prepare("DROP TABLE entries"),
      db.prepare("ALTER TABLE entries_short_links RENAME TO entries"),
      ...entryIndexes(db)
    ]);
  } catch (error) {
    const { results } = await db.prepare("PRAGMA table_info(entries)").all();
    if (!results.some(({ name }) => name === "share_code") ||
        results.some(({ name }) => name === "share_token")) throw error;
  }
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
  let offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get("offset"), 10) || 0));
  const focus = url.searchParams.get("focus");
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
  const where = conditions.join(" AND ");
  const sortOrder = `kind DESC, ${order}, id`;
  if (focus) {
    const match = await db.prepare(`SELECT position FROM (
      SELECT id, row_number() OVER (ORDER BY ${sortOrder}) - 1 AS position
      FROM entries WHERE ${where}
    ) WHERE id = ?`).bind(...parameters, focus).first();
    if (!match) throw new HttpError(404, "文件已移动或删除，请重新打开链接管理");
    offset = Math.floor(match.position / 50) * 50;
  }
  const { results } = await db.prepare(
    `SELECT ${columns} FROM entries WHERE ${where} ORDER BY ${sortOrder} LIMIT 51 OFFSET ?`
  ).bind(...parameters, offset).all();
  return json({
    entries: results.slice(0, 50).map((entry) => ({ ...entry, tags: JSON.parse(entry.tags) })),
    hasMore: results.length > 50,
    ...(focus ? { offset } : {})
  });
}

async function createEntry(db, { parent, kind, name, mime = null, size = null, fileId = null, messageId = null, chatId = null, inboxCode = null }) {
  const id = crypto.randomUUID();
  const result = await db.prepare(`INSERT INTO entries
    (id, parent_id, kind, name, mime, size, telegram_file_id, telegram_message_id, telegram_chat_id)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ?2 IS NULL OR EXISTS (
      SELECT 1 FROM entries WHERE id = ?2 AND kind = 'folder' AND deleted_at IS NULL
      AND (?10 IS NULL OR ${inboxContains("?2", "?10")})
    )`)
    .bind(id, parent, kind, name, mime, size, fileId, messageId, chatId, inboxCode).run();
  if (!result.meta.changes) throw new HttpError(404, inboxCode ? "收件链接已失效" : "目录已不存在");
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
  if (response.status === 429) {
    const seconds = data.parameters?.retry_after;
    throw new HttpError(429, Number.isSafeInteger(seconds) && seconds > 0
      ? "文件操作过于频繁，请在 " + seconds + " 秒后重试"
      : "文件操作过于频繁，请稍后重试");
  }
  if (!response.ok || !data.ok) throw new HttpError(502, "文件操作失败，请稍后重试");
  return data.result;
}

async function upload(request, db, env, url, inbox = null) {
  const name = validName(url.searchParams.get("name"));
  const parent = inbox ? inbox.id : url.searchParams.get("parent") || null;
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
  const messageId = String(message.message_id);
  const chatId = String(message.chat?.id ?? env.TELEGRAM_STORAGE_CHAT_ID);
  try {
    return await createEntry(db, {
      parent, kind: "file", name, mime, size, fileId: message.document.file_id,
      messageId, chatId, inboxCode: inbox?.code
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      await telegram(env, "deleteMessage", new URLSearchParams({ chat_id: chatId, message_id: messageId })).catch(() => {});
    }
    throw error;
  }
}

async function content(db, env, column, id, preview, inboxCode = null) {
  const expiry = column === "share_code" ? `AND ${activeShare}` : "";
  const scope = inboxCode ? `AND ${inboxContains("item.parent_id", "?2")}` : "";
  const item = await db.prepare(
    `SELECT name, mime, size, telegram_file_id FROM entries AS item
     WHERE ${column} = ?1 AND kind = 'file' AND deleted_at IS NULL ${expiry} ${scope}`
  ).bind(...(inboxCode ? [id, inboxCode] : [id])).first();
  if (!item) throw new HttpError(404, "文件不存在或链接已失效");
  if (item.size > downloadLimit) throw new HttpError(413, "文件超过下载大小限制");
  const type = preview ? previewType(item) : undefined;
  const token = telegramToken(env);
  const file = await telegram(env, "getFile", new URLSearchParams({ file_id: item.telegram_file_id }));
  if (typeof file.file_path !== "string" || !/^[\w./-]+$/.test(file.file_path) || file.file_path.split("/").includes("..")) {
    throw new HttpError(502, "无法读取文件，请稍后重试");
  }
  const upstream = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { redirect: "manual" })
    .catch(() => null);
  if (!upstream?.ok || !upstream.body) throw new HttpError(502, "下载失败，请稍后重试");
  const inlineType = imageTypes.has(type) ? type : null;
  const encodedName = encodeURIComponent(item.name.toWellFormed()).replace(/['()*]/g, (character) =>
    "%" + character.charCodeAt(0).toString(16).toUpperCase());
  return new Response(upstream.body, {
    headers: {
      "Content-Type": inlineType || "application/octet-stream",
      "X-File-Mime": imageTypes.has(item.mime) ? item.mime : "application/octet-stream",
      "Content-Disposition": `${inlineType ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
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
    const duration = body.duration;
    if (duration != null && !shareDurations.has(duration)) throw new HttpError(400, "无效的链接有效期");
    const expires = duration ? new Date(Date.now() + duration * 1000).toISOString() : null;
    const item = await db.prepare(`UPDATE entries
      SET share_code = CASE WHEN ?1 THEN coalesce(share_code, ?2) ELSE NULL END,
          share_expires_at = CASE WHEN NOT ?1 THEN NULL WHEN ?3 THEN ?4 ELSE share_expires_at END
      WHERE id = ?5 AND deleted_at IS NULL RETURNING share_code, share_expires_at`)
      .bind(Number(body.share), newShareCode(), Number(duration !== undefined), expires, id).first();
    if (!item) throw new HttpError(404, "项目不存在");
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
    UPDATE entries SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), share_code = NULL, share_expires_at = NULL
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

async function publicFolder(request, db, env, url, code, root) {
  const id = url.searchParams.get("folder") || root.id;
  const folder = id === root.id ? root : await db.prepare(`SELECT id, name, parent_id FROM entries
    WHERE id = ?1 AND ${inboxContains("?1", "?2")}`).bind(id, code).first();
  if (!folder) throw new HttpError(404, "文件夹不存在或已移出公开范围");
  if (request.method === "POST") {
    if (url.searchParams.get("action") === "mkdir") {
      const body = await bodyJson(request);
      return createEntry(db, { parent: id, kind: "folder", name: validName(body?.name), inboxCode: code });
    }
    return upload(request, db, env, url, { id, code });
  }

  const offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get("offset"), 10) || 0));
  const { results } = await db.prepare(`SELECT id, kind, name, mime, size, created_at FROM entries
    WHERE parent_id = ?1 AND deleted_at IS NULL AND ${inboxContains("?1", "?2")}
    ORDER BY kind DESC, name COLLATE NOCASE, id LIMIT 51 OFFSET ?3`).bind(id, code, offset).all();
  const { maxUploadMiB } = await getConfig(env);
  const { results: folders } = await db.prepare(`WITH RECURSIVE tree(id, parent_id, name) AS (
    SELECT id, NULL, name FROM entries WHERE id = ?1 AND share_code = ?2 AND deleted_at IS NULL AND ${activeShare}
    UNION
    SELECT e.id, e.parent_id, e.name FROM entries e JOIN tree ON e.parent_id = tree.id
    WHERE e.kind = 'folder' AND e.deleted_at IS NULL AND e.id <> ?1
  ) SELECT id, parent_id, name FROM tree ORDER BY name COLLATE NOCASE, id`).bind(root.id, code).all();
  return json({ name: folder.name, parent: folder.parent_id ?? null, root: id === root.id,
    entries: results.slice(0, 50), folders, rootId: root.id, hasMore: results.length > 50, maxUploadMiB });
}

async function activeShortShare(db, code) {
  const item = await db.prepare(`SELECT id, kind, name, mime FROM entries
    WHERE share_code = ? AND deleted_at IS NULL AND ${activeShare}`).bind(code).first();
  if (!item) throw new HttpError(404, "分享链接已失效");
  return item;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;
  if (pathname === "/api/config" && method === "GET") return json(await getConfig(env));
  if (pathname === "/api/health" && method === "GET") return json({ status: "ok" });
  const shortShare = pathname.match(/^\/s\/([a-zA-Z0-9_-]{12})$/);
  if (shortShare && method === "GET") {
    const db = await database(env);
    const item = await activeShortShare(db, shortShare[1]);
    const file = url.searchParams.get("file");
    if (item.kind === "folder") {
      if (!file) return sharePage(env, url, "/inbox");
      if (!/^[a-f0-9-]{36}$/.test(file)) throw new HttpError(404, "文件不存在");
      const entry = await db.prepare(`SELECT name, mime FROM entries AS item
        WHERE id = ?1 AND kind = 'file' AND deleted_at IS NULL AND ${inboxContains("item.parent_id", "?2")}`)
        .bind(file, shortShare[1]).first();
      if (!entry) throw new HttpError(404, "文件不存在");
      if (previewType(entry)) return sharePage(env, url, "/html-preview");
      return content(db, env, "id", file, false, shortShare[1]);
    }
    if (file) throw new HttpError(404, "文件不存在");
    const type = previewType(item);
    if (type && !imageTypes.has(type)) return sharePage(env, url, "/html-preview");
    return content(db, env, "share_code", shortShare[1], true);
  }
  const sharedFile = pathname.match(/^\/api\/share\/([a-zA-Z0-9_-]{12})\/download$/);
  if (sharedFile && method === "GET") {
    return content(await database(env), env, "share_code", sharedFile[1], false);
  }
  const inboxFile = pathname.match(/^\/api\/inbox\/([a-zA-Z0-9_-]{12})\/([a-f0-9-]{36})\/download$/);
  if (inboxFile && method === "GET") {
    const db = await database(env);
    const item = await activeShortShare(db, inboxFile[1]);
    if (item.kind !== "folder") throw new HttpError(404, "分享链接已失效");
    return content(db, env, "id", inboxFile[2], false, inboxFile[1]);
  }
  const inbox = pathname.match(/^\/api\/inbox\/([a-zA-Z0-9_-]{12})$/);
  if (inbox && (method === "GET" || method === "POST")) {
    const db = await database(env);
    const item = await activeShortShare(db, inbox[1]);
    if (item.kind !== "folder") throw new HttpError(404, "分享链接已失效");
    return publicFolder(request, db, env, url, inbox[1], item);
  }
  if (pathname.startsWith("/f/") || pathname.startsWith("/api/inbox/")) {
    throw new HttpError(404, "分享链接已失效，请索取新的短链接");
  }
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
  if (pathname === "/api/links" && method === "GET") {
    const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset"), 10) || 0);
    const { results } = await db.prepare(`SELECT id, parent_id, name, kind, mime, share_code, share_expires_at
      FROM entries WHERE share_code IS NOT NULL AND deleted_at IS NULL
      ORDER BY name COLLATE NOCASE, id LIMIT 51 OFFSET ?`).bind(offset).all();
    return json({ links: results.slice(0, 50), hasMore: results.length > 50 });
  }
  if (pathname === "/api/entries" && method === "GET") return list(db, url);
  if (pathname === "/api/folders" && method === "GET") {
    const { results } = await db.prepare(`SELECT id, parent_id, name,
      share_code, share_expires_at FROM entries
      WHERE kind = 'folder' AND deleted_at IS NULL ORDER BY name COLLATE NOCASE, id`).all();
    return json({ folders: results });
  }
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
