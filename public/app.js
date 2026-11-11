const $ = (id) => document.getElementById(id);
const MiB = 1024 * 1024;
const pageSize = 50;
let token = sessionStorage.getItem("cloud-drive-token") ?? "";
let config = { title: "云盘", description: "", maxUploadMiB: 20 };
let folders = [];
let page = 0;
let query = "";
let tag = "";
let listing = 0;
let uploading = false;
let previewUrl;

function notice(message = "", error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
}

async function api(path, options = {}, responseType = "json") {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", "Bearer " + token);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const { error, code } = await response.json().catch(() => ({}));
    if (response.status === 401) loggedOut();
    throw Object.assign(new Error(error ?? "请求失败（" + response.status + "）"), { code });
  }
  if (response.status === 204) return;
  return responseType === "blob" ? response.blob() : response.json();
}

function action(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      notice(error.message, true);
    }
  };
}

function button(label, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", action(onClick));
  return element;
}

function applyConfig(value) {
  config = value;
  $("title").textContent = value.title;
  $("description").textContent = value.description;
  $("description").hidden = !value.description;
  document.title = value.title;
}

function loggedOut() {
  listing += 1;
  token = "";
  sessionStorage.removeItem("cloud-drive-token");
  folders = [];
  page = 0;
  query = tag = "";
  $("search").reset();
  $("entries").replaceChildren();
  $("settings-dialog").close();
  $("preview-dialog").close();
  $("manager").hidden = $("logout").hidden = true;
  $("login").hidden = false;
}

async function loggedIn() {
  await api("/api/session");
  sessionStorage.setItem("cloud-drive-token", token);
  $("token").value = "";
  $("login").hidden = true;
  $("manager").hidden = $("logout").hidden = false;
  await refresh();
}

function resetFilters() {
  query = tag = "";
  page = 0;
  $("search").reset();
}

function currentFolder() {
  return folders.at(-1)?.id ?? "";
}

function itemPath(item) {
  return "/api/entries/" + item.id;
}

async function update(item, data) {
  const result = await api(itemPath(item), { method: "PATCH", json: data });
  await refresh();
  return result;
}

async function download(item) {
  const blob = await api(itemPath(item) + "/download", {}, "blob");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = item.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function preview(item) {
  const blob = await api(itemPath(item) + "/preview", {}, "blob");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  $("preview-name").textContent = item.name;
  $("preview-image").src = previewUrl;
  $("preview-image").alt = item.name;
  if (!$("preview-dialog").open) $("preview-dialog").showModal();
}

async function share(item) {
  let shareToken = item.share_token;
  if (!shareToken) {
    if (!confirm("生成公开链接？任何持有链接的人都可以读取这个文件。")) return;
    ({ share_token: shareToken } = await update(item, { share: true }));
  }
  const suffix = item.mime?.startsWith("image/") ? "/preview" : "";
  const link = location.origin + "/f/" + shareToken + suffix;
  try {
    await navigator.clipboard.writeText(link);
    notice("已复制公开链接");
  } catch {
    prompt("复制公开链接", link);
  }
}

async function remove(item) {
  const path = itemPath(item);
  const options = { method: "DELETE" };
  let result;
  try {
    result = await api(path, options);
  } catch (error) {
    if (error.code !== "LEGACY_DESTINATION") throw error;
    const same = confirm("部分旧文件未记录原始存储位置。只有这些文件确实存放在当前配置的位置时，才点击确定同步删除。");
    if (!same && !confirm("从云盘移除这些旧文件，保留它们的原始消息？")) return;
    result = await api(path + "?legacy=" + (same ? "current" : "skip"), options);
  }
  const { removed, originalConfirmed, originalUnconfirmed } = result;
  let message = "已从云盘移除 " + removed + " 项";
  if (originalConfirmed) message += "，已确认清除 " + originalConfirmed + " 条原始消息";
  if (originalUnconfirmed) message += "，" + originalUnconfirmed + " 条原始消息未确认删除，请到原位置检查";
  notice(message, originalUnconfirmed > 0);
  await refresh();
}

function renderItem(item) {
  const folder = item.kind === "folder";
  const image = item.mime?.startsWith("image/");
  const li = document.createElement("li");
  const name = document.createElement("div");
  name.className = "entry-name";
  name.append(button((folder ? "▸ " : "") + item.name, async () => {
    if (!folder) return image ? preview(item) : download(item);
    folders = query || tag ? [item] : [...folders, item];
    resetFilters();
    await refresh();
  }));
  if (!folder) {
    const size = document.createElement("small");
    size.textContent = item.size >= MiB ? (item.size / MiB).toFixed(1) + " MiB" : Math.ceil(item.size / 1024) + " KiB";
    name.append(size);
  }
  for (const label of item.tags) {
    const chip = document.createElement("small");
    chip.textContent = label;
    name.append(chip);
  }
  const actions = document.createElement("div");
  actions.className = "row actions";
  if (!folder) {
    actions.append(button("下载", () => download(item)), button(item.share_token ? "复制链接" : "分享", () => share(item)));
    if (item.share_token) actions.append(button("撤销链接", () => update(item, { share: false })));
  }
  actions.append(
    button("重命名", async () => {
      const value = prompt("新名称", item.name);
      if (value !== null && value.trim() !== item.name) await update(item, { name: value });
    }),
    button("标签", async () => {
      const value = prompt("用逗号分隔标签", item.tags.join(", "));
      if (value !== null) await update(item, { tags: value.split(/[,，]/).map((part) => part.trim()).filter(Boolean) });
    }),
    button("删除", async () => {
      const message = folder
        ? "删除此目录及所有子项目，并尝试同步删除原始消息？"
        : "删除此文件、撤销分享链接，并尝试同步删除原始消息？";
      if (!confirm(message)) return;
      await remove(item);
    })
  );
  li.append(name, actions);
  return li;
}

async function refresh() {
  const sequence = ++listing;
  const params = new URLSearchParams({ parent: currentFolder(), q: query, tag, offset: page * pageSize });
  const result = await api("/api/entries?" + params);
  if (sequence !== listing) return;
  if (!result.entries.length && page > 0) {
    page -= 1;
    return refresh();
  }
  const crumbs = $("breadcrumbs");
  crumbs.replaceChildren(button("根目录", async () => {
    folders = [];
    resetFilters();
    await refresh();
  }));
  for (const [index, folder] of folders.entries()) {
    crumbs.append(" / ", button(folder.name, async () => {
      folders = folders.slice(0, index + 1);
      resetFilters();
      await refresh();
    }));
  }
  if (query || tag) crumbs.append(" / 全局搜索");
  $("entries").replaceChildren(...result.entries.map(renderItem));
  $("empty").hidden = result.entries.length > 0;
  $("empty").textContent = query || tag ? "没有符合条件的项目。" : "这里还没有文件。可点击上传，或将文件拖到这里。";
  $("pagination").hidden = !page && !result.hasMore;
  $("previous").disabled = page === 0;
  $("next").disabled = !result.hasMore;
  $("page").textContent = "第 " + (page + 1) + " 页";
}

async function upload(files) {
  if (!token || !files.length || uploading) return;
  uploading = true;
  $("choose-files").disabled = true;
  const parent = currentFolder();
  const failures = [];
  let completed = 0;
  try {
    for (const [index, file] of files.entries()) {
      notice("正在上传 " + (index + 1) + "/" + files.length + " · " + file.name);
      try {
        if (!file.size || file.size > config.maxUploadMiB * MiB) {
          throw new Error("文件必须大于 0 字节且不超过 " + config.maxUploadMiB + " MiB");
        }
        const params = new URLSearchParams({ parent, name: file.name });
        await api("/api/upload?" + params, { method: "POST", body: file });
        completed += 1;
      } catch (error) {
        failures.push(file.name + " · " + error.message);
        if (!token) break;
      }
    }
    if (token) await refresh();
    notice(["已上传 " + completed + "/" + files.length + " 个文件", ...failures].join("\n"), failures.length > 0);
  } finally {
    uploading = false;
    $("choose-files").disabled = false;
  }
}

$("login").addEventListener("submit", action(async (event) => {
  event.preventDefault();
  token = $("token").value.trim();
  notice();
  await loggedIn();
}));
$("logout").addEventListener("click", () => { loggedOut(); notice(); });
$("search").addEventListener("submit", action(async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  query = form.get("q").trim();
  tag = form.get("tag").trim();
  page = 0;
  await refresh();
}));
$("new-folder").addEventListener("click", action(async () => {
  const name = prompt("目录名称");
  if (name === null) return;
  await api("/api/folders", { method: "POST", json: { name, parent: currentFolder() || null } });
  resetFilters();
  await refresh();
}));
$("previous").addEventListener("click", action(async () => { page -= 1; await refresh(); }));
$("next").addEventListener("click", action(async () => { page += 1; await refresh(); }));
$("choose-files").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", action(async (event) => {
  const files = Array.from(event.target.files);
  event.target.value = "";
  await upload(files);
}));
$("drop-zone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("drop-zone").classList.add("drag");
});
$("drop-zone").addEventListener("dragleave", (event) => {
  if (!$("drop-zone").contains(event.relatedTarget)) $("drop-zone").classList.remove("drag");
});
$("drop-zone").addEventListener("drop", action(async (event) => {
  event.preventDefault();
  $("drop-zone").classList.remove("drag");
  await upload(Array.from(event.dataTransfer.files));
}));
$("settings").addEventListener("click", () => {
  const form = $("settings-form");
  for (const [name, value] of Object.entries(config)) form.elements.namedItem(name).value = value;
  $("settings-dialog").showModal();
});
$("settings-form").addEventListener("submit", action(async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const settings = Object.fromEntries(form);
  settings.maxUploadMiB = Number(settings.maxUploadMiB);
  applyConfig(await api("/api/config", { method: "PUT", json: settings }));
  $("settings-dialog").close();
  notice("设置已保存。其他地区可能稍后更新。");
}));
for (const close of document.querySelectorAll("[data-close]")) {
  close.addEventListener("click", () => close.closest("dialog").close());
}
$("preview-dialog").addEventListener("close", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  $("preview-image").removeAttribute("src");
});
api("/api/config").then(applyConfig).catch((error) => notice(error.message, true));
if (token) action(loggedIn)();
