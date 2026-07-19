/**
 * invoice-brain/ocrAdapter.ts — image → text via Tesseract (local, free).
 *
 * Tesseract.js is lazy-imported so the core text/excel paths don't pay the
 * import cost or require the native binaries. If tesseract.js is not installed
 * or fails to init, throws a clear error the caller can surface to the user.
 *
 * Note on WhatsApp screenshots: OCR'd chat text is rarely "label: value"
 * structured, so the brain's fingerprint will be content-based (see
 * fingerprint.ts fix) and AI will be used more often until phrasings repeat.
 */
export async function ocrImageToText(
  buffer: Buffer,
  lang: string = "ara+eng"
): Promise<string> {
  let createWorker: typeof import("tesseract.js").createWorker;
  try {
    // Lazy import — keeps tesseract.js out of the hot path
    const mod = await import("tesseract.js");
    createWorker = mod.createWorker;
  } catch {
    throw new Error(
      "OCR غير متاح — tesseract.js غير مثبت. ثبته لإتاحة استخلاص الفواتير من الصور."
    );
  }

  const worker = await createWorker(lang);
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text;
  } finally {
    await worker.terminate();
  }
}
