import { isDocumentPreview, previewType } from "./media-types.js";
import { observeCovers } from "./media-covers.js";
import { fileIcon } from "./file-icons.js";
import { entryDateFormat, entryExtension, formatEntryKind, formatEntrySize } from "./entry-format.js";
import { bindViewSwitch } from "./view-switch.js";
import { pastedFiles, showUploadProgress, uploadFile } from "./uploads.js";

const $ = (id) => document.getElementById(id);
const MiB = 1024 * 1024;
const pageSize = 50;
let token = sessionStorage.getItem("cloud-drive-token") ?? "";
let config = { title: "云盘", description: "", maxUploadMiB: 20 };
let folders = [];
let folderIndex = new Map();
const expandedFolders = new Set();
let page = 0;
let query = "";
let tag = "";
let listing = 0;
let uploading = false;
let previewUrl;
let previewRequest;
let stopCovers;
let draggedItem;
let uploadTarget;
let shareItem;
let linksPage = 0;
let linksListing = 0;
const entryDragType = "application/x-cloud-drive-entry";
bindViewSwitch($("entry-view-switch"), "cloud-drive-entry-view", "list", (view) => {
  const grid = view === "grid";
  $("entries").classList.toggle("entries-grid", grid);
  $("entries-heading").hidden = grid;
});

function notice(message = "", error = false, item = null) {
  if ($("manager").hidden) {
    $("notice").textContent = message;
    $("notice").classList.toggle("error", error);
    return null;
  }
  const list = $("notices");
  const entry = item ?? document.createElement("li");
  entry.className = error ? "notice error" : "notice";
  entry.textContent = message;
  if (!item) {
    list.prepend(entry);
    if (list.childElementCount > 30) list.lastElementChild.remove();
    list.scrollTop = 0;
  }
  return entry;
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
  folderIndex.clear();
  expandedFolders.clear();
  page = 0;
  query = tag = "";
  $("search").reset();
  stopCovers?.();
  stopCovers = undefined;
  $("entries").replaceChildren();
  $("folder-tree").replaceChildren();
  $("notices").replaceChildren();
  $("links-list").replaceChildren();
  linksListing += 1;
  $("share-dialog").close();
  $("settings-dialog").close();
  $("preview-dialog").close();
  $("manager").hidden = $("account-actions").hidden = true;
  $("login").hidden = false;
}

async function loggedIn() {
  await api("/api/session");
  sessionStorage.setItem("cloud-drive-token", token);
  $("token").value = "";
  $("login").hidden = true;
  $("notice").textContent = "";
  $("manager").hidden = $("account-actions").hidden = false;
  await loadFolderTree();
  await refresh();
  await showLinksView();
}

function resetFilters() {
  query = tag = "";
  page = 0;
  $("search").reset();
}

async function goRoot() {
  if (location.hash === "#links") location.hash = "";
  folders = [];
  resetFilters();
  await refresh();
}

function currentFolder() {
  return folders.at(-1)?.id ?? "";
}

function folderPath(id) {
  const path = [];
  for (let folder = folderIndex.get(id); folder; folder = folderIndex.get(folder.parent_id)) {
    path.push(folder);
  }
  return path.reverse();
}

async function openFolder(folder) {
  if (location.hash === "#links") location.hash = "";
  const path = folderPath(folder.id);
  folders = path.length ? path : [folder];
  resetFilters();
  await refresh();
}

function setBranchExpanded(toggle, branch, id, expanded) {
  toggle.setAttribute("aria-expanded", String(expanded));
  branch.hidden = !expanded;
  if (expanded) expandedFolders.add(id);
  else expandedFolders.delete(id);
}

async function loadFolderTree() {
  const { folders: items } = await api("/api/folders");
  if ($("manager").hidden) return;
  folderIndex = new Map(items.map((folder) => [folder.id, folder]));
  folders = folderPath(currentFolder());
  const children = new Map();
  for (const folder of items) {
    if (!children.has(folder.parent_id)) children.set(folder.parent_id, []);
    children.get(folder.parent_id).push(folder);
  }
  function renderBranch(parent) {
    return (children.get(parent) ?? []).map((folder) => {
      const item = document.createElement("li");
      const row = document.createElement("div");
      row.className = "tree-row";
      row.dataset.uploadParent = folder.id;
      const open = button("", () => openFolder(folder));
      open.className = "tree-folder";
      open.dataset.folderId = folder.id;
      const name = document.createElement("span");
      name.className = "tree-folder-name";
      name.textContent = folder.name;
      open.append(name, sharingBadge(folder));
      moveTarget(row, folder.id, folder.name);
      item.append(row);
      if (children.has(folder.id)) {
        const branch = document.createElement("ul");
        branch.className = "folder-tree";
        branch.append(...renderBranch(folder.id));
        const toggle = button("▸", () => setBranchExpanded(toggle, branch, folder.id, branch.hidden));
        toggle.className = "tree-toggle";
        toggle.setAttribute("aria-label", folder.name + "的子目录");
        setBranchExpanded(toggle, branch, folder.id, expandedFolders.has(folder.id));
        row.append(toggle);
        item.append(branch);
      }
      row.append(open);
      return item;
    });
  }
  $("folder-tree").replaceChildren(...renderBranch(null));
}

function selectTreeFolder() {
  const active = currentFolder();
  if (active) $("go-root").removeAttribute("aria-current");
  else $("go-root").setAttribute("aria-current", "location");
  const openParents = new Set(folders.slice(0, -1).map(({ id }) => id));
  for (const entry of $("folder-tree").querySelectorAll(".tree-folder")) {
    if (entry.dataset.folderId === active) entry.setAttribute("aria-current", "location");
    else entry.removeAttribute("aria-current");
    const row = entry.parentElement;
    const toggle = row.querySelector(".tree-toggle");
    if (toggle && openParents.has(entry.dataset.folderId)) {
      setBranchExpanded(toggle, row.nextElementSibling, entry.dataset.folderId, true);
    }
  }
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
    if (item.kind === "folder") await loadFolderTree();
    notice("已将「" + item.name + "」移到「" + label + "」");
    await refresh();
  }));
}

async function update(item, data) {
  const result = await api(itemPath(item), { method: "PATCH", json: data });
  if (item.kind === "folder" && (data.name !== undefined || data.share !== undefined)) await loadFolderTree();
  await refresh();
  return result;
}

function renameInline(item, title) {
  if (title.hidden) return;
  const row = title.closest("li");
  const dot = item.name.lastIndexOf(".");
  const suffix = item.kind === "file" && dot > 0 && dot < item.name.length - 1 ? item.name.slice(dot) : "";
  const editor = document.createElement("div");
  editor.className = "rename-editor";
  const input = document.createElement("input");
  input.type = "text";
  input.value = suffix ? item.name.slice(0, -suffix.length) : item.name;
  input.maxLength = 180 - suffix.length;
  input.setAttribute("aria-label", "新名称");
  editor.append(input);
  if (suffix) {
    const extension = document.createElement("span");
    extension.className = "rename-suffix";
    extension.textContent = suffix;
    editor.append(extension);
  }

  function close(restoreFocus = false) {
    input.removeEventListener("blur", save);
    editor.remove();
    title.hidden = false;
    row.draggable = true;
    if (restoreFocus) title.focus();
  }

  const save = action(async () => {
    if (input.readOnly || !editor.isConnected) return;
    const base = input.value.trim();
    if (!base || base + suffix === item.name) {
      close(document.activeElement === input);
      return;
    }
    input.readOnly = true;
    try {
      await update(item, { name: base + suffix });
      close();
    } finally {
      input.readOnly = false;
    }
  });
  input.addEventListener("blur", save);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || input.readOnly) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  });
  title.hidden = true;
  title.after(editor);
  row.draggable = false;
  input.focus();
  input.select();
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

function openDocument(item, type) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("浏览器拦截了新标签页，请允许弹出窗口后重试。");
  tab.opener = null;
  if (item.share_code && !shareExpired(item)) {
    tab.location.replace(shareAddress(item));
    return;
  }
  const sharedFolder = folderPath(item.parent_id).findLast((folder) => folder.share_code && !shareExpired(folder));
  if (sharedFolder) {
    const url = new URL(shareAddress(sharedFolder));
    url.searchParams.set("file", item.id);
    tab.location.replace(url);
    return;
  }
  tab.sessionStorage.setItem("cloud-drive-token", token);
  const url = new URL("/html-preview", location.origin);
  url.searchParams.set("id", item.id);
  if (type === "application/pdf") url.searchParams.set("type", "pdf");
  tab.location.replace(url);
}

function clearPreview() {
  previewRequest?.abort();
  previewRequest = undefined;
  const content = $("preview-content");
  const media = content.querySelector("audio, video");
  if (media) {
    media.pause();
    media.removeAttribute("src");
    media.load();
  }
  content.replaceChildren();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
}

async function preview(item, type) {
  clearPreview();
  const request = new AbortController();
  previewRequest = request;
  const dialog = $("preview-dialog");
  const status = $("preview-status");
  const kind = type.split("/")[0];
  const element = document.createElement(kind === "image" ? "img" : kind);
  if (kind === "image") {
    element.alt = item.name;
  } else {
    element.controls = true;
    element.preload = "metadata";
    if (kind === "video") element.playsInline = true;
  }
  element.hidden = true;
  element.addEventListener(kind === "image" ? "load" : "loadedmetadata", () => {
    if (previewRequest !== request) return;
    element.hidden = false;
    status.textContent = "";
  });
  element.addEventListener("error", () => {
    if (previewRequest !== request) return;
    element.hidden = true;
    status.textContent = "浏览器无法预览这个文件，请下载后打开。";
  });

  $("preview-name").textContent = item.name;
  status.textContent = "正在加载预览…";
  if (!dialog.open) dialog.showModal();
  try {
    const path = kind === "image" ? "/preview" : "/download";
    const blob = await api(itemPath(item) + path, { signal: request.signal }, "blob");
    if (request.signal.aborted || !dialog.open) return;
    previewUrl = URL.createObjectURL(blob.slice(0, blob.size, type));
    $("preview-content").append(element);
    element.src = previewUrl;
  } catch (error) {
    if (error.name === "AbortError") return;
    if (!request.signal.aborted && dialog.open) status.textContent = error.message;
    if (!token) notice(error.message, true);
  }
}

function shareExpired(item) {
  return !!item.share_expires_at && Date.parse(item.share_expires_at) <= Date.now();
}

function sharingBadge(item) {
  const hasLink = Boolean(item.share_code);
  const directlyShared = hasLink && !shareExpired(item);
  const inherited = !directlyShared && folderPath(item.parent_id).some(
    (folder) => folder.share_code && !shareExpired(folder)
  );
  const badge = document.createElement("small");
  badge.className = "sharing-badge";
  if (directlyShared || inherited) {
    badge.classList.add("is-shared");
    badge.textContent = inherited ? "随目录公开" : item.kind === "file" ? "已分享" : "公开";
  } else if (hasLink) {
    badge.classList.add("is-expired");
    badge.textContent = "已过期";
  } else {
    badge.textContent = "未分享";
  }
  return badge;
}

function shareStatus(item) {
  if (!item.share_expires_at) return "永久有效";
  return (shareExpired(item) ? "已过期 · " : "到期时间 · ") + entryDateFormat.format(new Date(item.share_expires_at));
}

function shareAddress(item) {
  return location.origin + "/s/" + item.share_code;
}

async function copyShare(item) {
  if (shareExpired(item)) return editShare(item);
  const link = shareAddress(item);
  try {
    await navigator.clipboard.writeText(link);
    notice("已复制公开链接");
  } catch {
    prompt("复制公开链接", link);
  }
}

function editShare(item) {
  shareItem = item;
  const inbox = item.kind === "folder";
  $("share-title").textContent = inbox ? "公开文件夹 · " + item.name : "分享 · " + item.name;
  const access = inbox ? "持有链接的人可以浏览、下载及上传此文件夹及其子文件夹内的文件。" : "持有链接的人可以读取此文件。";
  $("share-description").textContent = item.share_code ? access + " " + shareStatus(item) : access;
  const duration = $("share-duration");
  duration.options[0].hidden = !item.share_code || shareExpired(item);
  duration.value = duration.options[0].hidden ? (inbox ? "604800" : "permanent") : "keep";
  $("share-dialog").showModal();
}

async function revokeShare(item) {
  if (!confirm("撤销「" + item.name + "」的公开链接？")) return;
  await update(item, { share: false });
  if (location.hash === "#links") await refreshLinks();
  notice("已撤销「" + item.name + "」的链接");
}

async function jumpToShareItem(item) {
  if (item.kind === "folder") return openFolder(item);
  folders = folderPath(item.parent_id);
  resetFilters();
  location.hash = "";
  await showLinksView();
  await refresh(item.id);
}

async function refreshLinks() {
  const sequence = ++linksListing;
  const { links, hasMore } = await api("/api/links?offset=" + linksPage * pageSize);
  if (sequence !== linksListing) return;
  if (!links.length && linksPage > 0) {
    linksPage -= 1;
    return refreshLinks();
  }
  $("links-list").replaceChildren(...links.map((item) => {
    const row = document.createElement("li");
    const text = document.createElement("div");
    const fullPath = "/" + [...folderPath(item.parent_id).map(({ name }) => name), item.name].join("/");
    const name = button(fullPath, () => jumpToShareItem(item));
    name.className = "link-file-path";
    name.title = "定位到 " + fullPath;
    const status = document.createElement("small");
    status.textContent = (item.kind === "folder" ? "公开文件夹 · " : "文件分享 · ") + shareStatus(item);
    text.append(name, status);
    const actions = document.createElement("div");
    actions.className = "row links-actions";
    if (!shareExpired(item)) {
      const open = document.createElement("a");
      open.href = shareAddress(item);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "打开分享";
      actions.append(open, button("复制链接", () => copyShare(item)));
    }
    actions.append(button("修改有效期", () => editShare(item)), button("撤销", () => revokeShare(item)));
    row.append(text, actions);
    return row;
  }));
  $("links-empty").hidden = links.length > 0;
  $("links-pagination").hidden = !linksPage && !hasMore;
  $("links-previous").disabled = linksPage === 0;
  $("links-next").disabled = !hasMore;
  $("links-page").textContent = "第 " + (linksPage + 1) + " 页";
}

async function showLinksView() {
  if ($("manager").hidden) return;
  const visible = location.hash === "#links";
  $("file-view").hidden = visible;
  $("links-view").hidden = !visible;
  if (visible) {
    linksPage = 0;
    await loadFolderTree();
    await refreshLinks();
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
  if (item.kind === "folder") await loadFolderTree();
  await refresh();
}

function renderItem(item) {
  const folder = item.kind === "folder";
  const type = previewType(item);
  const openPreview = isDocumentPreview(type)
    ? () => openDocument(item, type)
    : type ? () => preview(item, type) : null;
  const li = document.createElement("li");
  li.dataset.entryId = item.id;
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
  if (!folder && (type?.startsWith("image/") || type?.startsWith("video/"))) {
    tile.dataset.coverType = type;
    tile.dataset.coverSource = itemPath(item) + "/download";
  }
  if (folder) {
    const icon = document.createElement("span");
    icon.className = "icon icon-folder";
    tile.append(icon);
  } else {
    tile.append(fileIcon(item.name, type));
  }
  const name = document.createElement("div");
  name.className = "entry-name";
  const open = button(item.name, folder ? () => openFolder(item) : openPreview ?? (() => download(item)));
  open.className = "entry-title";
  open.title = item.name;
  const titleText = document.createElement("span");
  titleText.textContent = item.name;
  open.replaceChildren(titleText);
  const title = document.createElement("div");
  title.className = "entry-title-wrap";
  title.append(open);
  name.append(title);
  const meta = document.createElement("div");
  meta.className = "entry-meta";
  const badges = document.createElement("div");
  badges.className = "entry-badges";
  badges.append(sharingBadge(item));
  meta.append(badges);
  const kind = document.createElement("span");
  kind.className = "entry-kind";
  kind.textContent = formatEntryKind(item);
  meta.append(kind);
  if (!folder) {
    const size = document.createElement("small");
    size.className = "entry-size";
    size.textContent = formatEntrySize(item.size);
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
    badges.append(chip);
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
    const extension = entryExtension(item.name);
    if (extension) {
      const badge = document.createElement("span");
      badge.className = "entry-extension";
      badge.textContent = badge.title = "." + extension.toLowerCase();
      actions.append(badge);
    }
    actions.append(button("下载", () => download(item)));
    if (openPreview) menu.append(button("预览", openPreview));
  }
  if (item.share_code) {
    if (!shareExpired(item)) menu.append(button("复制链接", () => copyShare(item)));
    menu.append(button("修改有效期", () => editShare(item)), button("撤销链接", () => revokeShare(item)));
  } else {
    menu.append(button(folder ? "公开文件夹" : "分享", () => editShare(item)));
  }
  menu.append(
    button("重命名", () => renameInline(item, open)),
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
  if (folder || openPreview) {
    li.classList.add("entry-openable");
    li.addEventListener("click", (event) => {
      if (open.hidden || open.contains(event.target) || actions.contains(event.target)) return;
      open.click();
    });
  }
  return li;
}

async function refresh(focus = null) {
  const sequence = ++listing;
  const params = new URLSearchParams({
    parent: currentFolder(), q: query, tag, sort: $("sort").value, offset: page * pageSize
  });
  if (focus) params.set("focus", focus);
  const result = await api("/api/entries?" + params);
  if (sequence !== listing) return;
  if (focus) page = Math.floor(result.offset / pageSize);
  selectTreeFolder();
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
  const entries = $("entries");
  stopCovers?.();
  entries.replaceChildren(...result.entries.map(renderItem));
  stopCovers = observeCovers(entries, { Authorization: "Bearer " + token });
  if (focus) {
    const row = Array.from(entries.children).find((entry) => entry.dataset.entryId === focus);
    row?.classList.add("entry-located");
    row?.scrollIntoView({ block: "nearest" });
    row?.querySelector(".entry-title").focus({ preventScroll: true });
  }
  $("empty").hidden = result.entries.length > 0;
  $("empty-message").textContent = query || tag ? "没有符合条件的项目。" : "拖放或粘贴文件，或点击「上传文件」。";
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
  const progress = $("upload-progress");
  try {
    for (const [index, file] of files.entries()) {
      try {
        if (!file.size || file.size > config.maxUploadMiB * MiB) {
          throw new Error("文件必须大于 0 字节且不超过 " + config.maxUploadMiB + " MiB");
        }
        const params = new URLSearchParams({ parent, name: file.name });
        const updateProgress = showUploadProgress(progress, file, index, files.length);
        await uploadFile("/api/upload?" + params, file, { Authorization: "Bearer " + token }, updateProgress);
        completed += 1;
      } catch (error) {
        if (error.status === 401) loggedOut();
        failures.push(file.name + " · " + error.message);
        if (!token) throw error;
      }
    }
    if (token) await refresh();
    notice(["已上传 " + completed + "/" + files.length + " 个文件", ...failures].join("\n"), failures.length > 0);
  } finally {
    progress.hidden = true;
    uploading = false;
    $("choose-files").disabled = false;
  }
}

document.addEventListener("paste", action(async (event) => {
  if ($("manager").hidden || $("file-view").hidden || document.querySelector("dialog[open]")) return;
  const files = pastedFiles(event);
  if (!files.length) return;
  event.preventDefault();
  await upload(files);
}));

$("login").addEventListener("submit", action(async (event) => {
  event.preventDefault();
  token = $("token").value.trim();
  notice();
  await loggedIn();
}));
$("logout").addEventListener("click", () => { loggedOut(); notice(); });
$("manage-links").addEventListener("click", () => { location.hash = "links"; });
$("back-to-files").addEventListener("click", () => { location.hash = ""; });
window.addEventListener("hashchange", action(showLinksView));
$("links-previous").addEventListener("click", action(async () => { linksPage -= 1; await refreshLinks(); }));
$("links-next").addEventListener("click", action(async () => { linksPage += 1; await refreshLinks(); }));
$("share-form").addEventListener("submit", action(async (event) => {
  event.preventDefault();
  const item = shareItem;
  const value = $("share-duration").value;
  const changes = { share: true };
  if (value !== "keep") changes.duration = value === "permanent" ? null : Number(value);
  $("save-share").disabled = true;
  try {
    const link = await update(item, changes);
    $("share-dialog").close();
    if (location.hash === "#links") await refreshLinks();
    await copyShare({ ...item, ...link });
  } finally {
    $("save-share").disabled = false;
  }
}));
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
  await loadFolderTree();
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
  if (!$("preview-dialog").open) clearPreview();
});
api("/api/config").then(applyConfig).catch((error) => notice(error.message, true));
if (token) action(loggedIn)();
