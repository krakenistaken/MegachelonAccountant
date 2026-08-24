// src/app/dashboard/categories/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';

interface Category {
  id: number;
  name: string;
  type: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'Gelir' | 'Gider'>('Gider');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'Gelir' | 'Gider'>('all');

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Fetch categories error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, type: newType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Kategori eklenemedi.');
        return;
      }
      setModalOpen(false);
      setNewName('');
      fetchCategories();
    } catch {
      setError('Sunucu hatası.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCategories =
    activeTab === 'all' ? categories : categories.filter((c) => c.type === activeTab);

  const gelirCount = categories.filter((c) => c.type === 'Gelir').length;
  const giderCount = categories.filter((c) => c.type === 'Gider').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kategoriler</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Gelir ve gider kategorilerinizi yönetin
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
            bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
            shadow-md shadow-primary-500/25 transition-all duration-200"
          id="add-category-btn"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Yeni Kategori
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
          <p className="text-sm text-gray-500 font-medium">Toplam</p>
        </div>
        <div className="bg-success-50 rounded-2xl border border-success-100 p-5 text-center">
          <p className="text-2xl font-bold text-success-700">{gelirCount}</p>
          <p className="text-sm text-success-600 font-medium">Gelir</p>
        </div>
        <div className="bg-danger-50 rounded-2xl border border-danger-100 p-5 text-center col-span-2 sm:col-span-1">
          <p className="text-2xl font-bold text-danger-700">{giderCount}</p>
          <p className="text-sm text-danger-600 font-medium">Gider</p>
        </div>
      </div>

      {/* Tab filters */}
      <div className="flex gap-2">
        {(['all', 'Gelir', 'Gider'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === tab
                ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab === 'all' ? 'Tümü' : tab}
          </button>
        ))}
      </div>

      {/* Categories grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 hover:shadow-md hover:shadow-gray-100/50 transition-all duration-200"
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  cat.type === 'Gelir'
                    ? 'bg-success-100 text-success-600'
                    : 'bg-danger-100 text-danger-600'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
                <span className={`text-xs font-medium ${
                  cat.type === 'Gelir' ? 'text-success-600' : 'text-danger-600'
                }`}>
                  {cat.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add category modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setError(''); }} title="Yeni Kategori Ekle" size="sm">
        <form onSubmit={handleCreate} className="space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-danger-50 text-danger-700 text-sm font-medium">{error}</div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Tür</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewType('Gelir')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  newType === 'Gelir'
                    ? 'bg-success-500 text-white shadow-md shadow-success-500/25'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ↑ Gelir
              </button>
              <button
                type="button"
                onClick={() => setNewType('Gider')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  newType === 'Gider'
                    ? 'bg-danger-500 text-white shadow-md shadow-danger-500/25'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ↓ Gider
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Kategori Adı</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Örn: Ofis Giderleri"
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
    </div>
  );
}
