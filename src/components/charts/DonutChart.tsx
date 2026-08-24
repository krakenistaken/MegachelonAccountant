// src/components/charts/DonutChart.tsx
'use client';

import React, { useState } from 'react';

export interface DonutDataItem {
  name: string;
  total: number;
  percentage: number;
  count?: number;
}

interface DonutChartProps {
  title: string;
  subtitle?: string;
  data: DonutDataItem[];
  currency?: string;
  type?: 'Gelir' | 'Gider';
}

const EXPENSE_PALETTE = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#8b5cf6', // purple-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#06b6d4', // cyan-500
  '#64748b', // slate-500
];

const INCOME_PALETTE = [
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#14b8a6', // teal-500
  '#84cc16', // lime-500
  '#f59e0b', // amber-500
  '#6366f1', // indigo-500
  '#64748b', // slate-500
];

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calculateSlices(
  data: DonutDataItem[],
  totalSum: number,
  palette: string[],
  size: number
) {
  const center = size / 2;
  const radius = 80;
  const innerRadius = 55;

  return data.map((item, index) => {
    const previousTotal = data.slice(0, index).reduce((s, prev) => s + prev.total, 0);
    const startFraction = totalSum > 0 ? previousTotal / totalSum : 0;
    const itemFraction = totalSum > 0 ? item.total / totalSum : 0;

    const startAngle = -Math.PI / 2 + startFraction * 2 * Math.PI;
    const endAngle = startAngle + itemFraction * 2 * Math.PI;
    const angle = itemFraction * 2 * Math.PI;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    const x3 = center + innerRadius * Math.cos(endAngle);
    const y3 = center + innerRadius * Math.sin(endAngle);
    const x4 = center + innerRadius * Math.cos(startAngle);
    const y4 = center + innerRadius * Math.sin(startAngle);

    const largeArcFlag = angle > Math.PI ? 1 : 0;

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
      'Z',
    ].join(' ');

    const color = palette[index % palette.length];

    return {
      ...item,
      pathData,
      color,
      index,
    };
  });
}

export default function DonutChart({
  title,
  subtitle,
  data,
  currency = 'TRY',
  type = 'Gider',
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const palette = type === 'Gelir' ? INCOME_PALETTE : EXPENSE_PALETTE;
  const totalSum = data.reduce((acc, item) => acc + item.total, 0);
  const size = 200;
  const center = size / 2;

  if (!data || data.length === 0 || totalSum === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center justify-center min-h-[300px]">
        <h3 className="text-base font-bold text-gray-800 mb-1">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mb-2">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-gray-400">Bu dönemde {type.toLowerCase()} hareketi bulunamadı</p>
      </div>
    );
  }

  const slices = calculateSlices(data, totalSum, palette, size);
  const activeItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
              type === 'Gelir' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
            }`}
          >
            {type} Dağılımı
          </span>
        </div>

        {/* SVG Donut Graphic */}
        <div className="relative flex items-center justify-center my-4">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-48 h-48 sm:w-52 sm:h-52 transform transition-transform"
          >
            {slices.map((slice) => {
              const isHovered = hoveredIndex === slice.index;
              return (
                <path
                  key={slice.name}
                  d={slice.pathData}
                  fill={slice.color}
                  className="transition-all duration-200 cursor-pointer"
                  style={{
                    opacity: hoveredIndex === null || isHovered ? 1 : 0.6,
                    transformOrigin: `${center}px ${center}px`,
                    transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                  }}
                  onMouseEnter={() => setHoveredIndex(slice.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}
          </svg>

          {/* Center Info Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
            {activeItem ? (
              <>
                <span className="text-[11px] font-semibold text-gray-500 truncate max-w-[110px]">
                  {activeItem.name}
                </span>
                <span className="text-sm font-extrabold text-gray-900 leading-tight mt-0.5">
                  {formatCurrency(activeItem.total, currency)}
                </span>
                <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full mt-1">
                  %{activeItem.percentage.toFixed(1)}
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-medium text-gray-400">Toplam</span>
                <span className="text-sm font-extrabold text-gray-900 leading-tight mt-0.5">
                  {formatCurrency(totalSum, currency)}
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">{data.length} Kategori</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Legend / Category breakdown list */}
      <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 max-h-48 overflow-y-auto pr-1">
        {data.map((item, index) => {
          const color = palette[index % palette.length];
          const isHovered = hoveredIndex === index;

          return (
            <div
              key={item.name}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`flex items-center justify-between text-xs py-1 px-2 rounded-lg transition-colors cursor-pointer ${
                isHovered ? 'bg-gray-50 font-semibold' : 'text-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="truncate text-gray-800">{item.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-gray-900 font-semibold">{formatCurrency(item.total, currency)}</span>
                <span className="text-gray-400 text-[10px] w-10 text-right">
                  %{item.percentage.toFixed(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
