// src/components/charts/BarChart.tsx
'use client';

import React, { useState } from 'react';

export interface BarChartPoint {
  date: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

interface BarChartProps {
  title: string;
  subtitle?: string;
  points: BarChartPoint[];
  currency?: string;
}

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BarChart({
  title,
  subtitle,
  points,
  currency = 'TRY',
}: BarChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<BarChartPoint | null>(null);

  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.income, p.expense)),
    100
  );

  const totalIncome = points.reduce((s, p) => s + p.income, 0);
  const totalExpense = points.reduce((s, p) => s + p.expense, 0);

  if (!points || points.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center justify-center min-h-[340px]">
        <h3 className="text-base font-bold text-gray-800 mb-1">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
        <p className="text-xs font-semibold text-gray-400">Bu dönem için grafik verisi bulunamadı</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-emerald-500 shadow-sm shadow-emerald-500/30" />
            <span className="text-gray-700">Gelir ({formatCurrency(totalIncome, currency)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-rose-500 shadow-sm shadow-rose-500/30" />
            <span className="text-gray-700">Gider ({formatCurrency(totalExpense, currency)})</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative pt-6 pb-2">
        {/* Tooltip Hover Overlay */}
        {hoveredPoint && (
          <div className="absolute top-0 right-0 z-10 bg-gray-900/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-xl text-xs shadow-lg flex items-center gap-3 animate-in fade-in duration-150">
            <span className="font-bold text-gray-300">{hoveredPoint.label}</span>
            <span className="text-emerald-400 font-semibold">+{formatCurrency(hoveredPoint.income, currency)}</span>
            <span className="text-rose-400 font-semibold">-{formatCurrency(hoveredPoint.expense, currency)}</span>
            <span className={`font-bold ${hoveredPoint.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              Fark: {hoveredPoint.net >= 0 ? '+' : '-'}{formatCurrency(hoveredPoint.net, currency)}
            </span>
          </div>
        )}

        {/* Gridlines */}
        <div className="absolute inset-x-0 top-8 bottom-8 flex flex-col justify-between pointer-events-none opacity-40">
          <div className="border-b border-dashed border-gray-200 w-full" />
          <div className="border-b border-dashed border-gray-200 w-full" />
          <div className="border-b border-dashed border-gray-200 w-full" />
        </div>

        {/* Bars Container */}
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div
            className="flex items-end gap-2 sm:gap-3 h-52 min-w-full px-1"
            style={{ minWidth: points.length > 15 ? `${points.length * 28}px` : 'auto' }}
          >
            {points.map((p, idx) => {
              const incomeHeightPercent = maxVal > 0 ? (p.income / maxVal) * 100 : 0;
              const expenseHeightPercent = maxVal > 0 ? (p.expense / maxVal) * 100 : 0;
              const isHovered = hoveredPoint?.date === p.date;

              return (
                <div
                  key={p.date || idx}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(p)}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  {/* Bars Pair */}
                  <div className="w-full flex items-end justify-center gap-1 h-44 pb-1">
                    {/* Income Bar */}
                    <div className="w-full max-w-[12px] bg-gray-100 rounded-t-md relative flex items-end h-full">
                      <div
                        style={{ height: `${Math.max(incomeHeightPercent, 3)}%` }}
                        className={`w-full rounded-t-md transition-all duration-300 ${
                          p.income > 0
                            ? isHovered
                              ? 'bg-emerald-400 shadow-md shadow-emerald-500/40 scale-y-105 origin-bottom'
                              : 'bg-emerald-500'
                            : 'bg-transparent'
                        }`}
                      />
                    </div>

                    {/* Expense Bar */}
                    <div className="w-full max-w-[12px] bg-gray-100 rounded-t-md relative flex items-end h-full">
                      <div
                        style={{ height: `${Math.max(expenseHeightPercent, 3)}%` }}
                        className={`w-full rounded-t-md transition-all duration-300 ${
                          p.expense > 0
                            ? isHovered
                              ? 'bg-rose-400 shadow-md shadow-rose-500/40 scale-y-105 origin-bottom'
                              : 'bg-rose-500'
                            : 'bg-transparent'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Date label */}
                  <span
                    className={`text-[10px] sm:text-xs font-semibold mt-1 truncate max-w-[32px] text-center transition-colors ${
                      isHovered ? 'text-primary-600 font-bold' : 'text-gray-400'
                    }`}
                  >
                    {p.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
