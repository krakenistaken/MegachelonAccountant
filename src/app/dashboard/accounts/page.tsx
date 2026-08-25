// src/app/dashboard/accounts/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import TransactionForm, { type TransactionFormData } from '@/components/forms/TransactionForm';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { exportTransactionsToExcel, exportTransactionsToCSV } from '@/lib/exportUtils';

interface Account {
  id: number;
  name: string;
  balance: number;
}

interface Transaction {
  id: number;
  type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string;
  category_id?: number;
  account_id?: number;
  category_name: string;
  account_name: string;
  created_by: string;
  created_at: string;
}

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Add account modal
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Edit account modal
  const [editAccountModalOpen, setEditAccountModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete account confirm modal
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  // Selected account state for viewing transaction history
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [filterType, setFilterType] = useState<string>('');

  // Transaction modals (Add & Edit)
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const detailSectionRef = useRef<HTMLDivElement>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null;

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      const accList: Account[] = data.accounts || [];
      setAccounts(accList);
    } catch (err) {
      console.error('Fetch accounts error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAccountTransactions = useCallback(async (accountId: number, typeFilter: string = '') => {
    setLoadingTransactions(true);
    try {
      const params = new URLSearchParams();
      params.set('account_id', accountId.toString());
      if (typeFilter) params.set('type', typeFilter);

      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      setAccountTransactions(data.transactions || []);
    } catch (err) {
      console.error('Fetch account transactions error:', err);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (selectedAccountId) {
      fetchAccountTransactions(selectedAccountId, filterType);
    } else {
      setAccountTransactions([]);
    }
  }, [selectedAccountId, filterType, fetchAccountTransactions]);

  // Real-time SSE updates
  useRealtimeEvents({
    onAccountUpdated: () => fetchAccounts(),
    onAccountCreated: () => fetchAccounts(),
    onTransactionCreated: () => {
      fetchAccounts();
      if (selectedAccountId) fetchAccountTransactions(selectedAccountId, filterType);
    },
    onTransactionUpdated: () => {
      fetchAccounts();
      if (selectedAccountId) fetchAccountTransactions(selectedAccountId, filterType);
    },
    onTransactionDeleted: () => {
      fetchAccounts();
      if (selectedAccountId) fetchAccountTransactions(selectedAccountId, filterType);
    },
  });

  const handleSelectAccount = (account: Account) => {
    if (selectedAccountId === account.id) {
      // Toggle off if already selected
      setSelectedAccountId(null);
    } else {
      setSelectedAccountId(account.id);
      setFilterType('');
      setTimeout(() => {
        detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Kasa eklenemedi.');
        return;
      }
      setModalOpen(false);
      setNewName('');
      fetchAccounts();
    } catch {
      setError('Sunucu hatası.');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Account
  const openEditAccount = (e: React.MouseEvent, acc: Account) => {
    e.stopPropagation();
    setAccountToEdit(acc);
    setEditName(acc.name);
    setEditError('');
    setEditAccountModalOpen(true);
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountToEdit) return;
    setEditError('');
    setEditSubmitting(true);

    try {
      const res = await fetch(`/api/accounts/${accountToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Kasa güncellenemedi.');
        return;
      }
      setEditAccountModalOpen(false);
      setAccountToEdit(null);
      fetchAccounts();
    } catch {
      setEditError('Sunucu hatası.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete Account
  const openDeleteAccount = (e: React.MouseEvent, acc: Account) => {
    e.stopPropagation();
    setAccountToDelete(acc);
    setDeleteAccountError('');
    setDeleteAccountModalOpen(true);
  };

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;
    setDeleteAccountError('');
    setDeleteSubmitting(true);

    try {
      const res = await fetch(`/api/accounts/${accountToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteAccountError(data.error || 'Kasa silinemedi.');
        return;
      }
      setDeleteAccountModalOpen(false);
      if (selectedAccountId === accountToDelete.id) {
        setSelectedAccountId(null);
      }
      setAccountToDelete(null);
      fetchAccounts();
    } catch {
      setDeleteAccountError('Sunucu hatası oluştu.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Add / Edit Transaction in selected account
  const handleSaveTransaction = async (formData: TransactionFormData) => {
    setTxSubmitting(true);
    try {
      const url = editingTx ? `/api/transactions/${editingTx.id}` : '/api/transactions';
      const method = editingTx ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'İşlem kaydedilemedi.');
      }
      setTxModalOpen(false);
      setEditingTx(null);
      fetchAccounts();
      if (selectedAccount) fetchAccountTransactions(selectedAccount.id, filterType);
    } catch (err) {
      throw err;
    } finally {
      setTxSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        console.error('Delete error:', data.error);
      } else {
        fetchAccounts();
        if (selectedAccount) fetchAccountTransactions(selectedAccount.id, filterType);
      }
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  // Selected account calculations
  const totalAccountIncome = accountTransactions
    .filter((tx) => tx.type === 'Gelir')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalAccountExpense = accountTransactions
    .filter((tx) => tx.type === 'Gider')
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kasalar</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Kasa hesaplarınızı ekleyin, düzenleyin, silin ve geçmiş hareketlerini inceleyin
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
            bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
            shadow-md shadow-primary-500/25 transition-all duration-200"
          id="add-account-btn"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Yeni Kasa
        </button>
      </div>

      {/* Total balance banner */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-700 rounded-2xl p-6 text-white shadow-xl shadow-primary-500/20">
        <p className="text-primary-100 text-sm font-medium mb-1">Toplam Kasa Bakiyesi</p>
        <p className="text-3xl sm:text-4xl font-bold">{formatCurrency(totalBalance)}</p>
        <p className="text-primary-200 text-sm mt-2">
          {accounts.length} kasa hesabı · Hareketleri görmek için bir kasaya tıklayınız
        </p>
      </div>

      {/* Accounts grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Kasa Listesi ({accounts.length})
            </h2>
            {selectedAccount && (
              <button
                onClick={() => setSelectedAccountId(null)}
                className="text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
              >
                ✕ Seçimi Kaldır
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => {
              const isSelected = selectedAccount?.id === account.id;

              return (
                <div
                  key={account.id}
                  onClick={() => handleSelectAccount(account)}
                  className={`
                    relative rounded-2xl border p-6 cursor-pointer transition-all duration-300 group
                    ${
                      isSelected
                        ? 'bg-gradient-to-br from-primary-50/70 to-white border-primary-500 ring-2 ring-primary-500/30 shadow-lg shadow-primary-500/10'
                        : 'bg-white border-gray-100 hover:border-primary-200 hover:shadow-lg hover:shadow-gray-100/50'
                    }
                  `}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300 ${
                        isSelected
                          ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                          : 'bg-primary-100 text-primary-600'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                      </svg>
                    </div>

                    {/* Action buttons on card (Edit / Delete) */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => openEditAccount(e, account)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="Kasayı Düzenle"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => openDeleteAccount(e, account)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-danger-500 hover:bg-danger-50 transition-colors"
                        title="Kasayı Sil"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-gray-800 mb-1 group-hover:text-primary-600 transition-colors">
                    {account.name}
                  </h3>

                  <p className={`text-2xl font-extrabold tracking-tight ${account.balance >= 0 ? 'text-gray-900' : 'text-danger-600'}`}>
                    {account.balance < 0 ? '-' : ''}{formatCurrency(account.balance)}
                  </p>

                  <div className="mt-4 pt-3 border-t border-gray-100/80 flex items-center justify-between text-xs font-semibold">
                    <span className={isSelected ? 'text-primary-700' : 'text-gray-500 group-hover:text-primary-600'}>
                      {isSelected ? 'İşlem geçmişi aşağıda açık' : 'Gelir & Gider Geçmişini Gör'}
                    </span>
                    <span className="text-primary-500 group-hover:translate-x-1 transition-transform">
                      ➔
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected account detail & transaction history table */}
      {selectedAccount && (
        <div
          ref={detailSectionRef}
          className="bg-white rounded-2xl border border-primary-200 shadow-xl shadow-primary-500/5 p-5 sm:p-7 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300"
        >
          {/* Header of selected account */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-primary-100 text-primary-700">
                  Kasa Detayı
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {selectedAccount.name}
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Bu kasaya ait tüm gelir ve gider hareketlerinin dökümü
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setEditingTx(null);
                  setTxModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white
                  bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                  shadow-md shadow-primary-500/20 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Bu Kasaya İşlem Ekle
              </button>

              <button
                onClick={(e) => openEditAccount(e, selectedAccount)}
                className="px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Kasayı Düzenle
              </button>

              <button
                onClick={(e) => openDeleteAccount(e, selectedAccount)}
                className="px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all"
              >
                Kasayı Sil
              </button>

              <button
                onClick={() => setSelectedAccountId(null)}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Kapat
              </button>
            </div>
          </div>

          {/* Account mini stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500">Güncel Kasa Bakiyesi</p>
              <p className={`text-xl font-bold mt-1 ${selectedAccount.balance >= 0 ? 'text-gray-900' : 'text-danger-600'}`}>
                {formatCurrency(selectedAccount.balance)}
              </p>
            </div>

            <div className="bg-success-50 rounded-xl p-4 border border-success-100">
              <p className="text-xs font-medium text-success-700">Toplam Giren (Gelir)</p>
              <p className="text-xl font-bold text-success-700 mt-1">
                +{formatCurrency(totalAccountIncome)}
              </p>
            </div>

            <div className="bg-danger-50 rounded-xl p-4 border border-danger-100">
              <p className="text-xs font-medium text-danger-700">Toplam Çıkan (Gider)</p>
              <p className="text-xl font-bold text-danger-700 mt-1">
                -{formatCurrency(totalAccountExpense)}
              </p>
            </div>
          </div>

          {/* Filters & Export for this account */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {['', 'Gelir', 'Gider'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterType === t
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t || 'Tümü'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 mr-2">
                {accountTransactions.length} işlem listelendi
              </span>

              <button
                onClick={() =>
                  exportTransactionsToExcel(
                    accountTransactions,
                    `Kasa_${selectedAccount.name}_${filterType || 'Tumu'}_${new Date().toISOString().split('T')[0]}.xlsx`
                  )
                }
                disabled={accountTransactions.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-50"
                title="Bu kasanın hareketlerini Excel (.xlsx) olarak indir"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Excel İndir
              </button>

              <button
                onClick={() =>
                  exportTransactionsToCSV(
                    accountTransactions,
                    `Kasa_${selectedAccount.name}_${filterType || 'Tumu'}_${new Date().toISOString().split('T')[0]}.csv`
                  )
                }
                disabled={accountTransactions.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
                title="Bu kasanın hareketlerini UTF-8 CSV olarak indir"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                CSV İndir
              </button>
            </div>
          </div>

          {/* Transaction list table */}
          {loadingTransactions ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : accountTransactions.length === 0 ? (
            <div className="text-center py-12 bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3 text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700">
                Bu kasaya ait {filterType ? `"${filterType}"` : ''} işlem hareketi bulunamadı
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Yukarıdaki &quot;Bu Kasaya İşlem Ekle&quot; butonunu kullanarak yeni hareket kaydedebilirsiniz.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase">
                      <th className="text-left px-5 py-3">Tür</th>
                      <th className="text-left px-5 py-3">Kategori</th>
                      <th className="text-right px-5 py-3">Tutar</th>
                      <th className="text-left px-5 py-3">Tarih</th>
                      <th className="text-left px-5 py-3">Açıklama</th>
                      <th className="text-right px-5 py-3">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {accountTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                              tx.type === 'Gelir'
                                ? 'bg-success-50 text-success-700'
                                : 'bg-danger-50 text-danger-700'
                            }`}
                          >
                            {tx.type === 'Gelir' ? '↑ Gelir' : '↓ Gider'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">
                          {tx.category_name}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`text-sm font-bold ${
                              tx.type === 'Gelir' ? 'text-success-600' : 'text-danger-600'
                            }`}
                          >
                            {tx.type === 'Gelir' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">
                          {new Date(tx.transaction_date).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 max-w-[240px] truncate">
                          {tx.description || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {deleteConfirm === tx.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => handleDeleteTransaction(tx.id)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-danger-500 text-white hover:bg-danger-600"
                              >
                                Sil
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                              >
                                İptal
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setEditingTx(tx);
                                  setTxModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all"
                                title="İşlemi Düzenle"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(tx.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-danger-500 hover:bg-danger-50 transition-all"
                                title="İşlemi Sil"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {accountTransactions.map((tx) => (
                  <div key={tx.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                            tx.type === 'Gelir'
                              ? 'bg-success-50 text-success-700'
                              : 'bg-danger-50 text-danger-700'
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {tx.category_name}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold ${
                          tx.type === 'Gelir' ? 'text-success-600' : 'text-danger-600'
                        }`}
                      >
                        {tx.type === 'Gelir' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{new Date(tx.transaction_date).toLocaleDateString('tr-TR')}</span>
                      {deleteConfirm === tx.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteTransaction(tx.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-danger-500 text-white"
                          >
                            Sil
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600"
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingTx(tx);
                              setTxModalOpen(true);
                            }}
                            className="p-1 text-gray-400 hover:text-primary-600"
                            title="Düzenle"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(tx.id)}
                            className="p-1 text-gray-400 hover:text-danger-500"
                            title="Sil"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {tx.description && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{tx.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add new account modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setError(''); }} title="Yeni Kasa Ekle" size="sm">
        <form onSubmit={handleCreate} className="space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-danger-50 text-danger-700 text-sm font-medium">{error}</div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Kasa Adı</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Örn: Döviz Kasası"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
                focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setModalOpen(false); setError(''); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                shadow-md shadow-primary-500/25 transition-all disabled:opacity-50"
            >
              {submitting ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit account modal */}
      <Modal
        isOpen={editAccountModalOpen}
        onClose={() => {
          setEditAccountModalOpen(false);
          setAccountToEdit(null);
          setEditError('');
        }}
        title="Kasa Adını Düzenle"
        size="sm"
      >
        <form onSubmit={handleEditAccount} className="space-y-5">
          {editError && (
            <div className="px-4 py-3 rounded-xl bg-danger-50 text-danger-700 text-sm font-medium">{editError}</div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Yeni Kasa Adı</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Örn: Ana Kasa"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
                focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setEditAccountModalOpen(false);
                setAccountToEdit(null);
                setEditError('');
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={editSubmitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                shadow-md shadow-primary-500/25 transition-all disabled:opacity-50"
            >
              {editSubmitting ? 'Kaydediliyor...' : 'Güncelle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete account confirmation modal */}
      <Modal
        isOpen={deleteAccountModalOpen}
        onClose={() => {
          setDeleteAccountModalOpen(false);
          setAccountToDelete(null);
          setDeleteAccountError('');
        }}
        title="Kasayı Sil"
        size="sm"
      >
        <div className="space-y-4">
          {deleteAccountError ? (
            <div className="p-3 rounded-xl bg-danger-50 text-danger-700 text-xs font-semibold">
              {deleteAccountError}
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              <strong className="text-gray-900 font-bold">&quot;{accountToDelete?.name}&quot;</strong> kasasını silmek istediğinize emin misiniz?
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setDeleteAccountModalOpen(false);
                setAccountToDelete(null);
                setDeleteAccountError('');
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleteSubmitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-danger-600 hover:bg-danger-700 shadow-md shadow-danger-600/25 transition-all disabled:opacity-50"
            >
              {deleteSubmitting ? 'Siliniyor...' : 'Evet, Sil'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add / Edit transaction for selected account modal */}
      {selectedAccount && (
        <Modal
          isOpen={txModalOpen}
          onClose={() => {
            setTxModalOpen(false);
            setEditingTx(null);
          }}
          title={editingTx ? 'İşlemi Düzenle' : `"${selectedAccount.name}" Kasasına İşlem Ekle`}
        >
          <TransactionForm
            key={editingTx ? `edit-${editingTx.id}` : `new-${selectedAccount.id}`}
            onSubmit={handleSaveTransaction}
            onCancel={() => {
              setTxModalOpen(false);
              setEditingTx(null);
            }}
            loading={txSubmitting}
            defaultAccountId={selectedAccount.id}
            initialData={
              editingTx
                ? {
                    type: editingTx.type as 'Gelir' | 'Gider',
                    category_id: editingTx.category_id,
                    account_id: editingTx.account_id || selectedAccount.id,
                    currency: editingTx.currency,
                    amount: editingTx.amount,
                    transaction_date: editingTx.transaction_date,
                    description: editingTx.description || '',
                  }
                : null
            }
          />
        </Modal>
      )}
    </div>
  );
}
