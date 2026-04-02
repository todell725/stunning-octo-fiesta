import React from 'react';
import { STATUS_COLORS, STATUS_LABELS } from '../utils/format';

interface Props {
  status: string;
}

export default function StatusBadge({ status }: Props) {
  return (
    <span className={`status-badge ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
