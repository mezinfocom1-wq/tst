'use client';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { DecisionModal, FilterTabs } from '@/components/admin';
import { Alert, Badge, Button, Empty, Modal, PageTitle, Spinner, Table } from '@/components/ui';
import { api, apiBlobUrl } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@/lib/labels';
import { fmt } from '@/lib/translate';

export default function Payments() {
  const [status, setStatus] = useState('TO_VERIFY');
  const { data, reload } = useApi<any[]>(`/admin/payments${status ? `?status=${status}` : ''}`);
  const { data: subs, reload: reloadSubs } = useApi<any[]>(status === 'SUBS' ? '/admin/subscriptions' : null);
  const [proof, setProof] = useState<{ url: string; pdf: boolean } | null>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const action = useAction();

  const openProof = (id: string) => action.run(async () => {
    const url = await apiBlobUrl(`/admin/payments/${id}/proof`);
    const blob = await (await fetch(url)).blob();
    setProof({ url, pdf: blob.type === 'application/pdf' });
  });

  return (
    <>
      <PageTitle title="Paiements et abonnements" subtitle="Une preuve déposée n’active rien : l’abonnement démarre uniquement quand vous validez le paiement." />
      <FilterTabs value={status} onChange={setStatus} options={[['TO_VERIFY', 'À vérifier'], ['VALIDATED', 'Validés'], ['REJECTED', 'Refusés'], ['PENDING', 'En attente de preuve'], ['', 'Tous les paiements'], ['SUBS', 'Abonnements']]} />
      {action.error && <div className="mb-4"><Alert>{action.error}</Alert></div>}
      {status === 'SUBS' ? (!subs ? <Spinner /> : (
        <Table head={['Salon', 'Formule', 'Statut', 'Période', '']}>
          {subs.map((s) => (
            <tr key={s.id}>
              <td><p className="font-medium">{s.salon.name}</p><p className="text-xs text-muted">{s.salon.city}</p></td>
              <td>{s.plan.name}</td>
              <td><Badge tone={SUBSCRIPTION_STATUS[s.status][1]}>{SUBSCRIPTION_STATUS[s.status][0]}</Badge></td>
              <td>{s.startsAt ? `${fmt.shortDate(s.startsAt, 'fr')} → ${fmt.shortDate(s.endsAt, 'fr')}` : '—'}</td>
              <td className="text-end">
                {s.status === 'ACTIVE' && <Button size="sm" variant="danger" disabled={action.busy} onClick={() => confirm('Suspendre cet abonnement ? Le salon ne sera plus visible.') && action.run(async () => { await api(`/admin/subscriptions/${s.id}/suspend`, { method: 'POST' }); await reloadSubs(); })}>Suspendre</Button>}
                {s.status === 'SUSPENDED' && <Button size="sm" disabled={action.busy} onClick={() => action.run(async () => { await api(`/admin/subscriptions/${s.id}/reactivate`, { method: 'POST' }); await reloadSubs(); })}>Réactiver</Button>}
              </td>
            </tr>
          ))}
        </Table>
      )) : !data ? <Spinner /> : !data.length ? <Empty title="Aucun paiement" /> : (
        <Table head={['Salon', 'Formule', 'Montant', 'Référence', 'Déposé le', 'Statut', '']}>
          {data.map((p) => (
            <tr key={p.id}>
              <td><p className="font-medium">{p.subscription.salon.name}</p><p className="text-xs text-muted">{p.subscription.salon.city}</p></td>
              <td>{p.subscription.plan.name} <span className="text-xs text-muted">({p.subscription.plan.durationDays} j)</span></td>
              <td className="font-medium tabular-nums">{fmt.mad(p.amountMad, 'fr')}</td>
              <td className="font-mono text-xs">{p.reference ?? '—'}{p.receiptNumber && <p className="text-muted">Reçu {p.receiptNumber}</p>}{p.adminNote && <p className="font-sans text-danger">Motif : {p.adminNote}</p>}</td>
              <td>{fmt.dateTime(p.updatedAt, 'fr')}</td>
              <td><Badge tone={PAYMENT_STATUS[p.status][1]}>{PAYMENT_STATUS[p.status][0]}</Badge></td>
              <td>
                <div className="flex justify-end gap-1">
                  {p.status !== 'PENDING' && <Button size="sm" variant="outline" disabled={action.busy} onClick={() => openProof(p.id)}><Eye className="size-4" />Preuve</Button>}
                  {p.status === 'TO_VERIFY' && (
                    <>
                      <Button size="sm" disabled={action.busy} onClick={() => confirm(`Valider le paiement de ${p.amountMad} DH et activer l’abonnement ${p.subscription.plan.name} ?`) && action.run(async () => { await api(`/admin/payments/${p.id}/validate`, { method: 'POST' }); await reload(); })}>Valider</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(p)}>Refuser</Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!proof} onClose={() => { if (proof) URL.revokeObjectURL(proof.url); setProof(null); }} title="Preuve de paiement" wide>
        {proof && (proof.pdf ? <iframe src={proof.url} className="h-[70vh] w-full rounded-xl border border-line" title="Preuve de paiement" /> : <img src={proof.url} alt="Preuve de paiement" className="mx-auto max-h-[70vh] rounded-xl" />)}
      </Modal>
      <DecisionModal open={!!rejecting} title={`Refuser le paiement — ${rejecting?.subscription.salon.name ?? ''}`} noteRequired confirmLabel="Refuser le paiement"
        onClose={() => setRejecting(null)} onConfirm={async (note) => { await api(`/admin/payments/${rejecting.id}/reject`, { body: { note } }); await reload(); }} />
    </>
  );
}
