const $ = (id) => document.getElementById(id);
const MiB = 1024 * 1024;
const pageSize = 50;
const entryDateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
let token = sessionStorage.getItem("cloud-drive-token") ?? "";
let config = { title: "云盘", description: "", maxUploadMiB: 20 };
let folders = [];
let page = 0;
let query = "";
let tag = "";
let listing = 0;
let uploading = false;
let previewUrl;
let draggedItem;
let uploadTarget;
const entryDragType = "application/x-cloud-drive-entry";

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

async function goRoot() {
  folders = [];
  resetFilters();
  await refresh();
}

function currentFolder() {
  return folders.at(-1)?.id ?? "";
}

function itemPath(item) {
  return "/api/entries/" + item.id;
}

function moveTarget(element, parent, label) {
  const canDrop = (event) => draggedItem && event.dataTransfer.types.includes(entryDragType) &&
    draggedItem.id !== parent && draggedItem.parent_id !== parent;
  element.addEventListener("dragover", (event) => {
    if (!canDrop(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    element.classList.add("move-target");
  });
  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove("move-target");
  });
  element.addEventListener("drop", action(async (event) => {
    if (!canDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove("move-target");
    const item = draggedItem;
    if (event.dataTransfer.getData(entryDragType) !== item.id) return;
    await api(itemPath(item), { method: "PATCH", json: { parent } });
    notice("已将「" + item.name + "」移到「" + label + "」");
    await refresh();
  }));
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
  li.draggable = true;
  li.addEventListener("dragstart", (event) => {
    draggedItem = item;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(entryDragType, item.id);
    li.classList.add("drag-source");
  });
  li.addEventListener("dragend", () => {
    draggedItem = undefined;
    li.classList.remove("drag-source");
    document.querySelectorAll(".move-target").forEach((target) => target.classList.remove("move-target"));
  });
  if (folder) {
    li.dataset.uploadParent = item.id;
    moveTarget(li, item.id, item.name);
  }
  const tile = document.createElement("span");
  tile.className = "file-tile" + (folder ? " folder-tile" : "");
  tile.setAttribute("aria-hidden", "true");
  const icon = document.createElement("span");
  icon.className = "icon " + (folder ? "icon-folder" : "icon-file");
  tile.append(icon);
  const name = document.createElement("div");
  name.className = "entry-name";
  const open = button(item.name, async () => {
    if (!folder) return image ? preview(item) : download(item);
    folders = query || tag ? [item] : [...folders, item];
    resetFilters();
    await refresh();
  });
  open.className = "entry-title";
  name.append(open);
  const meta = document.createElement("div");
  meta.className = "entry-meta";
  if (!folder) {
    const size = document.createElement("small");
    size.textContent = item.size >= MiB ? (item.size / MiB).toFixed(1) + " MiB" : Math.ceil(item.size / 1024) + " KiB";
    meta.append(size);
  }
  if (item.created_at) {
    const date = document.createElement("time");
    date.dateTime = item.created_at;
    date.textContent = entryDateFormat.format(new Date(item.created_at));
    meta.append(date);
  }
  for (const label of item.tags) {
    const chip = document.createElement("small");
    chip.textContent = label;
    chip.className = "tag";
    meta.append(chip);
  }
  if (meta.childElementCount) name.append(meta);
  const actions = document.createElement("div");
  actions.className = "row actions";
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "•••";
  summary.setAttribute("aria-label", "更多操作");
  const menu = document.createElement("div");
  menu.className = "action-panel";
  details.append(summary, menu);
  if (!folder) {
    actions.append(button("下载", () => download(item)));
    menu.append(button(item.share_token ? "复制链接" : "分享", () => share(item)));
    if (item.share_token) menu.append(button("撤销链接", () => update(item, { share: false })));
  }
  menu.append(
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
  menu.lastElementChild.className = "danger";
  menu.addEventListener("click", () => { details.open = false; });
  actions.append(details);
  li.append(tile, name, actions);
  return li;
}

async function refresh() {
  const sequence = ++listing;
  const params = new URLSearchParams({
    parent: currentFolder(), q: query, tag, sort: $("sort").value, offset: page * pageSize
  });
  const result = await api("/api/entries?" + params);
  if (sequence !== listing) return;
  if (!result.entries.length && page > 0) {
    page -= 1;
    return refresh();
  }
  const crumbs = $("breadcrumbs");
  const root = button("根目录", goRoot);
  moveTarget(root, null, "根目录");
  crumbs.replaceChildren(root);
  for (const [index, folder] of folders.entries()) {
    const crumb = button(folder.name, async () => {
      folders = folders.slice(0, index + 1);
      resetFilters();
      await refresh();
    });
    moveTarget(crumb, folder.id, folder.name);
    crumbs.append(" / ", crumb);
  }
  if (query || tag) crumbs.append(" / 全局搜索");
  $("entries").replaceChildren(...result.entries.map(renderItem));
  $("empty").hidden = result.entries.length > 0;
  $("empty-message").textContent = query || tag ? "没有符合条件的项目。" : "将文件拖到这里，或点击「上传文件」。";
  $("pagination").hidden = !page && !result.hasMore;
  $("previous").disabled = page === 0;
  $("next").disabled = !result.hasMore;
  $("page").textContent = "第 " + (page + 1) + " 页";
}

async function upload(files, parent = currentFolder()) {
  if (!token || !files.length) return;
  if (uploading) {
    notice("正在上传其他文件，请等待当前批次完成。");
    return;
  }
  uploading = true;
  $("choose-files").disabled = true;
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
$("go-root").addEventListener("click", action(goRoot));
moveTarget($("go-root"), null, "根目录");
document.addEventListener("click", (event) => {
  for (const menu of document.querySelectorAll(".actions details[open]")) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const menu of document.querySelectorAll(".actions details[open]")) {
    if (menu.contains(document.activeElement)) menu.querySelector("summary").focus();
    menu.open = false;
  }
});
$("search").addEventListener("submit", action(async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  query = form.get("q").trim();
  tag = form.get("tag").trim();
  page = 0;
  await refresh();
}));
$("sort").addEventListener("change", action(async () => {
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
function showUploadTarget(target) {
  if (uploadTarget === target) return;
  uploadTarget?.classList.remove("upload-target");
  uploadTarget = target;
  uploadTarget?.classList.add("upload-target");
}

function folderUnderPointer(event) {
  return event.target.closest("[data-upload-parent]");
}

$("manager").addEventListener("dragover", (event) => {
  if (draggedItem || !event.dataTransfer.types.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = uploading ? "none" : "copy";
  showUploadTarget(uploading ? undefined : folderUnderPointer(event) ?? $("drop-zone"));
});
$("manager").addEventListener("dragleave", (event) => {
  if (!$("manager").contains(event.relatedTarget)) showUploadTarget(undefined);
});
$("manager").addEventListener("drop", action(async (event) => {
  if (draggedItem || !event.dataTransfer.types.includes("Files")) return;
  event.preventDefault();
  showUploadTarget(undefined);
  const parent = folderUnderPointer(event)?.dataset.uploadParent ?? currentFolder();
  await upload(Array.from(event.dataTransfer.files), parent);
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
