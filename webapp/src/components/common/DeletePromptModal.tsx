import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from '@/components/icons';
import { useTranslation } from '../../i18n';
import { Button } from '../ui';

export interface DeletePromptModalProps {
  isOpen: boolean;
  entityLabel: string;
  targetName?: string | null;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  imageUrl?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeletePromptModal: React.FC<DeletePromptModalProps> = ({
  isOpen,
  entityLabel,
  targetName,
  title,
  message,
  confirmLabel,
  cancelLabel,
  imageUrl,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const titleId = useId();
  const inputId = useId();
  const expectedValue = targetName || 'yes';
  const hasNamedTarget = Boolean(targetName);
  const isValid = confirmation === expectedValue;

  useEffect(() => {
    if (!isOpen) return;

    setConfirmation('');
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, targetName, isLoading, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLoading && isValid) onConfirm();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60"
      onClick={() => {
        if (!isLoading) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id={titleId} className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">
                  {title || t('deletePrompt.title')}
                </h3>
                {message && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="p-1.5 -mt-1 -mr-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
                aria-label={t('close')}
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {hasNamedTarget
                ? t('deletePrompt.descriptionNamed', { entity: entityLabel })
                : t('deletePrompt.descriptionUnnamed', { entity: entityLabel })}
            </p>

            {hasNamedTarget && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  {t('deletePrompt.targetLabel')}
                </p>
                <code className="block text-sm font-semibold text-slate-800 dark:text-slate-100 break-all select-all">
                  {targetName}
                </code>
              </div>
            )}

            <div>
              <label htmlFor={inputId} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('deletePrompt.inputLabel')}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={hasNamedTarget ? t('deletePrompt.namedPlaceholder') : 'yes'}
                autoComplete="off"
                spellCheck={false}
                disabled={isLoading}
                aria-invalid={confirmation.length > 0 && !isValid}
                className="input-field w-full text-sm"
              />
              <p className={`mt-1.5 text-[11px] ${confirmation.length > 0 && !isValid ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {hasNamedTarget
                  ? t('deletePrompt.namedHint')
                  : t('deletePrompt.yesHint')}
              </p>
            </div>

            {imageUrl && (
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
                <img src={imageUrl} alt="" className="w-full h-40 object-cover" />
              </div>
            )}
          </div>

          <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              variant="secondary"
              className="rounded-xl"
            >
              {cancelLabel || t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !isValid}
              variant="danger"
              className="rounded-xl shadow-sm"
            >
              {isLoading && (
                <span className="w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              )}
              {confirmLabel || t('delete')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

