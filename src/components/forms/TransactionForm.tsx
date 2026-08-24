// src/components/forms/TransactionForm.tsx
'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: number;
  name: string;
  type: string;
}

interface Account {
  id: number;
  name: string;
  balance: number;
}

interface Currency {
  id: number;
  code: string;
  symbol: string;
}

interface TransactionFormProps {
  onSubmit: (data: TransactionFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  defaultAccountId?: number;
}

export interface TransactionFormData {
  type: 'Gelir' | 'Gider';
  category_id: number;
  account_id: number;
  currency: string;
  amount: number;
  transaction_date: string;
  description: string;
}

export default function TransactionForm({ onSubmit, onCancel, loading, defaultAccountId }: TransactionFormProps) {
  const [type, setType] = useState<'Gelir' | 'Gider'>('Gider');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [accountId, setAccountId] = useState<number>(defaultAccountId || 0);
  const [currency, setCurrency] = useState('TRY');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [description, setDescription] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch categories, accounts, currencies
    Promise.all([
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/accounts').then((r) => r.json()),
      fetch('/api/currencies').then((r) => r.json()),
    ]).then(([catData, accData, curData]) => {
      setCategories(catData.categories || []);
      setAccounts(accData.accounts || []);
      setCurrencies(curData.currencies || []);

      // Set defaults
      const firstCat = (catData.categories || []).find((c: Category) => c.type === 'Gider');
      if (firstCat) setCategoryId(firstCat.id);
      if (defaultAccountId) {
        setAccountId(defaultAccountId);
      } else if ((accData.accounts || []).length > 0) {
        setAccountId(accData.accounts[0].id);
      }
    });
  }, [defaultAccountId]);

  // Filter categories by type
  const filteredCategories = categories.filter((c) => c.type === type);

  const handleTypeChange = (newType: 'Gelir' | 'Gider') => {
    setType(newType);
    const firstMatch = categories.find((c) => c.type === newType);
    if (firstMatch) {
      setCategoryId(firstMatch.id);
    }
  };

  const effectiveCategoryId = filteredCategories.some((c) => c.id === categoryId)
    ? categoryId
    : (filteredCategories[0]?.id || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const targetCategoryId = categoryId || effectiveCategoryId;
    if (!targetCategoryId || !accountId || !amount || !transactionDate) {
      setError('Tüm zorunlu alanları doldurun.');
      return;
    }

    try {
      await onSubmit({
        type,
        category_id: targetCategoryId,
        account_id: accountId,
        currency,
        amount: parseFloat(amount),
        transaction_date: transactionDate,
        description,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-danger-50 text-danger-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Type selector */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">İşlem Türü</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('Gelir')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              type === 'Gelir'
                ? 'bg-success-500 text-white shadow-md shadow-success-500/25'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            ↑ Gelir
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('Gider')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              type === 'Gider'
                ? 'bg-danger-500 text-white shadow-md shadow-danger-500/25'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            ↓ Gider
          </button>
        </div>
      </div>

      {/* Amount + Currency */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Tutar</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
              transition-all text-lg font-semibold"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Para Birimi</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Kategori</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(Number(e.target.value))}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
            focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
          required
        >
          <option value={0} disabled>Kategori seçin...</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Account */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Kasa</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(Number(e.target.value))}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
            focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
          required
        >
          <option value={0} disabled>Kasa seçin...</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Tarih</label>
        <input
          type="date"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
            focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Açıklama</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="İşlem açıklaması (opsiyonel)"
          rows={2}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900
            focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
            transition-all resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100
            hover:bg-gray-200 transition-all"
        >
          İptal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
            bg-gradient-to-r from-primary-500 to-primary-600
            hover:from-primary-600 hover:to-primary-700
            shadow-md shadow-primary-500/25
            transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </form>
  );
}
