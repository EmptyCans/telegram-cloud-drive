export function dragDownloadHandle(item, download, getTicket, onWait) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "drag-download";
  button.title = "拖出下载";
  button.setAttribute("aria-label", "拖出下载 " + item.name);
  button.draggable = true;
  let ticket;
  let pending;

  function prepare() {
    if (ticket?.expires > Date.now() / 1000 + 10 || pending) return;
    pending = getTicket().then(result => {
      ticket = result;
    }).catch(() => {}).finally(() => { pending = undefined; });
  }

  for (const event of ["pointerenter", "focus", "pointerdown"]) button.addEventListener(event, prepare);
  button.addEventListener("click", download);
  button.addEventListener("dragstart", event => {
    event.stopPropagation();
    if (!ticket || ticket.expires <= Date.now() / 1000) {
      event.preventDefault();
      prepare();
      onWait();
      return;
    }
    const url = new URL(ticket.path, location.origin);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("DownloadURL", "application/octet-stream:" + item.name.replaceAll(":", "：") + ":" + url.href);
  });
  return button;
}
