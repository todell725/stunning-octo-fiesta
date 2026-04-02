import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CameraCapturePage from '../pages/CameraCapturePage';

vi.mock('../utils/api', () => ({
  default: {
    upload: vi.fn().mockResolvedValue({
      storedPath: '/uploads/test.jpg',
      storedName: 'test.jpg',
      originalName: 'invoice.jpg',
      mimeType: 'image/jpeg',
      size: 12345,
      ocrText: 'Invoice Number: INV-2024-0001\nTotal: $500.00',
      confidence: 85,
      parsed: { invoiceNumber: 'INV-2024-0001', total: 500 },
    }),
  },
}));

const mockStop = vi.fn();
const mockGetUserMedia = vi.fn();
Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CameraCapturePage />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('CameraCapturePage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('Capture Invoice')).toBeInTheDocument();
  });

  it('shows all three capture option cards', () => {
    renderPage();
    expect(screen.getByText('Take Photo')).toBeInTheDocument();
    expect(screen.getByText('Choose from Gallery')).toBeInTheDocument();
    expect(screen.getByText('Live Camera')).toBeInTheDocument();
  });

  it('Take Photo button has a hidden file input with capture="environment"', () => {
    renderPage();
    const inputs = document.querySelectorAll('input[type="file"]');
    const captureInput = Array.from(inputs).find(
      el => el.getAttribute('capture') === 'environment'
    );
    expect(captureInput).toBeTruthy();
    expect(captureInput?.getAttribute('accept')).toContain('image/*');
  });

  it('Gallery input accepts images and PDFs', () => {
    renderPage();
    const inputs = document.querySelectorAll('input[type="file"]');
    const galleryInput = Array.from(inputs).find(
      el => !el.getAttribute('capture') && el.getAttribute('accept')?.includes('pdf')
    );
    expect(galleryInput).toBeTruthy();
  });

  it('shows mobile tip text', () => {
    renderPage();
    expect(screen.getByText(/Take Photo.*opens your rear camera/i)).toBeInTheDocument();
  });

  it('shows live camera error when getUserMedia is denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce({ name: 'NotAllowedError', message: '' });
    renderPage();
    fireEvent.click(screen.getByText('Live Camera'));
    await screen.findByText(/Camera permission denied/i);
  });

  it('shows HTTPS error when SecurityError occurs', async () => {
    mockGetUserMedia.mockRejectedValueOnce({ name: 'SecurityError', message: '' });
    renderPage();
    fireEvent.click(screen.getByText('Live Camera'));
    await screen.findByText(/requires HTTPS/i);
  });

  it('shows live camera controls after getUserMedia resolves', async () => {
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    } as unknown as MediaStream;
    mockGetUserMedia.mockResolvedValueOnce(mockStream);
    renderPage();
    fireEvent.click(screen.getByText('Live Camera'));
    await screen.findByText('Capture');
    expect(screen.getByText('Capture')).toBeInTheDocument();
  });

  it('shows Retake and Extract buttons after a gallery file is selected', () => {
    renderPage();
    const inputs = document.querySelectorAll('input[type="file"]');
    const galleryInput = Array.from(inputs).find(
      el => !el.getAttribute('capture')
    ) as HTMLInputElement;

    const file = new File(['fake'], 'invoice.jpg', { type: 'image/jpeg' });
    Object.defineProperty(galleryInput, 'files', { value: [file] });
    fireEvent.change(galleryInput);

    expect(screen.getByText(/Extract Text/i)).toBeInTheDocument();
    expect(screen.getByText('Retake')).toBeInTheDocument();
  });
});
