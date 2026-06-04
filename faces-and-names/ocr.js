/* =====================================================================
 * OCR — lazy wrapper around Tesseract.js for reading names off
 * uploaded screenshots.
 *
 * Tesseract is loaded from a CDN on first use. If it can't load (the
 * user is offline or the network blocks the CDN), initOCR() rejects and
 * the caller falls back to manual entry — so OCR is purely additive and
 * never blocks the core app.
 * ===================================================================== */

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load OCR engine'));
    document.head.appendChild(s);
    // Guard against a CDN that hangs forever.
    setTimeout(() => reject(new Error('OCR engine load timed out')), 15000);
  });
}

/**
 * Initialise the OCR engine.
 * @param {(progress:number)=>void} onProgress 0..1 progress callback.
 * @returns {Promise<{recognize:(img:string)=>Promise<string>}>}
 */
export async function initOCR(onProgress = () => {}) {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(TESSERACT_CDN);
      const worker = await window.Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            onProgress(m.progress);
          }
        },
      });
      return worker;
    })().catch((err) => {
      // Reset so a later attempt (e.g. back online) can retry.
      workerPromise = null;
      throw err;
    });
  }

  const worker = await workerPromise;
  return {
    async recognize(image) {
      const { data } = await worker.recognize(image);
      return data.text || '';
    },
  };
}
