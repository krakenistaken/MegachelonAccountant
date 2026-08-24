// src/components/layout/Header.tsx
'use client';

interface HeaderProps {
  title: string;
  onMenuToggle: () => void;
}

export default function Header({ title, onMenuToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-100">
      <div className="flex items-center gap-4 px-4 sm:px-6 py-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
          id="mobile-menu-toggle"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <div className="flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h2>
        </div>

        {/* Connection status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success-50 text-success-600">
          <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
          <span className="text-xs font-medium hidden sm:block">Canlı</span>
        </div>
      </div>
    </header>
  );
}
