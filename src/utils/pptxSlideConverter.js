const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 900;

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The slide could not be rendered as an image."));
    }, "image/png");
  });
}

/**
 * Renders a PPT/PPTX buffer with the same browser renderer used by the viewer,
 * then rasterizes each rendered slide to a stable 16:9 PNG. This runs only in
 * the admin publish flow; learners receive the resulting images from Storage.
 */
export async function convertPptxToPngs(buffer, options = {}) {
  if (typeof document === "undefined") {
    throw new Error("PPTX conversion is available in the browser publish flow only.");
  }

  const [{ init }, html2canvasModule] = await Promise.all([
    import("pptx-preview"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default || html2canvasModule;
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "visible",
    background: "#ffffff",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(container);

  let viewer;
  try {
    viewer = init(container, { width, height, mode: "list" });
    await viewer.preview(buffer);
    await waitForPaint();

    const wrappers = [...container.querySelectorAll("[class*='pptx-preview-slide-wrapper-']")]
      .sort((left, right) => {
        const getIndex = (node) => Number([...node.classList].find((name) => name.startsWith("pptx-preview-slide-wrapper-"))?.replace("pptx-preview-slide-wrapper-", ""));
        return getIndex(left) - getIndex(right);
      });
    if (!wrappers.length) throw new Error("No slides were found in the PPTX file.");

    const slides = [];
    for (const wrapper of wrappers) {
      const canvas = await html2canvas(wrapper, {
        backgroundColor: "#ffffff",
        scale: 1,
        useCORS: true,
        logging: false,
        removeContainer: true,
      });
      slides.push({ blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height });
    }
    return slides;
  } finally {
    viewer?.destroy?.();
    container.remove();
  }
}

export function isPptxFile(fileOrName) {
  const name = typeof fileOrName === "string" ? fileOrName : fileOrName?.name || "";
  const type = typeof fileOrName === "string" ? "" : fileOrName?.type || "";
  return /(?:application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation|application\/vnd\.ms-powerpoint|\.pptx?$)/i.test(`${type} ${name}`);
}
