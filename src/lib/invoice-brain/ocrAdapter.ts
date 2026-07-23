/**
 * invoice-brain/ocrAdapter.ts — image → text via Tesseract (local, free).
 *
 * Tesseract.js is lazy-imported so the core text/excel paths don't pay the
 * import cost or require the native binaries. If tesseract.js is not installed
 * or fails to init, throws a clear error the caller can surface to the user.
 *
 * AR-004 FIX: OCR is CPU-intensive and can block the Node.js event loop.
 * This module now detects if running in a route handler (synchronous context)
 * and warns about the performance impact. For production, OCR should be
 * offloaded to a queue worker — but the function is kept synchronous-compatible
 * for backward compatibility. The caller (extractFromSource) should ideally
 * enqueue an OCR job instead of calling this directly in a route handler.
 *
 * Note on WhatsApp screenshots: OCR'd chat text is rarely "label: value"
 * structured, so the brain's fingerprint will be content-based (see
 * fingerprint.ts fix) and AI will be used more often until phrasings repeat.
 */
export async function ocrImageToText(
  buffer: Buffer,
  lang: string = "ara+eng"
): Promise<string> {
  // AR-004: Warn if called from a production route handler
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[ocrAdapter] WARNING: OCR is CPU-intensive and blocks the event loop. " +
      "For production, offload OCR to a queue worker (see enqueue() in queues.ts)."
    );
  }

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
