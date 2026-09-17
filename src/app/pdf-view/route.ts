import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const query = searchParams.get("q") ?? "";
  const title = searchParams.get("title") ?? "";

  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  // This page is intentionally NOT rendered by React: it's a standalone
  // document (loaded in an <iframe>) that talks to pdf.js directly. This
  // isolates the canvas from the parent app's <html dir="rtl"> — that
  // attribute cascades to the canvas element's CSS `direction`, which
  // CanvasRenderingContext2D.direction defaults to "inherit" from. pdf.js's
  // text-drawing doesn't reset it, so under an inherited RTL direction every
  // text run's anchor point gets computed on the wrong side, producing
  // correct glyphs at wrong positions (garbled/uneven letter spacing). We
  // still want the surrounding UI (buttons, labels) to read RTL, so `dir`
  // stays "rtl" here too — the canvas itself is pinned back to "ltr" below.
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font-family: "Heebo", Arial, sans-serif;
    background: #f3eee3;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header, footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 10px 16px;
    background: #f3eee3;
    font-size: 13px;
    color: #7a7266;
    flex-shrink: 0;
  }
  header { border-bottom: 1px solid #e9e2d2; justify-content: space-between; }
  footer { border-top: 1px solid #e9e2d2; }
  #titleLabel { font-weight: 600; color: #241f1a; }
  main {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    padding: 16px;
  }
  .page-wrap { position: relative; width: fit-content; height: fit-content; direction: ltr; }
  canvas { display: block; direction: ltr; box-shadow: 0 2px 8px rgba(0,0,0,.15); border-radius: 4px; background: #fff; }
  .textLayer {
    position: absolute; inset: 0; overflow: clip; line-height: 1; opacity: 1;
    text-align: initial; transform-origin: 0 0; --total-scale-factor: 1; direction: ltr;
  }
  .textLayer span, .textLayer br {
    color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%;
  }
  .textLayer {
    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
  }
  .textLayer > :not(.markedContent), .textLayer .markedContent span:not(.markedContent) {
    z-index: 1;
    --font-height: 0;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    --scale-x: 1;
    --rotate: 0deg;
    transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
  }
  .textLayer .markedContent { display: contents; }
  .textLayer .pdf-search-match { background: rgba(253,224,71,.6); border-radius: 2px; }
  button {
    font-family: inherit; font-size: 13px; font-weight: 600; color: #241f1a;
    background: #fff; border: 1px solid #e9e2d2; border-radius: 8px; padding: 6px 14px; cursor: pointer;
  }
  button:disabled { opacity: .4; cursor: default; }
  .status { padding: 60px 20px; text-align: center; color: #7a7266; }
</style>
</head>
<body>
  <header>
    <span id="titleLabel">${escapeHtml(title)}</span>
    <span id="pageLabelTop"></span>
  </header>
  <main>
    <div id="statusOverlay" class="status">טוען...</div>
    <div class="page-wrap" id="pageWrap" style="display:none">
      <canvas id="pdf-canvas"></canvas>
      <div id="text-layer" class="textLayer"></div>
    </div>
  </main>
  <footer>
    <button id="prevBtn" type="button">הקודם</button>
    <span id="pageLabelBottom"></span>
    <button id="nextBtn" type="button">הבא</button>
  </footer>
  <script type="module">
    const state = {
      url: ${JSON.stringify(url)},
      page: ${JSON.stringify(page)},
      query: ${JSON.stringify(query)},
      doc: null,
      numPages: null,
    };

    const main = document.querySelector("main");
    const statusOverlay = document.getElementById("statusOverlay");
    const pageWrap = document.getElementById("pageWrap");
    const canvas = document.getElementById("pdf-canvas");
    const textLayerDiv = document.getElementById("text-layer");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    function setPageLabels() {
      const text = "עמ' " + state.page + (state.numPages ? " מתוך " + state.numPages : "");
      document.getElementById("pageLabelTop").textContent = text;
      document.getElementById("pageLabelBottom").textContent = state.page + " / " + (state.numPages ?? "…");
      prevBtn.disabled = state.page <= 1;
      nextBtn.disabled = !state.numPages || state.page >= state.numPages;
    }

    function showStatus(msg) {
      statusOverlay.textContent = msg;
      statusOverlay.style.display = "";
      pageWrap.style.display = "none";
    }

    function showPage() {
      statusOverlay.style.display = "none";
      pageWrap.style.display = "";
    }

    async function renderPage() {
      const pdfjsLib = window.__pdfjsLib;
      const pdfPage = await state.doc.getPage(state.page);

      const containerWidth = main.clientWidth || 800;
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(2.2, Math.max(0.6, (containerWidth - 32) / baseViewport.width));
      const viewport = pdfPage.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      // See the comment at the top of this file: pdf.js's text drawing does
      // not reset CanvasRenderingContext2D.direction, so it must be pinned
      // to "ltr" explicitly, not just via CSS, to avoid inheriting "rtl".
      ctx.direction = "ltr";
      await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

      textLayerDiv.replaceChildren();
      textLayerDiv.style.width = viewport.width + "px";
      textLayerDiv.style.height = viewport.height + "px";

      const textContent = await pdfPage.getTextContent();
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });
      await textLayer.render();

      const q = state.query.trim().toLowerCase();
      if (q) {
        let first = null;
        for (const div of textLayer.textDivs) {
          const text = div.textContent || "";
          if (text.toLowerCase().includes(q)) {
            div.classList.add("pdf-search-match");
            if (!first) first = div;
          }
        }
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
      }

      setPageLabels();
    }

    async function init() {
      showStatus("טוען...");
      const pdfjsLib = await import("/pdf.mjs");
      window.__pdfjsLib = pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      try {
        state.doc = await pdfjsLib.getDocument({
          url: state.url,
          cMapUrl: "/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/standard_fonts/",
        }).promise;
        state.numPages = state.doc.numPages;
      } catch (e) {
        showStatus("אירעה שגיאה בטעינת הקובץ.");
        throw e;
      }
      showPage();
      await renderPage();
    }

    prevBtn.addEventListener("click", async () => {
      if (state.page <= 1) return;
      state.page -= 1;
      state.query = "";
      await renderPage();
    });
    nextBtn.addEventListener("click", async () => {
      if (!state.numPages || state.page >= state.numPages) return;
      state.page += 1;
      state.query = "";
      await renderPage();
    });

    init();
  </script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
