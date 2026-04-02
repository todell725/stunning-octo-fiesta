import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
      <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
