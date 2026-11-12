'use client';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Field, Modal, PageTitle, Select, Spinner, Stars, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { COMPLAINT_STATUS } from '@/lib/labels';
import { fmt } from '@/lib/translate';

function Complaints() {
  const { data, reload } = useApi<any[]>('/admin/complaints');
  const [editing, setEditing] = useState<any>(null);
  const action = useAction();
  if (!data) return <Spinner />;
  if (!data.length) return <Empty title="Aucune réclamation" />;
  return (
    <>
      <div className="space-y-3">
        {data.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">{c.subject}</p>
              <Badge tone={COMPLAINT_STATUS[c.status][1]}>{COMPLAINT_STATUS[c.status][0]}</Badge>
            </div>
            <p className="text-xs text-muted">{c.author ? `${c.author.firstName} ${c.author.lastName} · ${c.author.email}` : 'Compte supprimé'} · {fmt.dateTime(c.createdAt, 'fr')}</p>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{c.message}</p>
            {c.adminReply && <p className="mt-3 rounded-xl bg-info-soft p-3 text-sm text-info">Votre réponse : {c.adminReply}</p>}
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setEditing({ id: c.id, status: c.status, adminReply: c.adminReply ?? '' })}>Traiter</Button>
          </Card>
        ))}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Traiter la réclamation">
        {editing && (
          <div className="space-y-4">
            <Field label="Statut"><Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>{Object.entries(COMPLAINT_STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}</Select></Field>
            <Field label="Réponse (visible par l’auteur)"><Textarea value={editing.adminReply} onChange={(e) => setEditing({ ...editing, adminReply: e.target.value })} maxLength={2000} /></Field>
            {action.error && <Alert>{action.error}</Alert>}
            <Button className="w-full" busy={action.busy} onClick={() => action.run(async () => { await api(`/admin/complaints/${editing.id}`, { body: { status: editing.status, adminReply: editing.adminReply || undefined } }); setEditing(null); await reload(); })}>Enregistrer</Button>
          </div>
        )}
      </Modal>
    </>
  );
}

function Reviews() {
  const { data, reload } = useApi<any[]>('/admin/reviews');
  const action = useAction();
  if (!data) return <Spinner />;
  if (!data.length) return <Empty title="Aucun avis" />;
  return (
    <div className="space-y-3">
      {action.error && <Alert>{action.error}</Alert>}
      {data.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-start gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-3 font-medium">{r.salon.name}<Stars value={r.rating} size={14} />{r.hidden && <Badge tone="danger">Masqué</Badge>}</p>
            <p className="mt-1 text-sm text-ink-soft">{r.comment ?? <span className="text-muted">Sans commentaire</span>}</p>
            <p className="mt-1 text-xs text-muted">{fmt.dateTime(r.createdAt, 'fr')}</p>
          </div>
          <Button size="sm" variant={r.hidden ? 'outline' : 'ghost'} disabled={action.busy} onClick={() => action.run(async () => { await api(`/admin/reviews/${r.id}/hide`, { body: { hidden: !r.hidden } }); await reload(); })}>{r.hidden ? 'Réafficher' : 'Masquer'}</Button>
        </Card>
      ))}
    </div>
  );
}

export default function ComplaintsPage() {
  const [tab, setTab] = useState<'complaints' | 'reviews'>('complaints');
  return (
    <>
      <PageTitle title="Réclamations et avis" />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'complaints', label: 'Réclamations' }, { value: 'reviews', label: 'Modération des avis' }]} />
      {tab === 'complaints' ? <Complaints /> : <Reviews />}
    </>
  );
}
