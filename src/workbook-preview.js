import readWorkbook from "read-excel-file/browser";
import { loadWorkbookDetails } from "./workbook-drawings.js";

const rowsPerPage = 100;
const columnsPerPage = 32;
const minimumGridRows = 8;
const minimumGridColumns = 8;

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function columnName(index) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + (value - 1) % 26) + name;
  }
  return name;
}

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().replace(/T00:00:00\.000Z$/, "").replace("T", " ").replace(/\.000Z$/, "");
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

export async function renderWorkbook(blob) {
  const [sheets, detailsBySheet] = await Promise.all([
    readWorkbook(blob),
    loadWorkbookDetails(blob).catch(() => null),
  ]);
  if (!sheets.length) throw new Error("工作簿没有可预览的工作表");
  const view = element("section");
  view.className = "workbook-preview";
  const toolbar = element("div");
  toolbar.className = "workbook-toolbar row";
  const label = element("label", "工作表 ");
  const select = element("select");
  sheets.forEach(({ sheet }, index) => {
    const option = element("option", sheet);
    option.value = String(index);
    select.append(option);
  });
  label.append(select);
  toolbar.append(label);

  let rowOffset = 0;
  let columnOffset = 0;
  const grid = element("div");
  grid.className = "workbook-grid";
  grid.tabIndex = 0;
  const summary = element("span");
  summary.setAttribute("aria-live", "polite");
  const previousRows = element("button", "上一页行");
  const nextRows = element("button", "下一页行");
  const previousColumns = element("button", "上一组列");
  const nextColumns = element("button", "下一组列");
  toolbar.append(previousRows, nextRows, previousColumns, nextColumns, summary);
  view.append(toolbar, grid);

  function appendPictures(pictures) {
    if (!detailsBySheet) {
      grid.append(element("p", "无法读取工作表图片。"));
      return;
    }
    if (!pictures.length) return;
    const section = element("section");
    section.className = "workbook-pictures";
    section.append(element("h2", "工作表图片"));
    pictures.forEach(({ source, alt, bounds, labels }, index) => {
      const figure = element("figure");
      if (bounds) figure.style.width = bounds.width / 9525 + "px";
      const image = element("img");
      image.src = source;
      image.alt = alt || `工作表图片 ${index + 1}`;
      if (bounds) image.style.aspectRatio = bounds.width + " / " + bounds.height;
      figure.append(image);
      for (const { bounds: box, value, color } of labels) {
        const label = element("span", value);
        label.style.left = (box.x - bounds.x) / bounds.width * 100 + "%";
        label.style.top = (box.y - bounds.y) / bounds.height * 100 + "%";
        label.style.width = box.width / bounds.width * 100 + "%";
        label.style.height = box.height / bounds.height * 100 + "%";
        if (color) label.style.color = color;
        figure.append(label);
      }
      section.append(figure);
    });
    grid.append(section);
  }

  function render() {
    const { sheet, data } = sheets[Number(select.value)];
    const details = detailsBySheet?.get(sheet);
    const dataColumns = data.reduce((width, row) => Math.max(width, row.length), 0);
    const columnCount = Math.max(minimumGridColumns, dataColumns, details?.columnCount ?? 0);
    const rowCount = Math.max(minimumGridRows, data.length, details?.rowCount ?? 0);
    const rowEnd = Math.min(rowCount, rowOffset + rowsPerPage);
    const columnEnd = Math.min(columnCount, columnOffset + columnsPerPage);
    previousRows.hidden = nextRows.hidden = rowCount <= rowsPerPage;
    previousColumns.hidden = nextColumns.hidden = columnCount <= columnsPerPage;
    previousRows.disabled = rowOffset === 0;
    nextRows.disabled = rowEnd === rowCount;
    previousColumns.disabled = columnOffset === 0;
    nextColumns.disabled = columnEnd === columnCount;
    grid.replaceChildren();
    grid.scrollTo(0, 0);
    summary.textContent = `第 ${rowOffset + 1}–${rowEnd} 行 · ${columnName(columnOffset)}–${columnName(columnEnd - 1)} 列`;
    const table = element("table");
    table.setAttribute("aria-label", sheet);
    const headers = table.createTHead().insertRow();
    headers.append(element("th"));
    for (let column = columnOffset; column < columnEnd; column += 1) {
      const header = element("th", columnName(column));
      header.scope = "col";
      headers.append(header);
    }
    const body = table.createTBody();
    for (let index = rowOffset; index < rowEnd; index += 1) {
      const row = body.insertRow();
      const heading = element("th", String(index + 1));
      heading.scope = "row";
      row.append(heading);
      for (let column = columnOffset; column < columnEnd; column += 1) {
        row.insertCell().textContent = cellText(data[index]?.[column]);
      }
    }
    grid.append(table);
    appendPictures(details?.pictures ?? []);
  }

  select.addEventListener("change", () => {
    rowOffset = columnOffset = 0;
    render();
  });
  previousRows.addEventListener("click", () => { rowOffset -= rowsPerPage; render(); });
  nextRows.addEventListener("click", () => { rowOffset += rowsPerPage; render(); });
  previousColumns.addEventListener("click", () => { columnOffset -= columnsPerPage; render(); });
  nextColumns.addEventListener("click", () => { columnOffset += columnsPerPage; render(); });
  render();
  return view;
}
