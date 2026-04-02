import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock-url'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
