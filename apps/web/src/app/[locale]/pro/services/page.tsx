'use client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Empty, Field, Input, Modal, PageTitle, Spinner, Table, Textarea, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

const EMPTY = { name: '', category: 'Coupe', description: '', durationMin: 30, priceMad: 50, active: true };

export default function Services() {
  const { locale, t } = useI18n();
  const { salon, reload: reloadSalon } = usePro();
  const { data, reload } = useApi<any[]>('/pro/services');
  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const action = useAction();
  const save = () => action.run(async () => {
    const { id, ...rest } = editing!;
    const body = { ...rest, description: rest.description || undefined, durationMin: Number(rest.durationMin), priceMad: Number(rest.priceMad) };
    await api(id ? `/pro/services/${id}` : '/pro/services', { method: id ? 'PATCH' : 'POST', body });
    setEditing(null);
    await Promise.all([reload(), reloadSalon()]);
  });
  return (
    <>
      <PageTitle title={t('Prestations')} subtitle={t('Vos prestations, leur durée et leur tarif.')}
        action={salon.isOwner && <Button onClick={() => setEditing(EMPTY)}><Plus className="size-4" />{t('Ajouter')}</Button>} />
      {!data ? <Spinner /> : !data.length ? <Empty title={t('Aucune prestation')}>{t('Ajoutez vos prestations pour que les clients puissent réserver.')}</Empty> : (
        <Table head={[t('Prestation'), t('Catégorie'), t('Durée'), t('Tarif'), t('État'), '']}>
          {data.map((s) => (
            <tr key={s.id}>
              <td><p className="font-medium">{s.name}</p>{s.description && <p className="text-xs text-muted">{s.description}</p>}</td>
              <td>{s.category}</td>
              <td className="tabular-nums">{s.durationMin} min</td>
              <td className="font-medium tabular-nums">{fmt.mad(s.priceMad, locale)}</td>
              <td><Badge tone={s.active ? 'ok' : 'neutral'}>{s.active ? t('Active') : t('Désactivée')}</Badge></td>
              <td>
                {salon.isOwner && (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...s, description: s.description ?? '' })} aria-label={t('Modifier')}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="sm" aria-label={t('Supprimer')}
                      onClick={() => confirm(t('Supprimer cette prestation ?')) && action.run(async () => { await api(`/pro/services/${s.id}`, { method: 'DELETE' }); await Promise.all([reload(), reloadSalon()]); })}><Trash2 className="size-4" /></Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('Modifier la prestation') : t('Nouvelle prestation')}>
        {editing && (
          <div className="space-y-4">
            <Field label={t('Nom')}><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} /></Field>
            <Field label={t('Catégorie')} hint={t('Exemples : Coupe, Barbe, Couleur, Soin, Enfant')}><Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} maxLength={40} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Durée (minutes)')}><Input type="number" min={5} max={480} step={5} value={editing.durationMin} onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) })} /></Field>
              <Field label={t('Tarif (DH)')}><Input type="number" min={0} value={editing.priceMad} onChange={(e) => setEditing({ ...editing, priceMad: Number(e.target.value) })} /></Field>
            </div>
            <Field label={t('Description (facultatif)')}><Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={500} className="min-h-16" /></Field>
            {editing.id && <Toggle label={t('Proposée aux clients')} checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} />}
            {action.error && <Alert>{action.error}</Alert>}
            <Button className="w-full" busy={action.busy} disabled={editing.name.length < 2} onClick={save}>{t('Enregistrer')}</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
