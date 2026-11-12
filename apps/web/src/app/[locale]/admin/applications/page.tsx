'use client';
import { useState } from 'react';
import { DecisionModal, FilterTabs } from '@/components/admin';
import { Badge, Button, Empty, PageTitle, Spinner, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { APPLICATION_STATUS } from '@/lib/labels';
import { fmt } from '@/lib/translate';

const PROFESSION: Record<string, string> = { BARBER: 'Barbier', HAIRDRESSER: 'Coiffeur', STYLIST: 'Styliste' };
const DECISIONS = { APPROVE: 'Accepter', REQUEST_INFO: 'Demander des informations', REJECT: 'Refuser' } as const;

export default function Applications() {
  const [status, setStatus] = useState('PENDING');
  const { data, reload } = useApi<any[]>(`/admin/pro-applications${status ? `?status=${status}` : ''}`);
  const [decision, setDecision] = useState<{ id: string; kind: keyof typeof DECISIONS; name: string } | null>(null);
  return (
    <>
      <PageTitle title="Demandes d’accès professionnel" subtitle="Un compte ne devient professionnel qu’après votre acceptation." />
      <FilterTabs value={status} onChange={setStatus} options={[['PENDING', 'En attente'], ['INFO_REQUESTED', 'Informations demandées'], ['APPROVED', 'Acceptées'], ['REJECTED', 'Refusées'], ['', 'Toutes']]} />
      {!data ? <Spinner /> : !data.length ? <Empty title="Aucune demande" /> : (
        <Table head={['Demandeur', 'Salon', 'Ville', 'Métier', 'Reçue le', 'Statut', '']}>
          {data.map((a) => (
            <tr key={a.id}>
              <td><p className="font-medium">{a.user.firstName} {a.user.lastName}</p><p className="text-xs text-muted">{a.user.email} · {a.phone}</p></td>
              <td><p>{a.businessName}</p>{a.message && <p className="max-w-xs text-xs text-muted">{a.message}</p>}{a.adminNote && <p className="max-w-xs text-xs text-info">Note : {a.adminNote}</p>}</td>
              <td>{a.city}</td>
              <td>{PROFESSION[a.profession] ?? a.profession}</td>
              <td>{fmt.shortDate(a.createdAt, 'fr')}</td>
              <td><Badge tone={APPLICATION_STATUS[a.status][1]}>{APPLICATION_STATUS[a.status][0]}</Badge></td>
              <td>
                {a.status !== 'APPROVED' && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => setDecision({ id: a.id, kind: 'APPROVE', name: a.businessName })}>Accepter</Button>
                    <Button size="sm" variant="outline" onClick={() => setDecision({ id: a.id, kind: 'REQUEST_INFO', name: a.businessName })}>Infos</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDecision({ id: a.id, kind: 'REJECT', name: a.businessName })}>Refuser</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <DecisionModal open={!!decision} title={decision ? `${DECISIONS[decision.kind]} — ${decision.name}` : ''} noteRequired={decision?.kind !== 'APPROVE'} confirmLabel="Confirmer"
        onClose={() => setDecision(null)}
        onConfirm={async (note) => { await api(`/admin/pro-applications/${decision!.id}/decision`, { body: { decision: decision!.kind, note: note || undefined } }); await reload(); }} />
    </>
  );
}
