const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const TARGET_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_BYTES * 0.88);
const MAX_DIMENSION = 2400;

export const supportedOrderImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PreparedOrderScreenshot = {
  file: File;
  wasCompressed: boolean;
};

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image"));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function compressedName(fileName: string) {
  const name = fileName.replace(/\.[^.]+$/, "") || "order-screenshot";
  return `${name}-compressed.jpg`;
}

/** Keeps phone screenshots below the Vercel multipart body limit entirely in-browser. */
export async function prepareOrderScreenshot(file: File): Promise<PreparedOrderScreenshot> {
  if (file.size <= MAX_UPLOAD_BYTES) return { file, wasCompressed: false };

  const image = await loadImage(file);
  const sourceScale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  let scale = sourceScale;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.9, 0.82, 0.74, 0.66]) {
      const blob = await canvasBlob(canvas, quality);
      if (blob && blob.size <= TARGET_UPLOAD_BYTES) {
        return {
          file: new File([blob], compressedName(file.name), { type: "image/jpeg", lastModified: Date.now() }),
          wasCompressed: true,
        };
      }
    }

    scale *= 0.78;
  }

  throw new Error("Image remains too large after compression");
}
