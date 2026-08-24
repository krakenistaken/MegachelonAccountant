// src/lib/exportUtils.ts
import * as XLSX from 'xlsx';

export interface ExportTransaction {
  id: number;
  type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  description?: string | null;
  category_name?: string;
  account_name?: string;
  created_by?: string;
}

export interface CategoryStat {
  name: string;
  type: string;
  total: number;
  count: number;
  percentage: number;
}

export interface AccountStat {
  name: string;
  balance: number;
  inflow: number;
  outflow: number;
  net: number;
}

export interface ReportExportData {
  periodLabel: string;
  dateRange: string;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  transactionCount: number;
  prevIncome?: number;
  prevExpense?: number;
  incomeGrowthRate?: number | null;
  expenseGrowthRate?: number | null;
  categories: CategoryStat[];
  accounts: AccountStat[];
  transactions: ExportTransaction[];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export transactions to XLSX Excel file
 */
export function exportTransactionsToExcel(
  transactions: ExportTransaction[],
  filename: string = 'islemler.xlsx'
) {
  const rows = transactions.map((t) => ({
    'İşlem No': t.id,
    'Tür': t.type,
    'Kategori': t.category_name || '—',
    'Kasa': t.account_name || '—',
    'Tutar': t.amount,
    'Para Birimi': t.currency || 'TRY',
    'Tarih': formatDate(t.transaction_date),
    'Açıklama': t.description || '—',
    'Kaydeden': t.created_by || '—',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 10 }, // ID
    { wch: 12 }, // Tür
    { wch: 22 }, // Kategori
    { wch: 20 }, // Kasa
    { wch: 15 }, // Tutar
    { wch: 12 }, // Para Birimi
    { wch: 14 }, // Tarih
    { wch: 35 }, // Açıklama
    { wch: 16 }, // Kaydeden
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'İşlemler');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/**
 * Export transactions to UTF-8 CSV with BOM for perfect Turkish character support in Excel
 */
export function exportTransactionsToCSV(
  transactions: ExportTransaction[],
  filename: string = 'islemler.csv'
) {
  const headers = [
    'İşlem No',
    'Tür',
    'Kategori',
    'Kasa',
    'Tutar',
    'Para Birimi',
    'Tarih',
    'Açıklama',
    'Kaydeden',
  ];

  const escapeCSV = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const lines = [
    headers.map(escapeCSV).join(';'),
    ...transactions.map((t) =>
      [
        escapeCSV(t.id),
        escapeCSV(t.type),
        escapeCSV(t.category_name || '—'),
        escapeCSV(t.account_name || '—'),
        escapeCSV(t.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
        escapeCSV(t.currency || 'TRY'),
        escapeCSV(formatDate(t.transaction_date)),
        escapeCSV(t.description || '—'),
        escapeCSV(t.created_by || '—'),
      ].join(';')
    ),
  ];

  // Prepend UTF-8 Byte Order Mark (BOM)
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/**
 * Export comprehensive Periodic Report to a multi-sheet Excel workbook
 */
export function exportReportToExcel(
  report: ReportExportData,
  filename: string = 'donemsel_rapor.xlsx'
) {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Özet Bilgiler
  const summaryRows = [
    { 'Metrik': 'Rapor Dönemi', 'Değer': report.periodLabel },
    { 'Metrik': 'Tarih Aralığı', 'Değer': report.dateRange },
    { 'Metrik': 'Toplam Gelir', 'Değer': `${report.totalIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` },
    { 'Metrik': 'Toplam Gider', 'Değer': `${report.totalExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` },
    { 'Metrik': 'Net Kar / Zarar', 'Değer': `${report.netProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` },
    { 'Metrik': 'Toplam İşlem Sayısı', 'Değer': report.transactionCount },
  ];

  if (report.prevIncome !== undefined) {
    summaryRows.push({
      'Metrik': 'Önceki Dönem Gelir',
      'Değer': `${report.prevIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`,
    });
  }
  if (report.prevExpense !== undefined) {
    summaryRows.push({
      'Metrik': 'Önceki Dönem Gider',
      'Değer': `${report.prevExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`,
    });
  }
  if (report.incomeGrowthRate !== undefined && report.incomeGrowthRate !== null) {
    summaryRows.push({
      'Metrik': 'Gelir Büyüme Oranı',
      'Değer': `%${report.incomeGrowthRate.toFixed(1)}`,
    });
  }
  if (report.expenseGrowthRate !== undefined && report.expenseGrowthRate !== null) {
    summaryRows.push({
      'Metrik': 'Gider Değişim Oranı',
      'Değer': `%${report.expenseGrowthRate.toFixed(1)}`,
    });
  }

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Dönem Özeti');

  // Sheet 2: Kategori Dağılımı
  const categoryRows = report.categories.map((c) => ({
    'Kategori Adı': c.name,
    'İşlem Türü': c.type,
    'Toplam Tutar (₺)': c.total,
    'İşlem Adedi': c.count,
    'Kategori Payı (%)': `%${c.percentage.toFixed(1)}`,
  }));
  const categorySheet = XLSX.utils.json_to_sheet(categoryRows);
  categorySheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, categorySheet, 'Kategori Dağılımı');

  // Sheet 3: Kasa Durumu
  const accountRows = report.accounts.map((a) => ({
    'Kasa Adı': a.name,
    'Dönem Girişi (₺)': a.inflow,
    'Dönem Çıkışı (₺)': a.outflow,
    'Dönem Net Değişim (₺)': a.net,
    'Güncel Kasa Bakiyesi (₺)': a.balance,
  }));
  const accountSheet = XLSX.utils.json_to_sheet(accountRows);
  accountSheet['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, accountSheet, 'Kasa Durumu');

  // Sheet 4: İşlem Detayları
  const txRows = report.transactions.map((t) => ({
    'İşlem No': t.id,
    'Tür': t.type,
    'Kategori': t.category_name || '—',
    'Kasa': t.account_name || '—',
    'Tutar': t.amount,
    'Para Birimi': t.currency || 'TRY',
    'Tarih': formatDate(t.transaction_date),
    'Açıklama': t.description || '—',
    'Kaydeden': t.created_by || '—',
  }));
  const txSheet = XLSX.utils.json_to_sheet(txRows);
  txSheet['!cols'] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 15 },
    { wch: 12 },
    { wch: 14 },
    { wch: 35 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, txSheet, 'Dönem İşlemleri');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
