import { isDocumentPreview, isRenderedDocument, isWorkbookPreview, previewType } from "./media-types.js";

const status = document.getElementById("status");
const frame = document.querySelector("iframe");

function downloadFallback(message, url, name) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.textContent = "下载文件";
  status.replaceChildren(message, " ", link);
  status.hidden = false;
  return link;
}

async function loadPreview() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const code = location.pathname.match(/^\/s\/([a-zA-Z0-9_-]{12})$/)?.[1];
  const file = params.get("file");
  if (!code && location.hash) throw new Error("分享链接已失效，请索取新的短链接。");
  if (!code && !/^[a-f0-9-]{36}$/.test(id ?? "")) throw new Error("文件地址无效。");
  const publicAccess = Boolean(code);
  const token = publicAccess ? null : sessionStorage.getItem("cloud-drive-token");
  if (!publicAccess && !token) throw new Error("请登录云盘后重新打开该文件。");

  const path = code
    ? file ? "/api/inbox/" + code + "/" + encodeURIComponent(file) + "/download" : "/api/share/" + code + "/download"
    : "/api/entries/" + id + "/download";
  const options = publicAccess ? { credentials: "omit" } : { headers: { Authorization: "Bearer " + token } };
  const response = await fetch(path, options);
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error ?? "无法打开文件，请重试。");
  }
  const filename = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const name = filename ? decodeURIComponent(filename) : "文件";
  document.title = name;
  const detected = previewType({ name, mime: response.headers.get("X-File-Mime") });
  const type = code ? detected
    : isDocumentPreview(detected) ? detected
      : params.get("type") === "pdf" ? "application/pdf" : "text/html";
  if (!type) {
    await response.body?.cancel();
    downloadFallback("此格式可以下载后打开。", path, name).click();
    return;
  }
  const blob = await response.blob();
  if (isWorkbookPreview(type)) {
    try {
      const { renderWorkbook } = await import("/document-renderers.js");
      document.body.append(await renderWorkbook(blob));
      status.hidden = true;
    } catch {
      downloadFallback("无法预览此工作簿。", URL.createObjectURL(blob), name);
    }
    return;
  }
  if (isRenderedDocument(type)) {
    try {
      const { renderDocument } = await import("/document-renderers.js");
      const sandbox = "allow-popups allow-popups-to-escape-sandbox";
      frame.setAttribute("sandbox", type === "text/markdown" ? sandbox : sandbox + " allow-scripts");
      frame.classList.add("rendered-document");
      frame.srcdoc = await renderDocument(blob, type);
      frame.hidden = false;
      status.hidden = true;
    } catch {
      downloadFallback("无法预览此文档。", URL.createObjectURL(blob), name);
    }
    return;
  }
  const pdf = type === "application/pdf";
  if (pdf && await blob.slice(0, 5).text() !== "%PDF-") throw new Error("文件内容不是有效的 PDF，请下载后检查。");
  const previewUrl = URL.createObjectURL(blob.slice(0, blob.size, type));
  const kind = type.split("/")[0];
  if (kind === "video" || kind === "audio") {
    const player = document.createElement(kind);
    player.className = "shared-media-player";
    player.controls = true;
    player.playsInline = true;
    if (code && !file && kind === "video") player.classList.add("shared-video-full");
    player.setAttribute("aria-label", name);
    player.addEventListener("error", () => {
      player.hidden = true;
      downloadFallback("浏览器无法播放此文件。", previewUrl, name);
    });
    player.src = previewUrl;
    status.hidden = true;
    document.body.append(player);
    return;
  }
  if (kind === "image") {
    const image = document.createElement("img");
    image.className = "shared-media-player";
    image.alt = name;
    image.src = previewUrl;
    status.hidden = true;
    document.body.append(image);
    return;
  }
  if (pdf && navigator.pdfViewerEnabled === false) {
    downloadFallback("此浏览器未启用 PDF 预览。", previewUrl, name);
    return;
  }
  // Native PDF viewers require a frame without sandbox restrictions. HTML keeps its sandbox.
  if (pdf) frame.removeAttribute("sandbox");
  frame.src = previewUrl;
  frame.hidden = false;
  status.hidden = true;
}

loadPreview().catch((error) => {
  status.textContent = error.message;
});
