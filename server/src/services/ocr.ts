/**
 * OCR Service — pluggable provider architecture.
 * Default: Tesseract.js (open source).
 * Can be swapped for Google Vision or AWS Textract via env var OCR_PROVIDER.
 */
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

export interface OcrResult {
  text: string;
  confidence: number;
  provider: string;
}

export interface OcrProvider {
  extractText(imagePath: string): Promise<OcrResult>;
}

// ── Tesseract.js provider ─────────────────────────────────────────────────────
class TesseractProvider implements OcrProvider {
  async extractText(imagePath: string): Promise<OcrResult> {
    const result = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}, // suppress progress logs
    });
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      provider: 'tesseract',
    };
  }
}

// ── Google Vision stub (configurable) ────────────────────────────────────────
class GoogleVisionProvider implements OcrProvider {
  async extractText(imagePath: string): Promise<OcrResult> {
    // Requires: npm install @google-cloud/vision
    // and GOOGLE_APPLICATION_CREDENTIALS env var
    try {
      // Dynamic import so it doesn't crash if library not installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const vision = require('@google-cloud/vision');
      const client = new vision.ImageAnnotatorClient();
      const [result] = await client.textDetection(imagePath);
      const detections = result.textAnnotations || [];
      const text = detections.length > 0 ? detections[0].description || '' : '';
      return { text, confidence: 95, provider: 'google-vision' };
    } catch {
      throw new Error('Google Vision provider not configured. Install @google-cloud/vision and set GOOGLE_APPLICATION_CREDENTIALS.');
    }
  }
}

// ── AWS Textract stub ─────────────────────────────────────────────────────────
class AwsTextractProvider implements OcrProvider {
  async extractText(imagePath: string): Promise<OcrResult> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');
      const client = new TextractClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const imageBytes = fs.readFileSync(imagePath);
      const command = new DetectDocumentTextCommand({
        Document: { Bytes: imageBytes },
      });
      const response = await client.send(command);
      const blocks = response.Blocks || [];
      const lines = blocks
        .filter((b: { BlockType: string; Text?: string }) => b.BlockType === 'LINE' && b.Text)
        .map((b: { BlockType: string; Text?: string }) => b.Text as string);
      return { text: lines.join('\n'), confidence: 90, provider: 'aws-textract' };
    } catch {
      throw new Error('AWS Textract provider not configured. Install @aws-sdk/client-textract and set AWS credentials.');
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────
function createOcrProvider(): OcrProvider {
  const provider = (process.env.OCR_PROVIDER || 'tesseract').toLowerCase();
  switch (provider) {
    case 'google-vision':
    case 'google':
      return new GoogleVisionProvider();
    case 'aws-textract':
    case 'aws':
      return new AwsTextractProvider();
    default:
      return new TesseractProvider();
  }
}

let _provider: OcrProvider | null = null;
function getProvider(): OcrProvider {
  if (!_provider) _provider = createOcrProvider();
  return _provider;
}

export async function extractTextFromImage(imagePath: string): Promise<OcrResult> {
  return getProvider().extractText(imagePath);
}

// Allow injecting a provider in tests
export function setOcrProvider(p: OcrProvider): void {
  _provider = p;
}
