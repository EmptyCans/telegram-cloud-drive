const status = document.getElementById("status");
const frame = document.querySelector("iframe");

async function loadPreview() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const pdf = params.get("type") === "pdf";
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("文件地址无效。");
  const share = location.hash.slice(1);
  if (share && !/^[a-f0-9]{32}$/.test(share)) throw new Error("公开文件夹链接无效。");
  const token = share ? null : sessionStorage.getItem("cloud-drive-token");
  if (!share && !token) throw new Error("请登录云盘后重新打开该文件。");

  const path = share ? "/api/inbox/" + share + "/" + id : "/api/entries/" + id;
  const options = share ? { credentials: "omit" } : { headers: { Authorization: "Bearer " + token } };
  const response = await fetch(path + "/download", options);
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error ?? "无法打开文件，请重试。");
  }
  const filename = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (filename) document.title = decodeURIComponent(filename);
  const blob = await response.blob();
  if (pdf && await blob.slice(0, 5).text() !== "%PDF-") throw new Error("文件内容不是有效的 PDF，请下载后检查。");
  const previewUrl = URL.createObjectURL(blob.slice(0, blob.size, pdf ? "application/pdf" : "text/html"));
  if (pdf && navigator.pdfViewerEnabled === false) {
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = filename ? document.title : "文件.pdf";
    link.textContent = "下载 PDF";
    status.replaceChildren("此浏览器未启用 PDF 预览。", " ", link);
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
