/**
 * CameraCapturePage — mobile-first OCR invoice capture
 *
 * Three ways to get an image:
 *  1. "Take Photo"        — native camera via <input capture="environment">
 *                           Works on HTTP, no HTTPS needed, most reliable on mobile.
 *  2. "Choose from Gallery" — file picker (existing photos/PDFs)
 *  3. "Live Camera"       — getUserMedia() stream with in-browser capture
 *                           Best for framing but requires HTTPS on remote devices.
 *
 * After an image is selected:
 *  → Upload to /api/invoices/upload → Tesseract OCR runs server-side
 *  → Review panel: raw text + editable parsed fields
 *  → "Apply to New Invoice" pre-fills the invoice form via sessionStorage
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Upload, X, CheckCircle, RefreshCw, FileText,
  Loader2, Eye, Edit3, ImagePlus, Video, Info,
} from 'lucide-react';
import api from '../utils/api';
import { OcrUploadResult, ParsedInvoiceData } from '../types';
import { formatCurrency } from '../utils/format';
import ErrorAlert from '../components/ErrorAlert';

type Step = 'capture' | 'uploading' | 'review';

// Detect mobile browser (used for UI hints only)
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

export default function CameraCapturePage() {
  const navigate = useNavigate();

  // Refs for the three input paths
  const nativeCameraRef = useRef<HTMLInputElement>(null); // capture="environment"
  const galleryRef = useRef<HTMLInputElement>(null);       // gallery / any file
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [step, setStep] = useState<Step>('capture');
  const [liveActive, setLiveActive] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<OcrUploadResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [parsedFields, setParsedFields] = useState<ParsedInvoiceData>({});
  const [activeTab, setActiveTab] = useState<'parsed' | 'raw'>('parsed');

  // Stop live camera on unmount
  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);

  // ── Path 1: Native camera (most reliable on mobile) ──────────────────────
  function handleNativeCameraFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlob(file);
    e.target.value = '';
  }

  // ── Path 2: Gallery / file picker ────────────────────────────────────────
  function handleGalleryFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlob(file);
    e.target.value = '';
  }

  // ── Path 3: getUserMedia live stream ──────────────────────────────────────
  async function startLiveCamera() {
    setLiveError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
      setLiveActive(true);
    } catch (err: any) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in your browser settings.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : err.name === 'NotSupportedError' || err.name === 'SecurityError'
          ? 'Live camera requires HTTPS. Use "Take Photo" instead — it works on HTTP.'
          : `Camera error: ${err.message}`;
      setLiveError(msg);
    }
  }

  function stopLiveCamera() {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setLiveActive(false);
  }

  async function flipCamera() {
    stopLiveCamera();
    setFacingMode(m => m === 'environment' ? 'user' : 'environment');
    setTimeout(startLiveCamera, 100);
  }

  function captureFromLive() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      stopLiveCamera();
      setBlob(blob);
    }, 'image/jpeg', 0.92);
  }

  // ── Shared: set blob + preview ────────────────────────────────────────────
  function setBlob(blob: Blob | File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    stopLiveCamera();
  }

  // ── Upload to server for OCR ──────────────────────────────────────────────
  async function handleUpload() {
    if (!capturedBlob) return;
    setStep('uploading');
    setUploadError('');
    try {
      const fd = new FormData();
      const ext = capturedBlob.type === 'application/pdf' ? '.pdf'
        : capturedBlob.type.includes('png') ? '.png' : '.jpg';
      fd.append('file', capturedBlob, `capture${ext}`);
      const result = await api.upload<OcrUploadResult>('/invoices/upload', fd);
      setUploadResult(result);
      setParsedFields(result.parsed);
      setStep('review');
    } catch (err: any) {
      setUploadError(`Upload failed: ${err.message}`);
      setStep('capture');
    }
  }

  function handleApplyToInvoice() {
    sessionStorage.setItem('ocr_prefill', JSON.stringify(parsedFields));
    navigate('/invoices/new');
  }

  function handleReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setUploadResult(null);
    setUploadError('');
    setLiveError('');
    setStep('capture');
    setLiveActive(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Capture Invoice</h1>
        <p className="text-sm text-gray-500 mt-1">
          Take or upload a photo of an invoice to auto-fill fields with OCR.
        </p>
      </div>

      {uploadError && <ErrorAlert message={uploadError} />}

      {/* ── UPLOADING ─────────────────────────────────────────────────────── */}
      {step === 'uploading' && (
        <div className="card p-12 flex flex-col items-center gap-4 text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          <div className="text-center">
            <p className="font-medium text-gray-700 text-base">Processing OCR…</p>
            <p className="text-sm mt-1">Extracting text from your image. Usually 5–15 seconds.</p>
          </div>
        </div>
      )}

      {/* ── CAPTURE ───────────────────────────────────────────────────────── */}
      {step === 'capture' && (
        <div className="space-y-4">
          {/* Preview / viewfinder */}
          <div className="card overflow-hidden bg-gray-950 rounded-xl relative flex items-center justify-center"
               style={{ minHeight: 260, aspectRatio: '4/3' }}>
            {liveActive ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted
                  className="w-full h-full object-cover" />
                {/* Viewfinder corners */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-6 border-2 border-white/30 rounded-lg" />
                  {[['top-8 left-8','border-t-2 border-l-2'],
                    ['top-8 right-8','border-t-2 border-r-2'],
                    ['bottom-8 left-8','border-b-2 border-l-2'],
                    ['bottom-8 right-8','border-b-2 border-r-2']
                  ].map(([pos, borders], i) => (
                    <div key={i} className={`absolute ${pos} w-6 h-6 ${borders} border-white`} />
                  ))}
                  <div className="absolute bottom-4 left-0 right-0 text-center">
                    <span className="text-white/60 text-xs bg-black/40 px-2 py-0.5 rounded-full">
                      Align invoice within frame
                    </span>
                  </div>
                </div>
              </>
            ) : previewUrl ? (
              <img src={previewUrl} alt="Selected" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-gray-500 p-10">
                <Camera className="w-14 h-14 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No image selected</p>
                <p className="text-xs mt-1 opacity-60">Choose an option below</p>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {liveError && <ErrorAlert message={liveError} />}

          {/* ── Option buttons ────────────────────────────────────────────── */}
          {!liveActive && !previewUrl && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Path 1: Native camera — most reliable on mobile */}
              <OptionCard
                icon={<Camera className="w-6 h-6 text-blue-600" />}
                title="Take Photo"
                desc={IS_MOBILE ? "Opens your camera directly" : "Use device camera"}
                badge={IS_MOBILE ? "Best for mobile" : undefined}
                badgeColor="bg-blue-100 text-blue-700"
                onClick={() => nativeCameraRef.current?.click()}
              />
              <input
                ref={nativeCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleNativeCameraFile}
              />

              {/* Path 2: Gallery / file picker */}
              <OptionCard
                icon={<ImagePlus className="w-6 h-6 text-violet-600" />}
                title="Choose from Gallery"
                desc="Pick an existing photo or PDF"
                onClick={() => galleryRef.current?.click()}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleGalleryFile}
              />

              {/* Path 3: Live camera (HTTPS only) */}
              <OptionCard
                icon={<Video className="w-6 h-6 text-emerald-600" />}
                title="Live Camera"
                desc="In-browser viewfinder"
                badge={IS_MOBILE ? "Needs HTTPS" : undefined}
                badgeColor="bg-yellow-100 text-yellow-700"
                onClick={startLiveCamera}
              />
            </div>
          )}

          {/* Live camera controls */}
          {liveActive && (
            <div className="flex gap-3 justify-center">
              <button
                onClick={captureFromLive}
                className="btn-primary px-10 py-3 text-base rounded-full"
              >
                <Camera className="w-5 h-5" /> Capture
              </button>
              <button onClick={flipCamera} className="btn-secondary rounded-full px-4">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={stopLiveCamera} className="btn-secondary rounded-full px-4">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Preview controls */}
          {previewUrl && !liveActive && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleUpload}
                className="btn-primary flex-1 justify-center py-3 text-base"
              >
                <Eye className="w-5 h-5" /> Extract Text (OCR)
              </button>
              <button onClick={handleReset} className="btn-secondary px-5">
                <RefreshCw className="w-4 h-4" /> Retake
              </button>
            </div>
          )}

          {/* Mobile tip */}
          {!liveActive && !previewUrl && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>On mobile:</strong> "Take Photo" opens your rear camera directly and
                works on any network (HTTP or HTTPS). "Live Camera" requires HTTPS.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── REVIEW ────────────────────────────────────────────────────────── */}
      {step === 'review' && uploadResult && (
        <div className="space-y-4">
          {/* Header */}
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

          {/* Image + OCR results side by side on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b text-sm font-medium text-gray-600">
                Captured Image
              </div>
              <img
                src={uploadResult.storedPath}
                alt="Uploaded invoice"
                className="w-full object-contain max-h-80"
              />
            </div>

            <div className="card overflow-hidden flex flex-col">
              <div className="flex border-b">
                {(['parsed', 'raw'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      activeTab === tab
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'parsed'
                      ? <><Edit3 className="w-3.5 h-3.5" /> Parsed Fields</>
                      : <><FileText className="w-3.5 h-3.5" /> Raw Text</>}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-auto p-4 max-h-80">
                {activeTab === 'raw' ? (
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
                    {uploadResult.ocrText || '(No text detected)'}
                  </pre>
                ) : (
                  <ParsedFieldsEditor fields={parsedFields} onChange={setParsedFields} />
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
              <div className="overflow-x-auto">
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
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button onClick={handleReset} className="btn-secondary sm:w-auto">
              <X className="w-4 h-4" /> Discard
            </button>
            <button
              onClick={handleApplyToInvoice}
              className="btn-primary flex-1 justify-center py-3 text-base"
            >
              <CheckCircle className="w-5 h-5" /> Apply to New Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Option card ───────────────────────────────────────────────────────────────
function OptionCard({
  icon, title, desc, badge, badgeColor, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  badgeColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card flex flex-col items-center gap-2 p-5 hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-gray-800 text-sm">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      {badge && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Parsed fields editor ──────────────────────────────────────────────────────
function ParsedFieldsEditor({
  fields, onChange,
}: {
  fields: ParsedInvoiceData;
  onChange: (f: ParsedInvoiceData) => void;
}) {
  function set(key: keyof ParsedInvoiceData, value: string | number | undefined) {
    onChange({ ...fields, [key]: value || undefined });
  }

  const hasAny = fields.invoiceNumber || fields.customerName || fields.total ||
    fields.subtotal || fields.issueDate || fields.dueDate || fields.poNumber;

  if (!hasAny) {
    return (
      <div className="text-center py-6 text-gray-400">
        <p className="text-sm">No structured data detected.</p>
        <p className="text-xs mt-1">Check "Raw Text" to see what was extracted.</p>
        <p className="text-xs mt-1">You can still apply to a new invoice and fill fields manually.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-sm">
      <p className="text-xs text-gray-400 mb-3">Review and edit before creating the invoice.</p>
      <Field label="Invoice #"    value={fields.invoiceNumber || ''} onChange={v => set('invoiceNumber', v)} />
      <Field label="Customer"     value={fields.customerName  || ''} onChange={v => set('customerName',  v)} />
      <Field label="PO Number"    value={fields.poNumber      || ''} onChange={v => set('poNumber',      v)} />
      <Field label="Issue Date"   value={fields.issueDate     || ''} onChange={v => set('issueDate',     v)} type="date" />
      <Field label="Due Date"     value={fields.dueDate       || ''} onChange={v => set('dueDate',       v)} type="date" />
      <Field label="Subtotal"     value={fields.subtotal   != null ? String(fields.subtotal)  : ''} onChange={v => set('subtotal',  v ? parseFloat(v) : undefined)} type="number" />
      <Field label="Tax"          value={fields.taxAmount  != null ? String(fields.taxAmount) : ''} onChange={v => set('taxAmount', v ? parseFloat(v) : undefined)} type="number" />
      <Field label="Total"        value={fields.total      != null ? String(fields.total)     : ''} onChange={v => set('total',     v ? parseFloat(v) : undefined)} type="number" />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-5 gap-2 items-center">
      <label className="col-span-2 text-gray-500 text-xs text-right pr-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="col-span-3 input text-xs py-1.5"
      />
    </div>
  );
}
