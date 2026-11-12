import DOMPurify from "dompurify";
import { marked } from "marked";
import { renderAsync } from "docx-preview";
export { renderWorkbook } from "./workbook-preview.js";

function wordOutline(content, styles) {
  const levels = new Map();
  for (const style of styles) {
    const namedLevel = style.name?.match(/^(?:heading|标题)\s*([1-9])$/i);
    const level = style.paragraphProps?.outlineLevel ?? (namedLevel ? Number(namedLevel[1]) - 1 : null);
    if (style.cssName && Number.isInteger(level) && level >= 0 && level <= 8) levels.set(style.cssName, level);
  }
  const nav = document.createElement("nav");
  nav.className = "word-outline";
  nav.setAttribute("aria-label", "文档目录");
  const title = document.createElement("h2");
  title.textContent = "目录";
  const list = document.createElement("ol");
  nav.append(title, list);

  for (const paragraph of content.querySelectorAll("section.docx article p")) {
    const level = Array.from(paragraph.classList).map((name) => levels.get(name)).find(Number.isInteger);
    const text = paragraph.textContent.trim().replace(/\s+/g, " ");
    if (level === undefined || !text) continue;
    let id = "word-heading-" + (list.childElementCount + 1);
    while (content.getElementById(id)) id += "-";
    const anchor = document.createElement("span");
    anchor.id = id;
    paragraph.before(anchor);
    const item = document.createElement("li");
    item.style.setProperty("--heading-depth", Math.min(level, 4));
    const link = document.createElement("a");
    link.href = "#" + id;
    link.textContent = text;
    item.append(link);
    list.append(item);
  }
  return list.childElementCount ? nav.outerHTML : "";
}

export async function renderDocument(blob, type) {
  const word = type !== "text/markdown";
  let html;
  let wordStyles = "";
  let headingStyles = [];
  if (word) {
    const detached = document.implementation.createHTMLDocument();
    const pages = detached.createElement("div");
    const styles = detached.createElement("div");
    const parsed = await renderAsync(await blob.arrayBuffer(), pages, styles, {
      useBase64URL: true,
      renderAltChunks: false,
      ignoreLastRenderedPageBreak: false
    });
    headingStyles = parsed.stylesPart?.styles ?? [];
    html = pages.innerHTML;
    wordStyles = styles.textContent.replaceAll("<", "\\3c ");
  } else {
    html = await marked.parse(await blob.text());
  }
  const content = DOMPurify.sanitize(html, {
    USE_PROFILES: word ? { html: true, svg: true } : { html: true },
    FORBID_TAGS: ["style", "form", "input", "button"],
    FORBID_ATTR: word ? ["target"] : ["style", "target"],
    RETURN_DOM_FRAGMENT: true
  });
  let hasRelativeLinks = false;
  for (const link of content.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href").trim();
    if (/^https?:\/\//i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else if (href && !href.startsWith("#") && !/^[a-z][a-z\d+.-]*:/i.test(href)) {
      link.removeAttribute("href");
      link.title = href;
      link.classList.add("relative-link");
      hasRelativeLinks = true;
    }
  }
  const outline = word ? wordOutline(content, headingStyles) : "";
  const outlineNonce = outline ? crypto.randomUUID() : "";
  const template = document.createElement("template");
  template.content.append(content);

  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:${word ? "" : " https:"}; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'${outline ? "; script-src 'nonce-" + outlineNonce + "'" : ""}">
<style>
  ${wordStyles}
  :root { color-scheme: light dark; color: CanvasText; background: Canvas; font: 16px/1.65 system-ui, sans-serif; }
  ${word ? `
  body { margin: 0; }
  .docx-wrapper { background: Canvas; min-height: 100vh; }
  .docx-wrapper > section.docx { color-scheme: light; color: #161616; line-height: normal; }
  .word-reader { display: grid; grid-template-columns: minmax(180px, 250px) minmax(0, 1fr); align-items: start; }
  .word-reader main { min-width: 0; overflow-x: auto; }
  .word-outline { position: sticky; top: 0; max-height: 100vh; overflow: auto; padding: 18px 12px; border-right: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); }
  .word-outline h2 { margin: 0 8px 10px; font-size: 15px; }
  .word-outline ol { margin: 0; padding: 0; list-style: none; }
  .word-outline li { padding-inline-start: calc(var(--heading-depth, 0) * 10px); }
  .word-outline a { display: block; border-radius: 6px; padding: 4px 8px; color: CanvasText; font-size: 13px; text-decoration: none; overflow-wrap: anywhere; }
  .word-outline a:hover, .word-outline a:focus-visible { background: color-mix(in srgb, CanvasText 10%, Canvas); }
  [id^="word-heading-"] { display: block; scroll-margin-top: 16px; }
  @media (max-width: 1000px) {
    .word-reader { grid-template-columns: minmax(0, 1fr); }
    .word-outline { position: static; max-height: 26vh; border-right: 0; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); }
  }
  ` : `
  body { max-width: 850px; margin: auto; padding: clamp(16px, 5vw, 56px); overflow-wrap: anywhere; }
  h1, h2, h3, h4 { line-height: 1.25; }
  pre, blockquote { margin-inline: 0; padding: 12px 16px; background: color-mix(in srgb, CanvasText 8%, Canvas); border-radius: 6px; }
  pre { overflow: auto; overflow-wrap: normal; }
  code { font-family: ui-monospace, monospace; }
  table { display: block; overflow: auto; border-collapse: collapse; }
  td, th { border: 1px solid GrayText; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
  `}
  .relative-link { text-decoration: underline dotted; }
  .relative-link-note { padding: 8px 12px; border-left: 3px solid GrayText; font-size: 14px; }
</style>
<body${outline ? ' class="word-reader"' : ""}>
${outline}
<main>
${hasRelativeLinks ? '<p class="relative-link-note">部分链接指向原项目中的其他文件或目录，请从原项目打开。</p>' : ""}
${template.innerHTML}
</main>
${outline ? `<script nonce="${outlineNonce}">
  document.querySelector(".word-outline").addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    event.preventDefault();
    document.getElementById(link.getAttribute("href").slice(1))?.scrollIntoView({ block: "start" });
  });
</script>` : ""}
</body>
</html>`;
}
