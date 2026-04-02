import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}

export default function Pagination({ page, pages, total, pageSize, onPageChange }: Props) {
  if (pages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium">{start}</span>–<span className="font-medium">{end}</span> of{' '}
        <span className="font-medium">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="btn-secondary btn-sm disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(5, pages) }, (_, i) => {
          let p = i + 1;
          if (pages > 5) {
            if (page <= 3) p = i + 1;
            else if (page >= pages - 2) p = pages - 4 + i;
            else p = page - 2 + i;
          }
          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`btn-sm rounded-md px-2.5 py-1 text-sm font-medium ${
                p === page ? 'bg-blue-600 text-white' : 'btn-secondary'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="btn-secondary btn-sm disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
