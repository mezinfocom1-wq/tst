'use client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageTitle, Spinner, Textarea, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { fmt } from '@/lib/translate';

const FLAGS: [string, string][] = [
  ['customBranding', 'Couverture et couleur personnalisées'], ['groupBooking', 'Réservation de groupe'], ['loyalty', 'Programme de fidélité'],
  ['statistics', 'Statistiques'], ['advancedStatistics', 'Statistiques avancées'],
];
const EMPTY = {
  code: '', name: '', description: '', priceMad: 199, durationDays: 30, position: 10, active: true,
  features: { maxStaff: 1, maxPhotos: 3, customBranding: false, groupBooking: false, loyalty: false, statistics: false, advancedStatistics: false } as Record<string, number | boolean>,
};

export default function Plans() {
  const { data, reload } = useApi<any[]>('/admin/plans');
  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const action = useAction();
  const save = () => action.run(async () => {
    const { id, code, ...rest } = editing!;
    const body = { ...rest, priceMad: Number(rest.priceMad), durationDays: Number(rest.durationDays), position: Number(rest.position) };
    await api(id ? `/admin/plans/${id}` : '/admin/plans', { method: id ? 'PATCH' : 'POST', body: id ? body : { ...body, code } });
    setEditing(null);
    await reload();
  });
  return (
    <>
      <PageTitle title="Formules d’abonnement" subtitle="Ajoutez, modifiez ou retirez une formule : aucune modification du code n’est nécessaire."
        action={<Button onClick={() => setEditing(EMPTY)}><Plus className="size-4" />Nouvelle formule</Button>} />
      {!data ? <Spinner /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div><p className="text-lg font-semibold">{p.name}</p><p className="font-mono text-xs text-muted">{p.code}</p></div>
                <Badge tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'Proposée' : 'Retirée'}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{p.description}</p>
              <p className="mt-3"><span className="font-display text-3xl font-semibold tabular-nums">{fmt.mad(p.priceMad, 'fr')}</span> <span className="text-sm text-muted">/ {p.durationDays} jours</span></p>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-ink-soft">
                <li>{p.features.maxStaff ?? 1} professionnel(s) · {p.features.maxPhotos ?? 3} photos</li>
                {FLAGS.filter(([k]) => p.features[k]).map(([k, label]) => <li key={k}>✓ {label}</li>)}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">{p._count.subscriptions} abonnement(s)</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...EMPTY, ...p, features: { ...EMPTY.features, ...p.features } })}><Pencil className="size-4" />Modifier</Button>
                  <Button size="sm" variant="ghost" aria-label="Supprimer" onClick={() => confirm(p._count.subscriptions ? 'Cette formule a déjà été souscrite : elle sera retirée de la vente, pas supprimée. Continuer ?' : 'Supprimer cette formule ?') && action.run(async () => { await api(`/admin/plans/${p.id}`, { method: 'DELETE' }); await reload(); })}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Modifier la formule' : 'Nouvelle formule'} wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Code" hint="Majuscules, chiffres, tiret bas. Non modifiable ensuite."><Input value={editing.code} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
            </div>
            <Field label="Description"><Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="min-h-16" maxLength={500} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Prix (DH)"><Input type="number" min={0} value={editing.priceMad} onChange={(e) => setEditing({ ...editing, priceMad: Number(e.target.value) })} /></Field>
              <Field label="Durée (jours)"><Input type="number" min={1} value={editing.durationDays} onChange={(e) => setEditing({ ...editing, durationDays: Number(e.target.value) })} /></Field>
              <Field label="Ordre d’affichage"><Input type="number" min={0} value={editing.position} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Professionnels inclus"><Input type="number" min={1} value={Number(editing.features.maxStaff)} onChange={(e) => setEditing({ ...editing, features: { ...editing.features, maxStaff: Number(e.target.value) } })} /></Field>
              <Field label="Photos incluses"><Input type="number" min={0} value={Number(editing.features.maxPhotos)} onChange={(e) => setEditing({ ...editing, features: { ...editing.features, maxPhotos: Number(e.target.value) } })} /></Field>
            </div>
            <div className="rounded-xl border border-line px-4 py-2">
              {FLAGS.map(([k, label]) => <Toggle key={k} label={label} checked={!!editing.features[k]} onChange={(v) => setEditing({ ...editing, features: { ...editing.features, [k]: v } })} />)}
              <Toggle label="Proposée à la vente" checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} />
            </div>
            {action.error && <Alert>{action.error}</Alert>}
            <Button className="w-full" busy={action.busy} disabled={editing.name.length < 2 || !/^[A-Z0-9_]{2,30}$/.test(editing.code)} onClick={save}>Enregistrer</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
