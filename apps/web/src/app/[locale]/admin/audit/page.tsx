'use client';
import { useState } from 'react';
import { Button, Input, PageTitle, Spinner, Table } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { fmt } from '@/lib/translate';

export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data } = useApi<{ total: number; items: any[] }>(`/admin/audit-logs?page=${page}${action ? `&action=${encodeURIComponent(action)}` : ''}`);
  return (
    <>
      <PageTitle title="Journal d’activité" subtitle="Actions sensibles : validations, paiements, suspensions, sécurité des comptes." />
      <Input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="Filtrer par action (ex. billing, salon, auth)…" className="mb-4 max-w-sm" />
      {!data ? <Spinner /> : (
        <>
          <Table head={['Date', 'Action', 'Auteur', 'Objet', 'Détails']}>
            {data.items.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap tabular-nums">{fmt.dateTime(l.createdAt, 'fr')}</td>
                <td className="font-mono text-xs">{l.action}</td>
                <td>{l.actorEmail ?? 'Système'}</td>
                <td className="text-xs text-muted">{l.entityType ? `${l.entityType} ${String(l.entityId ?? '').slice(0, 8)}` : '—'}</td>
                <td className="max-w-xs truncate font-mono text-xs text-muted">{l.meta ? JSON.stringify(l.meta) : ''}</td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
            <span className="text-muted">Page {page} / {Math.max(1, Math.ceil(data.total / 50))}</span>
            <Button size="sm" variant="outline" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>Suivant</Button>
          </div>
        </>
      )}
    </>
  );
}
