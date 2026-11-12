import JSZip from "jszip";

const imageTypes = new Map([
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"],
  ["gif", "image/gif"], ["webp", "image/webp"], ["bmp", "image/bmp"],
]);
const relationshipNamespaces = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  "http://purl.oclc.org/ooxml/officeDocument/relationships",
];

const children = (node, name) => Array.from(node?.children ?? []).filter(child => child.localName === name);
const child = (node, name) => children(node, name)[0];
const descendants = (node, name) => Array.from(node?.getElementsByTagNameNS("*", name) ?? []);

function relationshipId(node, name) {
  return relationshipNamespaces.map(namespace => node.getAttributeNS(namespace, name)).find(Boolean);
}

function cellAnchor(anchor, name) {
  const marker = child(anchor, name);
  if (!marker) return null;
  const row = Number(child(marker, "row")?.textContent);
  const column = Number(child(marker, "col")?.textContent);
  if (!Number.isInteger(row) || row < 0 || row >= 1048576 ||
      !Number.isInteger(column) || column < 0 || column >= 16384) return null;
  return {
    row, column,
    x: (Number(child(marker, "colOff")?.textContent) || 0) / 9525,
    y: (Number(child(marker, "rowOff")?.textContent) || 0) / 9525,
  };
}

function drawingBounds(shape, anchor, rowPosition) {
  const transform = child(child(shape, "spPr"), "xfrm");
  const offset = child(transform, "off");
  const extent = child(transform, "ext");
  if (!offset || !extent) return null;
  const x = Number(offset.getAttribute("x"));
  const from = child(anchor, "from");
  const y = from ? rowPosition(Number(child(from, "row")?.textContent)) +
    Number(child(from, "rowOff")?.textContent ?? 0) : Number(offset.getAttribute("y"));
  const width = Number(extent.getAttribute("cx"));
  const height = Number(extent.getAttribute("cy"));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function sheetDimensions(sheet) {
  const lastCell = child(sheet, "dimension")?.getAttribute("ref")?.split(":").pop();
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(lastCell ?? "");
  if (!match) return {};
  const columnCount = Array.from(match[1]).reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
  const rowCount = Number(match[2]);
  if (columnCount > 16384 || rowCount > 1048576) return {};
  return { rowCount, columnCount };
}

export async function loadWorkbookDetails(blob) {
  const zip = await JSZip.loadAsync(blob);
  const parser = new DOMParser();
  const pictureSources = new Map();

  async function readXml(path) {
    const entry = zip.file(path);
    if (!entry) return null;
    return parser.parseFromString(await entry.async("string"), "application/xml").documentElement;
  }

  async function relationships(path) {
    const split = path.lastIndexOf("/") + 1;
    const rels = await readXml(path.slice(0, split) + "_rels/" + path.slice(split) + ".rels");
    const targets = new Map();
    for (const relation of children(rels, "Relationship")) {
      const target = relation.getAttribute("Target");
      if (!target || relation.getAttribute("TargetMode") === "External") continue;
      try {
        const url = new URL(target, "https://workbook.invalid/" + path);
        if (url.origin === "https://workbook.invalid") {
          targets.set(relation.getAttribute("Id"), decodeURIComponent(url.pathname.slice(1)));
        }
      } catch {
        continue;
      }
    }
    return targets;
  }

  async function pictureSource(path) {
    if (!path) return null;
    const type = imageTypes.get(path.split(".").pop().toLowerCase());
    const file = zip.file(path);
    if (!type || !file) return null;
    if (!pictureSources.has(path)) {
      pictureSources.set(path, file.async("base64").then(data => `data:${type};base64,${data}`));
    }
    return pictureSources.get(path);
  }

  async function readDrawing(path, rowPosition) {
    const drawing = await readXml(path);
    const targets = await relationships(path);
    const pictures = [];
    const labels = [];
    for (const anchor of drawing?.children ?? []) {
      const picture = child(anchor, "pic");
      const blip = child(child(picture, "blipFill"), "blip");
      if (blip) {
        const source = await pictureSource(targets.get(relationshipId(blip, "embed")));
        const properties = child(child(picture, "nvPicPr"), "cNvPr");
        if (source) pictures.push({
          source, alt: properties?.getAttribute("descr"),
          bounds: drawingBounds(picture, anchor, rowPosition),
          from: cellAnchor(anchor, "from"), to: cellAnchor(anchor, "to"), labels: [],
        });
      }
      const shape = child(anchor, "sp");
      const body = child(shape, "txBody");
      const bounds = drawingBounds(shape, anchor, rowPosition);
      const value = descendants(body, "t").map(node => node.textContent).join("").trim();
      if (!bounds || !value) continue;
      const style = descendants(body, "rPr")[0];
      const color = child(child(style, "solidFill"), "srgbClr")?.getAttribute("val");
      labels.push({ bounds, value, color: /^[a-f0-9]{6}$/i.test(color) ? "#" + color : null });
    }
    for (const label of labels) {
      const { x, y, width, height } = label.bounds;
      const picture = pictures.findLast(({ bounds }) => bounds && x >= bounds.x && y >= bounds.y &&
        x + width <= bounds.x + bounds.width && y + height <= bounds.y + bounds.height);
      if (picture) picture.labels.push(label);
    }
    return pictures;
  }

  const workbookPath = "xl/workbook.xml";
  const workbook = await readXml(workbookPath);
  const targets = await relationships(workbookPath);
  return new Map(await Promise.all(children(child(workbook, "sheets"), "sheet").map(async sheet => {
    const path = targets.get(relationshipId(sheet, "id"));
    const name = sheet.getAttribute("name");
    if (!path || !zip.file(path)) return [name, { pictures: [] }];
    const xml = await readXml(path);
    const dimensions = sheetDimensions(xml);
    const drawings = children(xml, "drawing");
    if (!drawings.length) return [name, { ...dimensions, pictures: [] }];
    const defaultHeight = Number(child(xml, "sheetFormatPr")?.getAttribute("defaultRowHeight")) || 15;
    const customRows = children(child(xml, "sheetData"), "row")
      .filter(row => row.hasAttribute("ht") || row.getAttribute("hidden") === "1")
      .map(row => [Number(row.getAttribute("r")), row.getAttribute("hidden") === "1" ? 0 : Number(row.getAttribute("ht"))]);
    function rowPosition(rowIndex) {
      const height = customRows.reduce((total, [row, points]) =>
        row <= rowIndex ? total + points - defaultHeight : total, rowIndex * defaultHeight);
      return height * 12700;
    }
    const sheetTargets = await relationships(path);
    const paths = drawings.map(node => sheetTargets.get(relationshipId(node, "id"))).filter(Boolean);
    const pictures = (await Promise.all(paths.map(path => readDrawing(path, rowPosition)))).flat();
    return [name, { ...dimensions, pictures }];
  })));
}
