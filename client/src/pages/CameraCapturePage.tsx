/**
 * CameraCapturePage
 *
 * Mobile-first OCR invoice capture flow:
 * 1. User opens camera (getUserMedia) or picks a file
 * 2. Photo is uploaded to /api/invoices/upload
 * 3. Server runs Tesseract.js OCR and returns raw text + parsed fields
 * 4. User reviews/edits the parsed fields in the OCR review panel
 * 5. User clicks "Create Invoice" → fields are stored in sessionStorage
 *    and the user is redirected to the invoice form (pre-filled)
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Upload, X, CheckCircle, RefreshCw, FileText, Loader2,
  Eye, Edit3
} from 'lucide-react';
import api from '../utils/api';
import { OcrUploadResult, ParsedInvoiceData } from '../types';
import { formatCurrency } from '../utils/format';
import ErrorAlert from '../components/ErrorAlert';

type Step = 'capture' | 'uploading' | 'review';

export default function CameraCapturePage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('capture');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<OcrUploadResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Editable parsed fields
  const [parsedFields, setParsedFields] = useState<ParsedInvoiceData>({});
  const [activeTab, setActiveTab] = useState<'raw' | 'parsed'>('parsed');

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  // ── Camera control ──────────────────────────────────────────────────────
  async function startCamera() {
    setCameraError('');
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : `Camera error: ${err.message}`
      );
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraActive(false);
  }

  async function flipCamera() {
    stopCamera();
    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
    setTimeout(startCamera, 100);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  }

  // ── File upload fallback ─────────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    stopCamera();
    e.target.value = '';
  }

  // ── Upload to server for OCR ─────────────────────────────────────────────
  async function handleUpload() {
    if (!capturedBlob) return;
    setStep('uploading');
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', capturedBlob, 'capture.jpg');
      const result = await api.upload<OcrUploadResult>('/invoices/upload', fd);
      setUploadResult(result);
      setParsedFields(result.parsed);
      setStep('review');
    } catch (err: any) {
      setUploadError(`Upload failed: ${err.message}`);
      setStep('capture');
    }
  }

  // ── Apply to invoice ─────────────────────────────────────────────────────
  function handleApplyToInvoice() {
    sessionStorage.setItem('ocr_prefill', JSON.stringify(parsedFields));
    navigate('/invoices/new');
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  function handleReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setUploadResult(null);
    setUploadError('');
    setStep('capture');
    setCameraActive(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Capture Invoice</h1>
        <p className="text-sm text-gray-500 mt-1">
          Take a photo or upload an image to extract invoice data via OCR.
        </p>
      </div>

      {uploadError && <ErrorAlert message={uploadError} />}

      {/* STEP: Uploading */}
      {step === 'uploading' && (
        <div className="card p-10 flex flex-col items-center gap-4 text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          <div className="text-center">
            <p className="font-medium text-gray-700">Processing OCR...</p>
            <p className="text-sm mt-1">Extracting text from your image. This may take a few seconds.</p>
          </div>
        </div>
      )}

      {/* STEP: Capture */}
      {step === 'capture' && (
        <div className="space-y-4">
          {/* Camera preview */}
          <div className="card overflow-hidden bg-black aspect-video relative flex items-center justify-center">
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Viewfinder overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-8 border-2 border-white/40 rounded-lg" />
                  <div className="absolute top-10 left-10 w-5 h-5 border-t-2 border-l-2 border-white" />
                  <div className="absolute top-10 right-10 w-5 h-5 border-t-2 border-r-2 border-white" />
                  <div className="absolute bottom-10 left-10 w-5 h-5 border-b-2 border-l-2 border-white" />
                  <div className="absolute bottom-10 right-10 w-5 h-5 border-b-2 border-r-2 border-white" />
                </div>
              </>
            ) : previewUrl ? (
              <img src={previewUrl} alt="Captured" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-gray-400 p-8">
                <Camera className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Camera preview will appear here</p>
                <p className="text-xs mt-1 opacity-70">
                  Use the buttons below to open the camera or upload a file
                </p>
              </div>
            )}
          </div>

          {/* Hidden canvas for snapshot */}
          <canvas ref={canvasRef} className="hidden" />

          {cameraError && <ErrorAlert message={cameraError} />}

          {/* Controls */}
          <div className="flex flex-wrap gap-2 justify-center">
            {!cameraActive && !previewUrl && (
              <>
                <button onClick={startCamera} className="btn-primary">
                  <Camera className="w-4 h-4" /> Open Camera
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                  <Upload className="w-4 h-4" /> Upload Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </>
            )}

            {cameraActive && (
              <>
                <button onClick={capturePhoto} className="btn-primary px-8 py-3 text-base">
                  <Camera className="w-5 h-5" /> Capture
                </button>
                <button onClick={flipCamera} className="btn-secondary">
                  <RefreshCw className="w-4 h-4" /> Flip
                </button>
                <button onClick={stopCamera} className="btn-secondary">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </>
            )}

            {previewUrl && !cameraActive && (
              <>
                <button onClick={handleUpload} className="btn-primary px-6">
                  <Eye className="w-4 h-4" /> Extract Text (OCR)
                </button>
                <button onClick={handleReset} className="btn-secondary">
                  <RefreshCw className="w-4 h-4" /> Retake
                </button>
              </>
            )}
          </div>

          {/* Mobile hint */}
          <p className="text-xs text-center text-gray-400">
            On mobile, tap "Open Camera" to use your phone's camera.
            The "Upload Image" option works on all devices.
          </p>
        </div>
      )}

      {/* STEP: Review OCR results */}
      {step === 'review' && uploadResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium text-sm">
                OCR complete — {uploadResult.confidence.toFixed(0)}% confidence
              </span>
            </div>
            <button onClick={handleReset} className="btn-secondary btn-sm">
              <RefreshCw className="w-3.5 h-3.5" /> New Capture
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Image preview */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b text-sm font-medium text-gray-600">
                Captured Image
              </div>
              <img
                src={uploadResult.storedPath}
                alt="Uploaded invoice"
                className="w-full object-contain max-h-72"
              />
            </div>

            {/* OCR tabs */}
            <div className="card overflow-hidden flex flex-col">
              <div className="flex border-b">
                <button
                  onClick={() => setActiveTab('parsed')}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'parsed'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 inline mr-1" /> Parsed Fields
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'raw'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 inline mr-1" /> Raw Text
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {activeTab === 'raw' ? (
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
                    {uploadResult.ocrText || '(No text detected)'}
                  </pre>
                ) : (
                  <ParsedFieldsEditor
                    fields={parsedFields}
                    onChange={setParsedFields}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Line items preview */}
          {parsedFields.lineItems && parsedFields.lineItems.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b text-sm font-medium text-gray-600">
                Detected Line Items
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Description</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Qty</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Price</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {parsedFields.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{li.description}</td>
                      <td className="px-4 py-2 text-right">{li.quantity}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(li.unitPrice)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(li.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 justify-end pt-2">
            <button onClick={handleReset} className="btn-secondary">
              <X className="w-4 h-4" /> Discard
            </button>
            <button onClick={handleApplyToInvoice} className="btn-primary px-6">
              <CheckCircle className="w-4 h-4" /> Apply to New Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Editable parsed fields component ─────────────────────────────────────────
function ParsedFieldsEditor({
  fields,
  onChange,
}: {
  fields: ParsedInvoiceData;
  onChange: (f: ParsedInvoiceData) => void;
}) {
  function set(key: keyof ParsedInvoiceData, value: string | number | undefined) {
    onChange({ ...fields, [key]: value });
  }

  const hasAny = Object.values(fields).some((v) => v !== undefined && v !== null && v !== '');

  if (!hasAny) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-sm">No structured data detected.</p>
        <p className="text-xs mt-1">Check the "Raw Text" tab to see what was extracted.</p>
        <p className="text-xs mt-1">You can still apply to a new invoice and fill manually.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-gray-400">Review and edit extracted fields before creating the invoice.</p>
      <Field
        label="Invoice Number"
        value={fields.invoiceNumber || ''}
        onChange={(v) => set('invoiceNumber', v)}
      />
      <Field
        label="Customer Name"
        value={fields.customerName || ''}
        onChange={(v) => set('customerName', v)}
      />
      <Field
        label="PO Number"
        value={fields.poNumber || ''}
        onChange={(v) => set('poNumber', v)}
      />
      <Field
        label="Issue Date"
        type="date"
        value={fields.issueDate || ''}
        onChange={(v) => set('issueDate', v)}
      />
      <Field
        label="Due Date"
        type="date"
        value={fields.dueDate || ''}
        onChange={(v) => set('dueDate', v)}
      />
      <Field
        label="Subtotal"
        type="number"
        value={fields.subtotal !== undefined ? String(fields.subtotal) : ''}
        onChange={(v) => set('subtotal', v ? parseFloat(v) : undefined)}
      />
      <Field
        label="Tax Amount"
        type="number"
        value={fields.taxAmount !== undefined ? String(fields.taxAmount) : ''}
        onChange={(v) => set('taxAmount', v ? parseFloat(v) : undefined)}
      />
      <Field
        label="Total"
        type="number"
        value={fields.total !== undefined ? String(fields.total) : ''}
        onChange={(v) => set('total', v ? parseFloat(v) : undefined)}
      />
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-2 gap-2 items-center">
      <label className="text-gray-500 text-xs">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input text-xs py-1.5"
      />
    </div>
  );
}
