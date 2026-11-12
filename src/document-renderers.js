import DOMPurify from "dompurify";
import { marked } from "marked";
import mammoth from "mammoth";

export async function renderDocument(blob, type) {
  const html = type === "text/markdown"
    ? await marked.parse(await blob.text())
    : (await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })).value;
  const content = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button"],
    FORBID_ATTR: ["style", "target"],
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
  const template = document.createElement("template");
  template.content.append(content);

  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>
  :root { color-scheme: light dark; color: CanvasText; background: Canvas; font: 16px/1.65 system-ui, sans-serif; }
  body { max-width: 850px; margin: auto; padding: clamp(16px, 5vw, 56px); overflow-wrap: anywhere; }
  h1, h2, h3, h4 { line-height: 1.25; }
  pre, blockquote { margin-inline: 0; padding: 12px 16px; background: color-mix(in srgb, CanvasText 8%, Canvas); border-radius: 6px; }
  pre { overflow: auto; overflow-wrap: normal; }
  code { font-family: ui-monospace, monospace; }
  table { display: block; overflow: auto; border-collapse: collapse; }
  td, th { border: 1px solid GrayText; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
  .relative-link { text-decoration: underline dotted; }
  .relative-link-note { padding: 8px 12px; border-left: 3px solid GrayText; font-size: 14px; }
</style>
<main>
${hasRelativeLinks ? '<p class="relative-link-note">部分链接指向原项目中的其他文件或目录，请从原项目打开。</p>' : ""}
${template.innerHTML}
</main>
</html>`;
}
