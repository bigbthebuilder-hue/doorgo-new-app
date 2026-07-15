'use client';

import { useEffect } from 'react';

export type AppConfirmationToastMessage = {
  id: number;
  tone: 'success' | 'error';
  text: string;
};

export function AppConfirmationToast({
  message,
  onDismiss,
}: {
  message: AppConfirmationToastMessage | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(
      onDismiss,
      message.tone === 'success' ? 1100 : 6000,
    );
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex justify-center sm:top-4">
      <div
        role="status"
        aria-live="polite"
        className={`max-w-lg rounded-full border px-4 py-2.5 text-center text-sm font-semibold shadow-lg ${
          message.tone === 'success'
            ? 'animate-[app-toast_1100ms_ease-in-out_both] border-emerald-300 bg-emerald-700 text-white'
            : 'animate-[app-toast_6000ms_ease-in-out_both] border-rose-300 bg-rose-700 text-white'
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
