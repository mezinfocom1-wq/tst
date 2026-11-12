'use client';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageTitle, Spinner, Tabs, Textarea, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';

type Tab = 'general' | 'bank' | 'ranking' | 'templates';
const RANKING: [string, string][] = [['distance', 'Proximité'], ['rating', 'Note moyenne'], ['popularity', 'Nombre d’avis'], ['queueOpen', 'Ouvert en ce moment']];

function Templates() {
  const { data, reload } = useApi<any[]>('/admin/templates');
  const [editing, setEditing] = useState<any>(null);
  const action = useAction();
  if (!data) return <Spinner />;
  return (
    <>
      <p className="mb-4 text-sm text-muted">Les variables entre doubles accolades (par exemple {'{{salon}}'}) sont remplacées à l’envoi.</p>
      <div className="space-y-2">
        {data.map((x) => (
          <Card key={`${x.key}-${x.locale}`} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1" dir={x.locale === 'ar' ? 'rtl' : 'ltr'}>
              <p className="font-medium">{x.title}</p>
              <p className="truncate text-sm text-muted">{x.body}</p>
            </div>
            <span className="font-mono text-xs text-muted">{x.key}</span>
            <Badge>{x.locale.toUpperCase()}</Badge>
            {x.channels.map((c: string) => <Badge key={c} tone="info">{c === 'EMAIL' ? 'Email' : 'Push'}</Badge>)}
            {x.customized && <Badge tone="brand">Personnalisé</Badge>}
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...x })}>Modifier</Button>
          </Card>
        ))}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Modèle ${editing.key} (${editing.locale.toUpperCase()})` : ''} wide>
        {editing && (
          <div className="space-y-4" dir={editing.locale === 'ar' ? 'rtl' : 'ltr'}>
            <Field label="Titre / objet"><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={200} /></Field>
            <Field label="Message"><Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} className="min-h-40" maxLength={4000} /></Field>
            {action.error && <Alert>{action.error}</Alert>}
            <div className="flex justify-between gap-2" dir="ltr">
              {editing.customized ? <Button variant="ghost" onClick={() => action.run(async () => { await api(`/admin/templates/${editing.key}/${editing.locale}`, { method: 'DELETE' }); setEditing(null); await reload(); })}>Rétablir le modèle par défaut</Button> : <span />}
              <Button busy={action.busy} onClick={() => action.run(async () => { await api(`/admin/templates/${editing.key}/${editing.locale}`, { method: 'PUT', body: { title: editing.title, body: editing.body } }); setEditing(null); await reload(); })}>Enregistrer</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function Settings() {
  const { data, reload } = useApi<any>('/admin/settings');
  const [tab, setTab] = useState<Tab>('general');
  const [form, setForm] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  useEffect(() => { if (data) setForm(structuredClone(data)); }, [data]);
  if (!form) return <Spinner />;
  const set = (group: string, key: string, value: unknown) => { setSaved(false); setForm({ ...form, [group]: { ...form[group], [key]: value } }); };
  const save = (key: string) => action.run(async () => { await api(`/admin/settings/${key}`, { method: 'PUT', body: { value: form[key] } }); await reload(); setSaved(true); });
  const footer = (key: string) => (
    <>
      {action.error && <Alert>{action.error}</Alert>}
      {saved && <Alert tone="ok">Configuration enregistrée.</Alert>}
      <Button busy={action.busy} onClick={() => save(key)}>Enregistrer</Button>
    </>
  );
  return (
    <>
      <PageTitle title="Configuration" />
      <Tabs<Tab> value={tab} onChange={(v) => { setTab(v); setSaved(false); }} items={[
        { value: 'general', label: 'Général' }, { value: 'bank', label: 'Coordonnées bancaires' }, { value: 'ranking', label: 'Classement' }, { value: 'templates', label: 'Modèles de messages' },
      ]} />
      {tab === 'general' && (
        <Card className="max-w-xl space-y-4 p-5">
          <Field label="Nom de la plateforme"><Input value={form.general.platformName} onChange={(e) => set('general', 'platformName', e.target.value)} /></Field>
          <Field label="Email du support"><Input type="email" value={form.general.supportEmail} onChange={(e) => set('general', 'supportEmail', e.target.value)} /></Field>
          <Toggle label="Exiger une adresse email vérifiée pour réserver un rendez-vous" checked={form.general.requireEmailVerification} onChange={(v) => set('general', 'requireEmailVerification', v)} />
          {footer('general')}
        </Card>
      )}
      {tab === 'bank' && (
        <Card className="max-w-xl space-y-4 p-5">
          <p className="text-sm text-muted">Affichées aux professionnels au moment de payer leur abonnement par virement.</p>
          <Field label="Banque"><Input value={form.bank.bankName} onChange={(e) => set('bank', 'bankName', e.target.value)} /></Field>
          <Field label="Titulaire du compte"><Input value={form.bank.accountHolder} onChange={(e) => set('bank', 'accountHolder', e.target.value)} /></Field>
          <Field label="RIB (24 chiffres)"><Input value={form.bank.rib} onChange={(e) => set('bank', 'rib', e.target.value)} className="font-mono" /></Field>
          <Field label="Instructions de paiement"><Textarea value={form.bank.instructions} onChange={(e) => set('bank', 'instructions', e.target.value)} /></Field>
          {footer('bank')}
        </Card>
      )}
      {tab === 'ranking' && (
        <Card className="max-w-xl space-y-5 p-5">
          <p className="text-sm text-muted">Poids de chaque critère dans le tri « Recommandés » de la marketplace (0 = ignoré, 1 = maximum).</p>
          {RANKING.map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 flex justify-between text-sm"><span className="font-medium text-ink-soft">{label}</span><span className="tabular-nums">{Number(form.ranking[k]).toFixed(2)}</span></span>
              <input type="range" min={0} max={1} step={0.05} value={form.ranking[k]} onChange={(e) => set('ranking', k, Number(e.target.value))} className="w-full accent-brand-600" />
            </label>
          ))}
          {footer('ranking')}
        </Card>
      )}
      {tab === 'templates' && <Templates />}
    </>
  );
}
