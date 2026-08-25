// src/components/salaries/EmployeeCalendarModal.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';

export interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  daily_wage: number;
  phone: string | null;
  is_active: number;
  created_at: string;
  total_days_worked: number;
  total_earned: number;
  total_paid: number;
  balance_due: number;
}

interface CalendarRecord {
  attendance_id: number;
  employee_id: number;
  date: string;
  status: 'Geldi' | 'Yarım Gün' | 'Gelmedi';
  daily_wage: number;
  is_paid: number;
  paid_amount?: number;
  account_id: number | null;
  account_name: string | null;
  note: string | null;
}

interface EmployeeCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onSelectDateForAttendance?: (date: string) => void;
  onOpenPayDue?: (employee: Employee) => void;
}

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function EmployeeCalendarModal({
  isOpen,
  onClose,
  employee,
  onSelectDateForAttendance,
  onOpenPayDue,
}: EmployeeCalendarModalProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [records, setRecords] = useState<CalendarRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    dayNum: number;
    record?: CalendarRecord;
  } | null>(null);

  const fetchCalendar = useCallback(async (empId: number, month: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/salaries/attendance?employee_id=${empId}&month=${month}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch (err) {
      console.error('Fetch employee calendar error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && employee) {
      fetchCalendar(employee.id, selectedMonth);
    }
  }, [isOpen, employee, selectedMonth, fetchCalendar]);

  if (!employee) return null;

  // Month navigation handlers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const newMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const newMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  // Parse Year and Month
  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const monthTitle = `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;

  // Build calendar matrix
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const firstDayOfWeek = (new Date(yearNum, monthNum - 1, 1).getDay() + 6) % 7; // 0 = Monday, 6 = Sunday

  // Map records by date (YYYY-MM-DD)
  const recordMap = new Map<string, CalendarRecord>();
  records.forEach((r) => recordMap.set(r.date, r));

  // Monthly stats
  const workingDays = records.filter((r) => r.status === 'Geldi' || r.status === 'Yarım Gün');
  const fullDays = records.filter((r) => r.status === 'Geldi');
  const halfDays = records.filter((r) => r.status === 'Yarım Gün');
  const absentDays = records.filter((r) => r.status === 'Gelmedi');

  const totalEarned = workingDays.reduce((s, r) => s + r.daily_wage, 0);
  const totalPaid = workingDays.reduce(
    (s, r) =>
      s +
      (r.paid_amount !== undefined
        ? r.paid_amount
        : r.is_paid === 1
        ? r.daily_wage
        : 0),
    0
  );
  const fullPaidDays = workingDays.filter((r) => {
    const p =
      r.paid_amount !== undefined
        ? r.paid_amount
        : r.is_paid === 1
        ? r.daily_wage
        : 0;
    return p >= r.daily_wage && p > 0;
  });
  const partialPaidDays = workingDays.filter((r) => {
    const p =
      r.paid_amount !== undefined
        ? r.paid_amount
        : r.is_paid === 1
        ? r.daily_wage
        : 0;
    return p > 0 && p < r.daily_wage;
  });
  const unpaidDays = workingDays.filter((r) => {
    const p =
      r.paid_amount !== undefined
        ? r.paid_amount
        : r.is_paid === 1
        ? r.daily_wage
        : 0;
    return p === 0;
  });
  const totalDue = totalEarned - totalPaid;

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${employee.first_name} ${employee.last_name} — Çalışma & Yoklama Takvimi`}
      size="lg"
    >
      <div className="space-y-5">
        {/* Employee Header & Month Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/80 rounded-2xl border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold flex items-center justify-center text-sm shadow-md shadow-primary-500/20">
              {employee.first_name.charAt(0)}
              {employee.last_name.charAt(0)}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                {employee.first_name} {employee.last_name}
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Günlük Yevmiye: <span className="font-bold text-gray-800">{formatCurrency(employee.daily_wage)}</span> · Yarım Gün: <span className="font-bold text-indigo-700">{formatCurrency(employee.daily_wage / 2)}</span>
              </p>
            </div>
          </div>

          {/* Actions & Month Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenPayDue && (
              <button
                onClick={() => {
                  onOpenPayDue(employee);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-sm shadow-emerald-500/25 transition-all"
                title="Geçmişten başlayarak borç ödemesi yap"
              >
                <span>⚡</span> Borç Öde / Kapat
              </button>
            )}

            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 transition-colors shadow-sm"
                title="Önceki Ay"
              >
                ◀
              </button>
              <div className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 font-bold text-xs sm:text-sm text-gray-900 shadow-sm text-center min-w-[130px]">
                {monthTitle}
              </div>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 transition-colors shadow-sm"
                title="Sonraki Ay"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {/* Monthly Mini Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {/* Tam Gün (Yeşil) */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Tam Gün
            </div>
            <p className="text-lg font-extrabold text-emerald-700">{fullDays.length} Gün</p>
          </div>

          {/* Yarım Gün (İndigo) */}
          <div className="bg-indigo-50 border border-indigo-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-indigo-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              Yarım Gün
            </div>
            <p className="text-lg font-extrabold text-indigo-700">{halfDays.length} Gün</p>
          </div>

          {/* Tam Ödenen */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-800 text-[11px] font-bold mb-0.5">
              ✓ Ödenen
            </div>
            <p className="text-lg font-extrabold text-emerald-700">{fullPaidDays.length} Gün</p>
          </div>

          {/* Bekleyen Borç (Sarı) */}
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-amber-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Bekleyen
            </div>
            <p className="text-lg font-extrabold text-amber-700">{unpaidDays.length + partialPaidDays.length} Gün</p>
            <p className="text-[10px] font-semibold text-amber-600 mt-0.5 truncate">
              {formatCurrency(totalDue)}
            </p>
          </div>

          {/* Gelmedi (Kırmızı) */}
          <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-rose-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Gelmedi
            </div>
            <p className="text-lg font-extrabold text-rose-700">{absentDays.length} Gün</p>
          </div>

          {/* Toplam Ödenen */}
          <div className="bg-primary-50 border border-primary-200/80 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
            <p className="text-[11px] font-bold text-primary-800 mb-0.5">Ödenen</p>
            <p className="text-base font-extrabold text-primary-700">
              {formatCurrency(totalPaid)}
            </p>
            <p className="text-[10px] text-primary-600 mt-0.5 font-medium truncate">
              Hak: {formatCurrency(totalEarned)}
            </p>
          </div>
        </div>

        {/* Interactive Calendar Grid */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm relative">
          {loading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-20 rounded-2xl">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          )}

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
            {DAY_NAMES.map((dayName, idx) => (
              <div
                key={dayName}
                className={`text-xs font-bold py-1.5 rounded-lg ${
                  idx >= 5 ? 'text-rose-500 bg-rose-50/50' : 'text-gray-600 bg-gray-50'
                }`}
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Days Matrix */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Blank leading cells */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="h-16 sm:h-20 rounded-xl bg-gray-50/30 border border-transparent"
              />
            ))}

            {/* Days of Month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateIso = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const record = recordMap.get(dateIso);
              const isToday = dateIso === todayIso;

              const isPresent = record?.status === 'Geldi';
              const isHalfDay = record?.status === 'Yarım Gün';
              const isWorking = isPresent || isHalfDay;
              const paidAmt = record
                ? record.paid_amount !== undefined
                  ? record.paid_amount
                  : record.is_paid === 1
                  ? record.daily_wage
                  : 0
                : 0;

              const isFullPaid = isWorking && paidAmt >= (record?.daily_wage || 0) && paidAmt > 0;
              const isPartialPaid = isWorking && paidAmt > 0 && paidAmt < (record?.daily_wage || 0);
              const isUnpaid = isWorking && paidAmt === 0;
              const isAbsent = record?.status === 'Gelmedi';
              const hasRecord = !!record;

              return (
                <div
                  key={dateIso}
                  onClick={() => {
                    if (onSelectDateForAttendance) {
                      onSelectDateForAttendance(dateIso);
                      onClose();
                    }
                  }}
                  onMouseEnter={() => setHoveredDay({ date: dateIso, dayNum, record })}
                  onMouseLeave={() => setHoveredDay(null)}
                  className={`
                    relative h-16 sm:h-20 p-1.5 rounded-xl border transition-all duration-200 flex flex-col justify-between cursor-pointer group
                    ${
                      isHalfDay && isFullPaid
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm shadow-indigo-600/20 hover:scale-[1.03]'
                        : isHalfDay && isUnpaid
                        ? 'bg-indigo-400 text-white border-indigo-500 shadow-sm shadow-indigo-500/20 hover:scale-[1.03]'
                        : isFullPaid
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-500/20 hover:scale-[1.03]'
                        : isPartialPaid
                        ? 'bg-blue-600 text-white border-blue-700 shadow-sm shadow-blue-500/20 hover:scale-[1.03]'
                        : isUnpaid
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/25 hover:scale-[1.03]'
                        : isAbsent
                        ? 'bg-rose-500 text-white border-rose-600 shadow-sm shadow-rose-500/20 hover:scale-[1.03]'
                        : 'bg-gray-50/80 border-gray-100 text-gray-700 hover:bg-gray-100/90 hover:border-gray-200'
                    }
                    ${isToday ? 'ring-2 ring-primary-500 ring-offset-1' : ''}
                  `}
                  title={`${dayNum} ${monthTitle} - ${
                    isHalfDay
                      ? `YARIM GÜN (Yevmiye: ₺${record?.daily_wage} - ${isFullPaid ? 'ÖDENDİ' : isPartialPaid ? `Kısmi: ₺${paidAmt}` : 'BEKLİYOR'})`
                      : isFullPaid
                      ? 'GELDİ (TAM ÖDENDİ)'
                      : isPartialPaid
                      ? `GELDİ (KISMİ ÖDENDİ: ₺${paidAmt})`
                      : isUnpaid
                      ? 'GELDİ (ÖDENMEDİ - BEKLİYOR)'
                      : isAbsent
                      ? 'GELMEDİ'
                      : 'Yoklama Girilmedi'
                  }`}
                >
                  {/* Top: Day Number & Today indicator */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs sm:text-sm font-extrabold ${
                        hasRecord ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
                    )}
                  </div>

                  {/* Middle / Bottom: Status badge */}
                  <div className="text-center overflow-hidden">
                    {isHalfDay ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-white/25 text-white backdrop-blur-xs">
                          ½ Yarım
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-indigo-100 truncate">
                          ₺{record?.daily_wage} {isFullPaid ? '(Ödendi)' : ''}
                        </div>
                      </div>
                    ) : isFullPaid ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/20 text-white backdrop-blur-xs">
                          ✓ Geldi
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-emerald-100 truncate">
                          ₺ Ödendi
                        </div>
                      </div>
                    ) : isPartialPaid ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/25 text-white backdrop-blur-xs">
                          ⚡ Kısmi
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-blue-100 truncate">
                          ₺{paidAmt}
                        </div>
                      </div>
                    ) : isUnpaid ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/20 text-white backdrop-blur-xs">
                          ✓ Geldi
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-amber-100 truncate">
                          ⏳ Bekliyor
                        </div>
                      </div>
                    ) : isAbsent ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/20 text-white backdrop-blur-xs">
                        ✗ Gelmedi
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-300 group-hover:text-gray-500 font-medium">
                        —
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hover detail tooltip bar */}
          {hoveredDay && hoveredDay.record && (
            <div className="mt-3 p-3 bg-gray-900/95 text-white rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 font-bold">
                <span className="text-gray-400">{hoveredDay.date}:</span>
                <span
                  className={
                    hoveredDay.record.status === 'Yarım Gün'
                      ? 'text-indigo-400'
                      : hoveredDay.record.status === 'Geldi'
                      ? (hoveredDay.record.paid_amount || 0) >= hoveredDay.record.daily_wage
                        ? 'text-emerald-400'
                        : (hoveredDay.record.paid_amount || 0) > 0
                        ? 'text-blue-400'
                        : 'text-amber-400'
                      : 'text-rose-400'
                  }
                >
                  {hoveredDay.record.status === 'Yarım Gün'
                    ? `½ Yarım Gün (Yevmiye: ${formatCurrency(hoveredDay.record.daily_wage)})`
                    : hoveredDay.record.status === 'Geldi'
                    ? (hoveredDay.record.paid_amount || 0) >= hoveredDay.record.daily_wage
                      ? '✓ Geldi (Tam Ödendi)'
                      : (hoveredDay.record.paid_amount || 0) > 0
                      ? `⚡ Geldi (Kısmi Ödeme: ${formatCurrency(hoveredDay.record.paid_amount || 0)} / Kalan: ${formatCurrency(Math.max(0, hoveredDay.record.daily_wage - (hoveredDay.record.paid_amount || 0)))})`
                      : '⏳ Geldi (Ödenmedi - Bekliyor)'
                    : '✗ Gelmedi (Devamsız)'}
                </span>
              </div>

              {(hoveredDay.record.status === 'Geldi' || hoveredDay.record.status === 'Yarım Gün') && (
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      (hoveredDay.record.paid_amount || 0) >= hoveredDay.record.daily_wage
                        ? 'bg-emerald-500/30 text-emerald-300'
                        : (hoveredDay.record.paid_amount || 0) > 0
                        ? 'bg-blue-500/30 text-blue-300'
                        : 'bg-amber-500/30 text-amber-300'
                    }`}
                  >
                    {(hoveredDay.record.paid_amount || 0) > 0
                      ? `Ödenen: ${formatCurrency(hoveredDay.record.paid_amount || 0)} ${hoveredDay.record.account_name ? `(${hoveredDay.record.account_name})` : '(Harici)'}`
                      : 'Ödeme Bekliyor'}
                  </span>
                  {hoveredDay.record.note && (
                    <span className="text-gray-400 text-[11px] italic">
                      &quot;{hoveredDay.record.note}&quot;
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend & Action Notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-4 font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-emerald-500 shadow-sm" />
              <span className="text-gray-700">Yeşil: Tam Gün (Ödendi)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-indigo-600 shadow-sm" />
              <span className="text-gray-700">İndigo: Yarım Gün</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-blue-600 shadow-sm" />
              <span className="text-gray-700">Mavi: Kısmi Ödendi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-amber-500 shadow-sm" />
              <span className="text-gray-700">Sarı: Ödenmedi (Bekliyor)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-rose-500 shadow-sm" />
              <span className="text-gray-700">Kırmızı: Gelmedi</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 italic">
            * Takvimdeki bir güne tıklayarak o günün yoklama ekranına gidebilirsiniz.
          </p>
        </div>
      </div>
    </Modal>
  );
}
