// src/components/ui/SummaryCard.tsx
'use client';

import { ReactNode } from 'react';

interface SummaryCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  colorScheme?: 'primary' | 'success' | 'danger' | 'warning';
}

const colorMap = {
  primary: {
    bg: 'bg-primary-50',
    icon: 'bg-primary-100 text-primary-600',
    value: 'text-gray-900',
  },
  success: {
    bg: 'bg-success-50',
    icon: 'bg-success-100 text-success-600',
    value: 'text-success-700',
  },
  danger: {
    bg: 'bg-danger-50',
    icon: 'bg-danger-100 text-danger-600',
    value: 'text-danger-700',
  },
  warning: {
    bg: 'bg-warning-50',
    icon: 'bg-warning-100 text-warning-600',
    value: 'text-warning-700',
  },
};

export default function SummaryCard({
  title,
  value,
  icon,
  subtitle,
  colorScheme = 'primary',
}: SummaryCardProps) {
  const colors = colorMap[colorScheme];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 hover:shadow-lg hover:shadow-gray-100/50 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl ${colors.icon} flex items-center justify-center transition-transform group-hover:scale-110 duration-300`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <p className={`text-2xl sm:text-3xl font-bold ${colors.value} tracking-tight`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-1.5 font-medium">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
