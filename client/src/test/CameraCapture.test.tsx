/**
 * Smoke tests for the CameraCapturePage component.
 * Tests that the camera UI renders correctly and handles interactions.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CameraCapturePage from '../pages/CameraCapturePage';

// Mock the API module
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
      parsed: {
        invoiceNumber: 'INV-2024-0001',
        total: 500,
      },
    }),
  },
}));

// Mock getUserMedia
const mockGetUserMedia = vi.fn();
const mockStop = vi.fn();
Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
  },
  writable: true,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CameraCapturePage />
    </MemoryRouter>
  );
}

describe('CameraCapturePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('Capture Invoice')).toBeInTheDocument();
  });

  it('renders the Open Camera button', () => {
    renderPage();
    expect(screen.getByText('Open Camera')).toBeInTheDocument();
  });

  it('renders the Upload Image button', () => {
    renderPage();
    expect(screen.getByText('Upload Image')).toBeInTheDocument();
  });

  it('shows camera error when getUserMedia is denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce({ name: 'NotAllowedError', message: 'Permission denied' });

    renderPage();
    const cameraBtn = screen.getByText('Open Camera');
    fireEvent.click(cameraBtn);

    // After async rejection, error message should appear
    await screen.findByText(/Camera permission denied/i);
  });

  it('shows "No camera found" error on NotFoundError', async () => {
    mockGetUserMedia.mockRejectedValueOnce({ name: 'NotFoundError', message: 'Not found' });

    renderPage();
    fireEvent.click(screen.getByText('Open Camera'));

    await screen.findByText(/No camera found/i);
  });

  it('opens camera successfully when getUserMedia resolves', async () => {
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    } as unknown as MediaStream;
    mockGetUserMedia.mockResolvedValueOnce(mockStream);

    renderPage();
    fireEvent.click(screen.getByText('Open Camera'));

    // After camera opens, "Capture" button should appear
    await screen.findByText('Capture');
  });

  it('shows hint text about mobile usage', () => {
    renderPage();
    expect(screen.getByText(/On mobile, tap "Open Camera"/i)).toBeInTheDocument();
  });

  it('has a file input for upload fallback', () => {
    renderPage();
    // The hidden file input should exist
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
  });

  it('file input accepts image files', () => {
    renderPage();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput?.accept).toContain('image/*');
  });
});
