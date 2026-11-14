import { createMediaPreview } from "./media-preview.js";
import { isDocumentPreview, previewType } from "./media-types.js";
import { observeCovers } from "./media-covers.js";
import { fileIcon } from "./file-icons.js";
import { language, localizeDrive, translate } from "./drive-i18n.js";
import { entryDateFormat, entryExtension, formatEntryKind, formatEntrySize } from "./entry-format.js";
import { bindViewSwitch } from "./view-switch.js";
import { droppedItems, pastedFiles, selectedDirectoryItems, showUploadProgress, uploadDirectories, uploadFile } from "./uploads.js";

const $ = (id) => document.getElementById(id);
localizeDrive();
const MiB = 1024 * 1024;
const pageSize = 50;
let token = sessionStorage.getItem("cloud-drive-token") ?? "";
let config = { title: "云盘", description: "", maxUploadMiB: 20 };
let folders = [];
let folderIndex = new Map();
const expandedFolders = new Set();
let visibleEntries = [];
let batchBusy = false;
let page = 0;
let query = "";
let tag = "";
let fileType = "";
let listing = 0;
let uploading = false;

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
    throw Object.assign(new Error(language === "zh" && error ? error : translate("请求失败，请稍后重试。")), { code });
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
  const title = value.title === "云盘" ? translate("云盘") : value.title;
  $("title").textContent = title;
  $("description").textContent = value.description;
  $("description").hidden = !value.description;
  document.title = title;
}

function loggedOut() {
  listing += 1;
  token = "";
  sessionStorage.removeItem("cloud-drive-token");
  folders = [];
  folderIndex.clear();
  expandedFolders.clear();
  setBranchExpanded($("root-toggle"), $("folder-tree"), "", true);
  page = 0;
  query = tag = fileType = "";
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
  query = tag = fileType = "";
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
  setBranchExpanded($("root-toggle"), $("folder-tree"), "", true);
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
      open.title = folder.name;
      open.dataset.folderId = folder.id;
      const name = document.createElement("span");
      name.className = "tree-folder-name";
      name.textContent = folder.name;
      const icon = document.createElement("span");
      icon.className = "icon icon-folder";
      icon.setAttribute("aria-hidden", "true");
      const badge = sharingBadge(folder);
      badge.title = badge.textContent;
      open.append(icon, name, badge);
      moveTarget(row, folder.id, folder.name);
      item.append(row);
      if (children.has(folder.id)) {
        const branch = document.createElement("ul");
        branch.className = "folder-tree";
        branch.append(...renderBranch(folder.id));
        const toggle = button("", () => setBranchExpanded(toggle, branch, folder.id, branch.hidden));
        toggle.className = "tree-toggle";
        toggle.setAttribute("aria-label", translate("{name}的子目录", { name: folder.name }));
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
    notice(translate("已将「{name}」移到「{folder}」", { name: item.name, folder: label }));
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
  input.setAttribute("aria-label", translate("新名称"));
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
  if (!tab) throw new Error(translate("浏览器拦截了新标签页，请允许弹出窗口后重试。"));
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

const preview = createMediaPreview($("preview-dialog"), (item, type, signal) =>
  api(itemPath(item) + (type.startsWith("image/") ? "/preview" : "/download"), { signal }, "blob"), download, translate);

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
    if (inherited) badge.classList.add("is-inherited");
    badge.textContent = inherited ? translate("随目录公开") : item.kind === "file" ? translate("已分享") : translate("公开");
  } else if (hasLink) {
    badge.classList.add("is-expired");
    badge.textContent = translate("已过期");
  } else {
    badge.textContent = translate("未分享");
  }
  return badge;
}

function shareStatus(item) {
  if (!item.share_expires_at) return translate("永久有效");
  return translate(shareExpired(item) ? "已过期" : "到期时间") + " · " + entryDateFormat.format(new Date(item.share_expires_at));
}

function shareAddress(item) {
  return location.origin + "/s/" + item.share_code;
}

async function copyShare(item) {
  if (shareExpired(item)) return editShare(item);
  const link = shareAddress(item);
  try {
    await navigator.clipboard.writeText(link);
    notice(translate("已复制公开链接"));
  } catch {
    prompt(translate("复制公开链接"), link);
  }
}

function editShare(item) {
  shareItem = item;
  const inbox = item.kind === "folder";
  $("share-title").textContent = translate(inbox ? "公开文件夹" : "分享") + " · " + item.name;
  const access = inbox ? translate("持有链接的人可以浏览、下载及上传此文件夹及其子文件夹内的文件。") : translate("持有链接的人可以读取此文件。");
  $("share-description").textContent = item.share_code ? access + " " + shareStatus(item) : access;
  const duration = $("share-duration");
  duration.options[0].hidden = !item.share_code || shareExpired(item);
  duration.value = duration.options[0].hidden ? (inbox ? "604800" : "permanent") : "keep";
  $("share-dialog").showModal();
}

async function revokeShare(item) {
  if (!confirm(translate("撤销「{name}」的公开链接？", { name: item.name }))) return;
  await update(item, { share: false });
  if (location.hash === "#links") await refreshLinks();
  notice(translate("已撤销「{name}」的链接", { name: item.name }));
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
    name.title = translate("定位到 {path}", { path: fullPath });
    const status = document.createElement("small");
    status.textContent = translate(item.kind === "folder" ? "公开文件夹" : "文件分享") + " · " + shareStatus(item);
    text.append(name, status);
    const actions = document.createElement("div");
    actions.className = "row links-actions";
    if (!shareExpired(item)) {
      const open = document.createElement("a");
      open.href = shareAddress(item);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = translate("打开分享");
      actions.append(open, button(translate("复制链接"), () => copyShare(item)));
    }
    actions.append(button(translate("修改有效期"), () => editShare(item)), button(translate("撤销"), () => revokeShare(item)));
    row.append(text, actions);
    return row;
  }));
  $("links-empty").hidden = links.length > 0;
  $("links-pagination").hidden = !linksPage && !hasMore;
  $("links-previous").disabled = linksPage === 0;
  $("links-next").disabled = !hasMore;
  $("links-page").textContent = translate("第 {page} 页", { page: linksPage + 1 });
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

async function remove(item, refreshAfter = true) {
  const path = itemPath(item);
  const options = { method: "DELETE" };
  let result;
  try {
    result = await api(path, options);
  } catch (error) {
    if (error.code !== "LEGACY_DESTINATION") throw error;
    const same = confirm(translate("部分旧文件未记录原始存储位置。只有这些文件确实存放在当前配置的位置时，才点击确定同步删除。"));
    if (!same && !confirm(translate("从云盘移除这些旧文件，保留它们的原始消息？"))) return false;
    result = await api(path + "?legacy=" + (same ? "current" : "skip"), options);
  }
  const { removed, originalConfirmed, originalUnconfirmed } = result;
  let message = translate("已从云盘移除 {count} 项", { count: removed });
  if (originalConfirmed) message += translate("，已确认清除 {count} 条原始消息", { count: originalConfirmed });
  if (originalUnconfirmed) message += translate("，{count} 条原始消息未确认删除，请到原位置检查", { count: originalUnconfirmed });
  notice(message, originalUnconfirmed > 0);
  if (refreshAfter) {
    if (item.kind === "folder") await loadFolderTree();
    await refresh();
  }
  return true;
}

function batchChecks() {
  return [...$("entries").querySelectorAll(".batch-check")];
}

function updateBatchControls() {
  const checks = batchChecks();
  const count = checks.filter(check => check.checked).length;
  $("batch-count").textContent = translate("已选 {count} 项", { count });
  $("batch-all").checked = count > 0 && count === checks.length;
  $("batch-all").indeterminate = count > 0 && count < checks.length;
  $("batch-all").disabled = batchBusy || !checks.length;
  $("batch-toggle").disabled = batchBusy;
  $("batch-delete").disabled = $("batch-move").disabled = batchBusy || !count;
  for (const check of checks) check.disabled = batchBusy;
}

function batchItems() {
  const ids = new Set(batchChecks().filter(check => check.checked).map(check => check.value));
  return visibleEntries.filter(item => ids.has(item.id) &&
    !folderPath(item.parent_id).some(folder => ids.has(folder.id)));
}

async function runBatch(items, label, operation) {
  if (batchBusy || !items.length) return;
  const session = token;
  batchBusy = true;
  updateBatchControls();
  let completed = 0;
  const failures = [];
  try {
    for (const item of items) {
      if (!token || token !== session) break;
      try {
        if (await operation(item) !== false) completed += 1;
        else failures.push(item.name + " · " + translate("已跳过"));
      } catch (error) {
        failures.push(item.name + " · " + error.message);
      }
    }
    if (!token || token !== session) return;
    notice([translate(label, { done: completed, total: items.length }), ...failures].join("\n"), failures.length > 0);
    if (completed && items.some(item => item.kind === "folder")) await loadFolderTree();
    await refresh();
  } finally {
    batchBusy = false;
    updateBatchControls();
  }
}

function renderItem(item, entries) {
  const folder = item.kind === "folder";
  const type = previewType(item);
  const openPreview = isDocumentPreview(type)
    ? () => openDocument(item, type)
    : type ? () => preview(item, entries) : null;
  const li = document.createElement("li");
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "batch-check";
  check.value = item.id;
  check.setAttribute("aria-label", translate("选择 {name}", { name: item.name }));
  check.addEventListener("change", updateBatchControls);
  li.append(check);
  li.addEventListener("click", event => {
    if ($("batch-toolbar").hidden || event.target === check || event.target.closest(".actions, .rename-editor")) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    if (!batchBusy) check.click();
  }, { capture: true });
  li.dataset.entryId = item.id;
  li.draggable = true;
  li.addEventListener("dragstart", (event) => {
    if (!$("batch-toolbar").hidden) {
      event.preventDefault();
      return;
    }
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
  kind.textContent = translate(formatEntryKind(item));
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
  summary.setAttribute("aria-label", translate("更多操作"));
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
    actions.append(button(translate("下载"), () => download(item)));
    if (openPreview) menu.append(button(translate("预览"), openPreview));
  }
  if (item.share_code) {
    if (!shareExpired(item)) menu.append(button(translate("复制链接"), () => copyShare(item)));
    menu.append(button(translate("修改有效期"), () => editShare(item)), button(translate("撤销链接"), () => revokeShare(item)));
  } else {
    menu.append(button(folder ? translate("公开文件夹") : translate("分享"), () => editShare(item)));
  }
  menu.append(
    button(translate("重命名"), () => renameInline(item, open)),
    button(translate("标签"), async () => {
      const value = prompt(translate("用逗号分隔标签"), item.tags.join(", "));
      if (value !== null) await update(item, { tags: value.split(/[,，]/).map((part) => part.trim()).filter(Boolean) });
    }),
    button(translate("删除"), async () => {
      const message = folder
        ? translate("删除此目录及所有子项目，并尝试同步删除原始消息？")
        : translate("删除此文件、撤销分享链接，并尝试同步删除原始消息？");
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
      if (event.target === check || open.hidden || open.contains(event.target) || actions.contains(event.target)) return;
      open.click();
    });
  }
  return li;
}

async function refresh(focus = null) {
  const sequence = ++listing;
  const params = new URLSearchParams({
    parent: currentFolder(), q: query, tag, type: fileType, sort: $("sort").value, offset: page * pageSize
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
  const root = button(translate("根目录"), goRoot);
  moveTarget(root, null, translate("根目录"));
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
  if (query || tag) crumbs.append(" / " + translate("全局搜索"));
  const entries = $("entries");
  stopCovers?.();
  visibleEntries = result.entries;
  entries.replaceChildren(...visibleEntries.map(item => renderItem(item, visibleEntries)));
  updateBatchControls();
  stopCovers = observeCovers(entries, { Authorization: "Bearer " + token });
  if (focus) {
    const row = Array.from(entries.children).find((entry) => entry.dataset.entryId === focus);
    row?.classList.add("entry-located");
    row?.scrollIntoView({ block: "nearest" });
    row?.querySelector(".entry-title").focus({ preventScroll: true });
  }
  $("empty").hidden = result.entries.length > 0;
  $("empty-message").textContent = query || tag || fileType ? translate("没有符合条件的项目。") : translate("拖放或粘贴文件，或点击「上传文件」。");
  $("pagination").hidden = !page && !result.hasMore;
  $("previous").disabled = page === 0;
  $("next").disabled = !result.hasMore;
  $("page").textContent = translate("第 {page} 页", { page: page + 1 });
}

function upload(files) {
  if (files.length) return uploadItems(files.map(file => ({ file, path: [] })));
}

async function uploadItems(items, parent = currentFolder()) {
  if (!token) return;
  if (uploading) {
    notice(translate("正在上传其他文件，请等待当前批次完成。"));
    return;
  }
  uploading = true;
  $("choose-files").disabled = $("choose-directory").disabled = true;
  const failures = [];
  let completed = 0;
  let created = 0;
  let index = 0;
  const progress = $("upload-progress");
  const ensurePath = uploadDirectories(parent, async (name, target) => {
    const { id } = await api("/api/folders", { method: "POST", json: { name, parent: target || null } });
    created += 1;
    return id;
  });
  try {
    items = await items;
    if (!items.length) return;
    const total = items.filter(item => item.file).length;
    for (const { file, path } of items) {
      try {
        if (!file) {
          await ensurePath(path);
          continue;
        }
        const position = index++;
        if (!file.size || file.size > config.maxUploadMiB * MiB) {
          throw new Error(translate("文件必须大于 0 字节且不超过 {limit} MiB", { limit: config.maxUploadMiB }));
        }
        const target = await ensurePath(path);
        const params = new URLSearchParams({ parent: target, name: file.name });
        const updateProgress = showUploadProgress(progress, file, position, total, translate);
        await uploadFile("/api/upload?" + params, file, { Authorization: "Bearer " + token }, updateProgress, language === "zh" ? null : translate);
        completed += 1;
      } catch (error) {
        if (error.status === 401) loggedOut();
        failures.push([...path, ...(file ? [file.name] : [])].join("/") + " · " + error.message);
        if (!token) throw error;
      }
    }
    if (created) await loadFolderTree();
    if (completed || created) await refresh();
    const summary = [translate("已上传 {done}/{total} 个文件", { done: completed, total })];
    if (created) summary.push(translate("已创建 {count} 个文件夹", { count: created }));
    notice([...summary, ...failures].join("\n"), failures.length > 0);
  } finally {
    progress.hidden = true;
    uploading = false;
    $("choose-files").disabled = $("choose-directory").disabled = false;
  }
}

$("batch-toggle").addEventListener("click", () => {
  const enabled = $("batch-toolbar").hidden;
  $("batch-toolbar").hidden = !enabled;
  $("entries").classList.toggle("batch-mode", enabled);
  $("batch-toggle").setAttribute("aria-pressed", String(enabled));
  $("batch-toggle").textContent = enabled ? translate("退出批量") : translate("批量操作");
  for (const check of batchChecks()) check.checked = false;
  updateBatchControls();
});
$("batch-all").addEventListener("change", event => {
  for (const check of batchChecks()) check.checked = event.target.checked;
  updateBatchControls();
});
$("batch-delete").addEventListener("click", action(async () => {
  const items = batchItems();
  if (!items.length || !confirm(translate("删除选中的 {count} 项及其子项目，并尝试同步删除原始消息？", { count: items.length }))) return;
  await runBatch(items, "已删除 {done}/{total} 项", item => remove(item, false));
}));
$("batch-move").addEventListener("click", () => {
  const blocked = new Set(batchItems().filter(item => item.kind === "folder").map(item => item.id));
  const targets = [...folderIndex.values()].filter(folder => !folderPath(folder.id).some(item => blocked.has(item.id)));
  $("batch-destination").replaceChildren(new Option(translate("根目录"), ""), ...targets.map(folder =>
    new Option("/" + folderPath(folder.id).map(item => item.name).join("/"), folder.id)));
  $("batch-move-dialog").showModal();
});
$("batch-move-form").addEventListener("submit", action(async event => {
  event.preventDefault();
  const parent = $("batch-destination").value || null;
  $("batch-move-dialog").close();
  const items = batchItems().filter(item => (item.parent_id ?? null) !== parent);
  if (!items.length) return notice(translate("所选项目已在目标目录。"));
  await runBatch(items, "已移动 {done}/{total} 项", item => api(itemPath(item), { method: "PATCH", json: { parent } }));
}));

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
$("root-toggle").addEventListener("click", () => {
  const branch = $("folder-tree");
  setBranchExpanded($("root-toggle"), branch, "", branch.hidden);
});
moveTarget($("go-root").parentElement, null, translate("根目录"));
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
  fileType = form.get("type");
  page = 0;
  await refresh();
}));
$("file-type").addEventListener("change", () => $("search").requestSubmit());
$("sort").addEventListener("change", action(async () => {
  page = 0;
  await refresh();
}));
$("new-folder").addEventListener("click", action(async () => {
  const name = prompt(translate("目录名称"));
  if (name === null) return;
  await api("/api/folders", { method: "POST", json: { name, parent: currentFolder() || null } });
  resetFilters();
  await loadFolderTree();
  await refresh();
}));
$("previous").addEventListener("click", action(async () => { page -= 1; await refresh(); }));
$("next").addEventListener("click", action(async () => { page += 1; await refresh(); }));
$("choose-files").addEventListener("click", () => $("file-input").click());
const directoryInput = $("directory-input");
$("choose-directory").hidden = !("webkitdirectory" in directoryInput);
$("choose-directory").addEventListener("click", () => directoryInput.click());
directoryInput.addEventListener("change", action(async () => {
  const items = selectedDirectoryItems(directoryInput.files);
  directoryInput.value = "";
  if (items.length) await uploadItems(items);
}));
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
  if (uploading || !token) return;
  await uploadItems(droppedItems(event.dataTransfer), parent);
}));
$("settings").addEventListener("click", () => {
  const form = $("settings-form");
  for (const [name, value] of Object.entries(config)) form.elements.namedItem(name).value = value;
  $("settings-dialog").showModal();
});
$("open-help").addEventListener("click", () => $("help-dialog").showModal());
$("settings-form").addEventListener("submit", action(async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const settings = Object.fromEntries(form);
  settings.maxUploadMiB = Number(settings.maxUploadMiB);
  applyConfig(await api("/api/config", { method: "PUT", json: settings }));
  $("settings-dialog").close();
  notice(translate("设置已保存。其他地区可能稍后更新。"));
}));
for (const close of document.querySelectorAll("[data-close]")) {
  close.addEventListener("click", () => close.closest("dialog").close());
}
api("/api/config").then(applyConfig).catch((error) => notice(error.message, true));
if (token) action(loggedIn)();
