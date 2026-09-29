'use client';

import { useCallback, useEffect, useRef, type FormEvent } from 'react';

// Presentation only: native change events never modify the editor's values.
export function useEditedField(context: string | null | undefined) {
  const last = useRef<HTMLElement | null>(null);
  const clearRecentEdit = useCallback(() => {
    if (last.current) delete last.current.dataset.lastEdited;
    last.current = null;
  }, []);
  useEffect(clearRecentEdit, [context, clearRecentEdit]);
  return {
    clearRecentEdit,
    handlers: {
      onChangeCapture(event: FormEvent<HTMLElement>) {
        const field = event.target;
        if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
        if (field.disabled || ('readOnly' in field && field.readOnly)) return;
        if (field instanceof HTMLInputElement && ['button', 'submit', 'reset', 'hidden'].includes(field.type)) return;
        // Inline glass fields share the workspace; standalone builders own a scope.
        if (field.closest('[data-editing-fields]') !== event.currentTarget) return;
        clearRecentEdit();
        field.dataset.lastEdited = 'true';
        last.current = field;
      },
    },
  };
}
