const status = document.getElementById("status");
const frame = document.querySelector("iframe");

async function loadPreview() {
  const id = new URLSearchParams(location.search).get("id");
  const token = sessionStorage.getItem("cloud-drive-token");
  if (!token) throw new Error("请登录云盘后重新打开该文件。");
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("文件地址无效。");

  const response = await fetch("/api/entries/" + id + "/download", {
    headers: { Authorization: "Bearer " + token }
  });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error ?? "无法打开文件，请重试。");
  }
  const filename = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (filename) document.title = decodeURIComponent(filename);
  const blob = await response.blob();
  frame.src = URL.createObjectURL(blob.slice(0, blob.size, "text/html"));
  frame.hidden = false;
  status.hidden = true;
}

loadPreview().catch((error) => {
  status.textContent = error.message;
});
