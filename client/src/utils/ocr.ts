declare const puter: any;

/** Returns true if the file type is worth running OCR on */
export function isOcrTarget(mimeType: string): boolean {
  return /^image\//i.test(mimeType) || mimeType === 'application/pdf';
}

/**
 * Run OCR using Puter.js (free, client-side, backed by AWS Textract / Mistral).
 * Throws if Puter is unavailable or OCR fails.
 */
export async function runOcr(file: File): Promise<string> {
  if (typeof puter === 'undefined' || !puter?.ai?.img2txt) {
    throw new Error('Puter.js not loaded');
  }
  const result = await puter.ai.img2txt(file);
  // Puter v2 returns a string directly
  return typeof result === 'string' ? result : (result?.text ?? '');
}
