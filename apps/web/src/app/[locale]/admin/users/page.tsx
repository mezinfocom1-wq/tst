'use client';
import { useState } from 'react';
import { FilterTabs } from '@/components/admin';
import { Alert, Badge, Button, Input, PageTitle, Spinner, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';
import { fmt } from '@/lib/translate';

const ROLE: Record<string, string> = { CLIENT: 'Client', PROFESSIONAL: 'Professionnel', SUPER_ADMIN: 'Super Admin' };

export default function Users() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, reload } = useApi<{ total: number; items: any[] }>(`/admin/users?${new URLSearchParams({ page: String(page), ...(role ? { role } : {}), ...(q ? { q } : {}) })}`);
  const action = useAction();
  return (
    <>
      <PageTitle title="Utilisateurs" subtitle={data ? `${data.total} compte(s)` : undefined} />
      <FilterTabs value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[['', 'Tous'], ['CLIENT', 'Clients'], ['PROFESSIONAL', 'Professionnels'], ['SUPER_ADMIN', 'Administrateurs']]} />
      <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Rechercher par nom ou email…" className="mb-4 max-w-sm" />
      {action.error && <div className="mb-4"><Alert>{action.error}</Alert></div>}
      {!data ? <Spinner /> : (
        <>
          <Table head={['Utilisateur', 'Téléphone', 'Rôle', 'Email vérifié', 'Inscrit le', 'État', '']}>
            {data.items.map((u) => (
              <tr key={u.id}>
                <td><p className="font-medium">{u.firstName} {u.lastName}</p><p className="text-xs text-muted">{u.email}</p></td>
                <td>{u.phone ?? '—'}</td>
                <td><Badge tone={u.role === 'SUPER_ADMIN' ? 'brand' : u.role === 'PROFESSIONAL' ? 'info' : 'neutral'}>{ROLE[u.role]}</Badge></td>
                <td>{u.emailVerifiedAt ? 'Oui' : 'Non'}</td>
                <td>{fmt.shortDate(u.createdAt, 'fr')}</td>
                <td><Badge tone={u.status === 'ACTIVE' ? 'ok' : 'danger'}>{u.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}</Badge></td>
                <td className="text-end">
                  {u.id !== me?.id && (u.status === 'ACTIVE'
                    ? <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => confirm(`Suspendre le compte de ${u.email} ? Ses sessions seront fermées.`) && action.run(async () => { await api(`/admin/users/${u.id}/status`, { body: { status: 'SUSPENDED' } }); await reload(); })}>Suspendre</Button>
                    : <Button size="sm" variant="outline" disabled={action.busy} onClick={() => action.run(async () => { await api(`/admin/users/${u.id}/status`, { body: { status: 'ACTIVE' } }); await reload(); })}>Réactiver</Button>)}
                </td>
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
