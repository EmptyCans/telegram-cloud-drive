function frameReady(video, signal) {
  return new Promise((resolve, reject) => {
    const ready = () => finish();
    const fail = () => finish(new Error("无法生成视频封面"));
    const timer = setTimeout(fail, 8000);
    function finish(error) {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", fail);
      if (error) reject(error);
      else resolve();
    }
    video.addEventListener("loadeddata", ready);
    video.addEventListener("error", fail);
    signal.addEventListener("abort", fail);
    if (signal.aborted) fail();
  });
}

async function resize(source, width, height) {
  const scale = Math.min(1, 240 / width, 160 / height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
}

async function makeCover(blob, type, signal) {
  const source = blob.slice(0, blob.size, type);
  if (type.startsWith("image/")) {
    const image = await createImageBitmap(source);
    try {
      return await resize(image, image.width, image.height);
    } finally {
      image.close();
    }
  }

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(source);
  try {
    const ready = frameReady(video, signal);
    video.src = url;
    await ready;
    return await resize(video, video.videoWidth, video.videoHeight);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function observeCovers(grid, headers) {
  const controller = new AbortController();
  const { signal } = controller;
  const urls = new Set();
  const pending = [];
  let active = 0;

  async function fill(tile) {
    const type = tile.dataset.coverType;
    const response = await fetch(tile.dataset.coverSource, { credentials: "omit", headers, signal });
    if (!response.ok) return;
    const cover = await makeCover(await response.blob(), type, signal);
    if (!cover || signal.aborted) return;
    const url = URL.createObjectURL(cover);
    urls.add(url);
    const image = document.createElement("img");
    image.alt = "";
    image.src = url;
    tile.classList.add("media-cover");
    tile.classList.toggle("video-cover", type.startsWith("video/"));
    tile.replaceChildren(image);
  }

  function processQueue() {
    while (!signal.aborted && active < 2 && pending.length) {
      active += 1;
      fill(pending.shift()).catch(() => {
        // Keep the file icon if the browser cannot render a cover.
      }).finally(() => {
        active -= 1;
        processQueue();
      });
    }
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      pending.push(entry.target);
    }
    processQueue();
  }, { rootMargin: "120px" });
  for (const tile of grid.querySelectorAll("[data-cover-type]")) observer.observe(tile);
  return () => {
    observer.disconnect();
    controller.abort();
    pending.length = 0;
    for (const url of urls) URL.revokeObjectURL(url);
  };
}
