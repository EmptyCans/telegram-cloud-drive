export function bindDragDownload(row, item, getTicket) {
  let ticket;
  let pending;

  function prepare() {
    if (ticket?.expires > Date.now() / 1000 + 10 || pending) return;
    pending = getTicket().then(result => {
      ticket = result;
    }).catch(() => {}).finally(() => { pending = undefined; });
  }

  for (const event of ["pointerenter", "focusin", "pointerdown"]) row.addEventListener(event, prepare);
  return (transfer) => {
    if (!ticket || ticket.expires <= Date.now() / 1000) {
      prepare();
      return false;
    }
    const url = new URL(ticket.path, location.origin);
    transfer.setData("DownloadURL", "application/octet-stream:" + item.name.replaceAll(":", "：") + ":" + url.href);
    return true;
  };
}
