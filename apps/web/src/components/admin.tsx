'use client';
import { useState } from 'react';
import { Alert, Button, Field, Modal, Textarea } from './ui';

/** Fenêtre de confirmation d'une décision administrative, avec motif (obligatoire selon la décision). */
export function DecisionModal({ open, title, noteRequired, confirmLabel, onClose, onConfirm }: {
  open: boolean; title: string; noteRequired: boolean; confirmLabel: string; onClose: () => void; onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Field label={noteRequired ? 'Motif (obligatoire, transmis au professionnel)' : 'Message (facultatif)'}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button busy={busy} disabled={noteRequired && note.trim().length < 3} onClick={async () => {
          setBusy(true);
          setError(null);
          try { await onConfirm(note.trim()); setNote(''); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function FilterTabs({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-full px-3.5 py-1.5 text-sm ${value === v ? 'bg-ink text-white' : 'border border-line bg-surface text-ink-soft hover:bg-sand-deep'}`}>{label}</button>
      ))}
    </div>
  );
}
