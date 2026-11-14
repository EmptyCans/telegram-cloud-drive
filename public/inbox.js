import { createMediaPreview } from "./media-preview.js";
import { isDocumentPreview, previewType } from "./media-types.js";
import { observeCovers } from "./media-covers.js";
import { fileIcon } from "./file-icons.js";
import { formatEntryKind, formatEntrySize } from "./entry-format.js";
import { language, localizeInbox, translate } from "./inbox-i18n.js";
import { bindViewSwitch } from "./view-switch.js";
import { droppedItems, pastedFiles, selectedDirectoryItems, showUploadProgress, uploadDirectories, uploadFile } from "./uploads.js";

const $ = (id) => document.getElementById(id);
localizeInbox();
const entryDateFormat = new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: "medium", timeStyle: "short" });
const code = location.pathname.match(/^\/s\/([a-zA-Z0-9_-]{12})$/)?.[1];
let folder = new URLSearchParams(location.search).get("folder");
const form = $("inbox-form");
const panel = $("inbox-panel");
const input = $("inbox-files");
const submit = $("inbox-submit");
const directoryInput = $("inbox-directory");
const chooseDirectory = $("inbox-choose-directory");
const mkdir = $("inbox-mkdir");
const status = $("inbox-status");
const endpoint = "/api/inbox/" + code;
const pageSize = 50;
let page = 0;
let maxUploadMiB;
let listing = 0;
let query = "";
let fileType = "";
let sort = $("inbox-sort").value;
let navigating = false;
let treeSnapshot;

let stopCovers;

const viewSwitch = $("inbox-view-switch");
bindViewSwitch(viewSwitch, "cloud-drive-inbox-view", "grid", (view) => {
  $("inbox-entries").classList.toggle("inbox-list", view === "list");
});

function folderAddress(id) {
  const url = new URL(location.pathname, location.origin);
  if (id) url.searchParams.set("folder", id);
  return url.href;
}

function folderQuery(fields, target = folder) {
  const params = new URLSearchParams(fields);
  if (target) params.set("folder", target);
  return endpoint + "?" + params;
}

async function request(path, options) {
  const response = await fetch(path, { ...options, credentials: "omit" });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    const fallback = response.status === 413 ? "文件超过上传限制。" : "请求失败，请稍后重试。";
    throw Object.assign(new Error(translate(language === "zh" ? error ?? fallback : fallback)), { status: response.status });
  }
  return response;
}

function fileAddress(item) {
  return endpoint + "/" + encodeURIComponent(item.id) + "/download";
}

async function downloadFile(item) {
  const blob = await (await request(fileAddress(item))).blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = item.name;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const preview = createMediaPreview($("inbox-preview"), async (item, _type, signal) =>
  (await request(fileAddress(item), { signal })).blob(), downloadFile, translate);

function renderEntry(item, entries) {
  const row = document.createElement("li");
  const isFolder = item.kind === "folder";
  const type = previewType(item);
  const documentPreview = !isFolder && isDocumentPreview(type);
  const open = document.createElement(!isFolder && !documentPreview && type ? "button" : "a");
  open.className = "inbox-tile";
  open.title = item.name;
  const icon = document.createElement("span");
  icon.className = "inbox-icon " + (isFolder ? "icon-folder" : "inbox-file-art");
  if (!isFolder) icon.append(fileIcon(item.name, type));
  if (!isFolder && !documentPreview && (type?.startsWith("image/") || type?.startsWith("video/"))) {
    icon.dataset.coverType = type;
    icon.dataset.coverSource = fileAddress(item);
  }
  const art = document.createElement("span");
  art.className = "inbox-art";
  art.setAttribute("aria-hidden", "true");
  art.append(icon);
  const name = document.createElement("span");
  name.className = "inbox-name";
  name.textContent = item.name;
  const info = document.createElement("span");
  info.className = "inbox-info";
  info.append(name);
  const meta = document.createElement("span");
  meta.className = "inbox-meta";
  const kind = document.createElement("span");
  kind.className = "inbox-kind";
  kind.textContent = translate(formatEntryKind(item));
  meta.append(kind);
  if (!isFolder && Number.isFinite(item.size)) {
    const size = document.createElement("span");
    size.className = "inbox-size";
    size.textContent = formatEntrySize(item.size);
    meta.append(size);
  }
  if (item.created_at) {
    const time = document.createElement("time");
    time.dateTime = item.created_at;
    time.textContent = entryDateFormat.format(new Date(item.created_at));
    meta.append(time);
  }
  info.append(meta);
  const feedback = document.createElement("span");
  feedback.className = "inbox-file-feedback";
  feedback.setAttribute("role", "status");
  function bindDownload(link) {
    link.addEventListener("click", async event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (row.getAttribute("aria-busy") === "true") return;
      row.setAttribute("aria-busy", "true");
      feedback.textContent = translate("正在准备下载…");
      try {
        await downloadFile(item);
        feedback.textContent = translate("已交给浏览器下载");
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        row.removeAttribute("aria-busy");
      }
    });
  }
  open.append(art, info);
  row.append(open);
  if (isFolder) {
    open.href = folderAddress(item.id);
    open.dataset.folderLink = "";
  } else if (documentPreview || type) {
    if (documentPreview) {
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set("file", item.id);
      open.href = url.href;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
    } else {
      open.type = "button";
      open.addEventListener("click", () => preview(item, entries));
    }
    const download = document.createElement("a");
    download.className = "inbox-download";
    download.href = fileAddress(item);
    download.download = item.name;
    download.textContent = translate("下载");
    bindDownload(download);
    row.append(download);
  } else {
    open.href = fileAddress(item);
    open.download = item.name;
    bindDownload(open);
  }
  if (!isFolder) row.append(feedback);
  return row;
}

function renderBreadcrumbs(data) {
  const path = $("inbox-path");
  const current = $("inbox-title").parentElement;
  const byId = new Map((data.folders ?? []).map(item => [item.id, item]));
  const ancestors = [];
  const seen = new Set();
  for (let id = data.parent; !data.root && byId.has(id) && !seen.has(id); id = byId.get(id).parent_id) {
    seen.add(id);
    const item = byId.get(id);
    const crumb = document.createElement("li");
    const link = document.createElement("a");
    link.href = folderAddress(id === data.rootId ? null : id);
    link.dataset.folderLink = "";
    link.textContent = item.name;
    crumb.append(link);
    ancestors.push(crumb);
    if (id === data.rootId) break;
  }
  path.replaceChildren(...ancestors.reverse(), current);
}

function renderFolderTree(data) {
  const tree = $("inbox-tree");
  const children = new Map();
  const current = folder || data.rootId;
  const byId = new Map(data.folders.map(item => [item.id, item]));
  const ancestors = new Set();
  for (let item = byId.get(current); item && !ancestors.has(item.id); item = byId.get(item.parent_id)) {
    ancestors.add(item.id);
  }
  const snapshot = JSON.stringify(data.folders);
  if (snapshot === treeSnapshot) {
    for (const link of tree.querySelectorAll(".tree-folder")) {
      if (link.dataset.folderId === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    for (const toggle of tree.querySelectorAll('.tree-toggle[aria-expanded="false"]')) {
      if (toggle.dataset.folder !== current && ancestors.has(toggle.dataset.folder)) toggle.click();
    }
    return;
  }
  const expanded = new Set([...tree.querySelectorAll('[aria-expanded="true"]')].map(toggle => toggle.dataset.folder));
  for (const item of data.folders) {
    if (!children.has(item.parent_id)) children.set(item.parent_id, []);
    children.get(item.parent_id).push(item);
  }
  function branch(parent) {
    const list = document.createElement("ul");
    if (parent !== null) list.className = "folder-tree";
    else list.className = "inbox-tree-root";
    for (const item of children.get(parent) ?? []) {
      const node = document.createElement("li");
      const row = document.createElement("div");
      row.className = "tree-row";
      node.append(row);
      if (children.has(item.id)) {
        const nested = branch(item.id);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "tree-toggle";
        toggle.dataset.folder = item.id;
        toggle.setAttribute("aria-label", translate("{name}的子目录", { name: item.name }));
        const setExpanded = open => {
          nested.hidden = !open;
          toggle.setAttribute("aria-expanded", String(open));
        };
        setExpanded(tree.childElementCount ? expanded.has(item.id) : ancestors.has(item.id));
        toggle.addEventListener("click", () => setExpanded(nested.hidden));
        row.append(toggle);
        node.append(nested);
      }
      const link = document.createElement("a");
      link.className = "tree-folder";
      link.dataset.folderId = item.id;
      link.dataset.folderLink = "";
      link.href = folderAddress(item.id === data.rootId ? null : item.id);
      link.title = item.name;
      if (item.id === current) link.setAttribute("aria-current", "location");
      const icon = document.createElement("span");
      icon.className = "icon icon-folder";
      icon.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "tree-folder-name";
      name.textContent = item.name;
      link.append(icon, name);
      row.append(link);
      list.append(node);
    }
    return list;
  }
  tree.replaceChildren(branch(null));
  treeSnapshot = snapshot;
  $("inbox-sidebar").hidden = false;
}

async function loadFolder(target = folder, offsetPage = page, historyMode, filters = { query, sort, fileType }) {
  const sequence = ++listing;
  let data;
  try {
    const response = await request(folderQuery({
      offset: offsetPage * pageSize, q: filters.query, sort: filters.sort, type: filters.fileType
    }, target));
    data = await response.json();
  } catch (error) {
    if (sequence !== listing) return;
    throw error;
  }
  if (sequence !== listing) return;
  if (historyMode === "push") history.pushState(null, "", folderAddress(target));
  if (folder !== target || page !== offsetPage || query !== filters.query || sort !== filters.sort || fileType !== filters.fileType) {
    panel.querySelector(".file-scroll").scrollTop = 0;
  }
  ({ query, sort, fileType } = filters);
  $("inbox-query").value = query;
  $("inbox-type").value = fileType;
  $("inbox-sort").value = sort;
  folder = target;
  page = offsetPage;
  maxUploadMiB = data.maxUploadMiB;
  document.title = data.name;
  $("inbox-title").textContent = data.name;
  renderBreadcrumbs(data);
  if (data.folders) renderFolderTree(data);
  $("inbox-limit").textContent = translate("单个文件不超过 {limit} MiB", { limit: maxUploadMiB });
  const grid = $("inbox-entries");
  stopCovers?.();
  grid.replaceChildren(...data.entries.map(item => renderEntry(item, data.entries)));
  stopCovers = observeCovers(grid);
  $("inbox-empty").hidden = data.entries.length > 0;
  $("inbox-empty").textContent = translate(query || fileType ? "没有找到匹配的文件或文件夹。" : "这个文件夹还没有文件。");
  $("inbox-pagination").hidden = !page && !data.hasMore;
  $("inbox-previous").disabled = page === 0;
  $("inbox-next").disabled = !data.hasMore;
  $("inbox-page").textContent = translate("第 {page} 页", { page: page + 1 });
  form.hidden = false;
  viewSwitch.hidden = false;
  $("inbox-search").hidden = false;
  $("inbox-list-toolbar").hidden = false;
}

async function navigateFolder(target, historyMode) {
  navigating = true;
  const loading = $("inbox-folder-loading");
  loading.hidden = false;
  const expected = listing + 1;
  try {
    await loadFolder(target, 0, historyMode, { query: "", sort, fileType: "" });
  } catch (error) {
    if (historyMode === "pop") history.replaceState(null, "", folderAddress(folder));
    status.textContent = error.message;
  } finally {
    if (expected === listing) {
      navigating = false;
      loading.hidden = true;
    }
  }
}

panel.addEventListener("click", event => {
  const link = event.target.closest("a[data-folder-link]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (submit.disabled) return;
  const target = new URL(link.href).searchParams.get("folder");
  if (target !== folder || navigating) void navigateFolder(target, "push");
});
window.addEventListener("popstate", () => {
  void navigateFolder(new URLSearchParams(location.search).get("folder"), "pop");
});

function folderError(error) {
  status.textContent = error.message;
  if (error.status === 404) {
    $("inbox-sidebar").hidden = true;
    form.hidden = true;
    viewSwitch.hidden = true;
    $("inbox-search").hidden = true;
    $("inbox-list-toolbar").hidden = true;
    stopCovers?.();
    $("inbox-entries").replaceChildren();
    $("inbox-empty").hidden = $("inbox-pagination").hidden = true;
  }
}

async function createFolder(name, target = folder) {
  const response = await request(folderQuery({ action: "mkdir" }, target), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return (await response.json()).id;
}

function setUploadBusy(busy) {
  input.disabled = directoryInput.disabled = submit.disabled = chooseDirectory.disabled = mkdir.disabled = busy;
}

async function uploadItems(items) {
  if (form.hidden || submit.disabled || navigating) return;
  const uploadFolder = folder;
  setUploadBusy(true);
  const progress = $("inbox-progress");
  status.textContent = "";
  let completed = 0;
  let index = 0;
  let created = 0;
  const failures = [];
  const ensurePath = uploadDirectories(folder, async (name, target) => {
    const id = await createFolder(name, target);
    created += 1;
    return id;
  });
  try {
    items = await items;
    const total = items.filter(item => item.file).length;
    for (const { file, path } of items) {
      try {
        if (!file) {
          await ensurePath(path);
          continue;
        }
        const position = index++;
        if (!file.size || file.size > maxUploadMiB * 1024 * 1024) {
          throw new Error(translate("文件必须大于 0 字节且不超过 {limit} MiB", { limit: maxUploadMiB }));
        }
        const target = await ensurePath(path);
        const update = showUploadProgress(progress, file, position, total, translate);
        await uploadFile(folderQuery({ name: file.name }, target), file, {}, update, translate);
        completed += 1;
      } catch (error) {
        failures.push([...path, ...(file ? [file.name] : [])].join("/") + " · " + error.message);
        if (error.status === 404) {
          if (folder === uploadFolder && !navigating) folderError(error);
          break;
        }
      }
    }
    const summary = [translate("已上传 {done}/{total} 个文件", { done: completed, total })];
    if (created) summary.push(translate("已创建 {count} 个文件夹", { count: created }));
    status.textContent = [...summary, ...failures].join("\n");
    if ((completed || created) && !form.hidden && !navigating) await loadFolder().catch(folderError);
  } catch (error) {
    folderError(error);
  } finally {
    input.value = directoryInput.value = "";
    progress.hidden = true;
    setUploadBusy(false);
  }
}

function uploadFiles(files) {
  if (files.length) void uploadItems(files.map(file => ({ file, path: [] })));
}

submit.addEventListener("click", () => input.click());
input.addEventListener("change", () => uploadFiles(Array.from(input.files)));
chooseDirectory.hidden = !("webkitdirectory" in directoryInput);
chooseDirectory.addEventListener("click", () => directoryInput.click());
directoryInput.addEventListener("change", () => {
  const items = selectedDirectoryItems(directoryInput.files);
  if (items.length) void uploadItems(items);
});
mkdir.addEventListener("click", async () => {
  if (navigating) return;
  const name = prompt(translate("文件夹名称"))?.trim();
  if (!name) return;
  setUploadBusy(true);
  try {
    await createFolder(name);
    status.textContent = translate("已创建文件夹「{name}」", { name });
    await loadFolder();
  } catch (error) {
    folderError(error);
  } finally {
    setUploadBusy(false);
  }
});
form.addEventListener("submit", (event) => event.preventDefault());
document.addEventListener("paste", (event) => {
  if (form.hidden || $("inbox-preview").open) return;
  const files = pastedFiles(event);
  if (!files.length) return;
  event.preventDefault();
  void uploadFiles(files);
});

function isFileDrag(event) {
  return event.dataTransfer?.types.includes("Files");
}

window.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  const ready = !form.hidden && !submit.disabled && !$("inbox-preview").open;
  event.dataTransfer.dropEffect = ready ? "copy" : "none";
  form.classList.toggle("inbox-dragging", ready);
});
window.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) form.classList.remove("inbox-dragging");
});
window.addEventListener("drop", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  form.classList.remove("inbox-dragging");
  if (!form.hidden && !submit.disabled && !$("inbox-preview").open) {
    void uploadItems(droppedItems(event.dataTransfer));
  }
});

function applyFilters() {
  if (navigating || submit.disabled) return;
  loadFolder(folder, 0, undefined, {
    query: $("inbox-query").value.trim(), sort: $("inbox-sort").value, fileType: $("inbox-type").value
  }).catch(folderError);
}

$("inbox-search").addEventListener("submit", event => {
  event.preventDefault();
  applyFilters();
});
$("inbox-query").addEventListener("input", event => {
  if (!event.target.value && query) applyFilters();
});
$("inbox-sort").addEventListener("change", applyFilters);
$("inbox-type").addEventListener("change", applyFilters);

$("inbox-previous").addEventListener("click", () => {
  if (!navigating && !submit.disabled) loadFolder(folder, page - 1).catch(folderError);
});
$("inbox-next").addEventListener("click", () => {
  if (!navigating && !submit.disabled) loadFolder(folder, page + 1).catch(folderError);
});

if (code) {
  loadFolder().catch(folderError).finally(() => { panel.hidden = false; });
} else {
  status.textContent = translate("公开文件夹链接已失效，请索取新的短链接。");
  panel.hidden = false;
}
