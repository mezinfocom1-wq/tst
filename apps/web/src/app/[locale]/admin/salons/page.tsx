'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DecisionModal, FilterTabs } from '@/components/admin';
import { Badge, Button, Empty, Input, PageTitle, Spinner, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { SALON_STATUS, SALON_TYPE } from '@/lib/labels';
import { fmt } from '@/lib/translate';

const DECISIONS = { APPROVE: 'Approuver', REQUEST_INFO: 'Demander des informations', REJECT: 'Refuser', SUSPEND: 'Suspendre', REACTIVATE: 'Réactiver' } as const;
type Kind = keyof typeof DECISIONS;
const ALLOWED: Record<string, Kind[]> = {
  PENDING_REVIEW: ['APPROVE', 'REQUEST_INFO', 'REJECT'], INFO_REQUESTED: ['APPROVE', 'REJECT'], REJECTED: ['APPROVE'], APPROVED: ['SUSPEND'], SUSPENDED: ['REACTIVATE'], DRAFT: [],
};

export default function Salons() {
  const { locale } = useI18n();
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [q, setQ] = useState('');
  const { data, reload } = useApi<{ total: number; items: any[] }>(`/admin/salons?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`);
  const [decision, setDecision] = useState<{ id: string; kind: Kind; name: string } | null>(null);
  return (
    <>
      <PageTitle title="Salons" subtitle="Un salon n’est publié qu’après votre approbation et avec un abonnement actif." />
      <FilterTabs value={status} onChange={setStatus} options={[['PENDING_REVIEW', 'À valider'], ['INFO_REQUESTED', 'Informations demandées'], ['APPROVED', 'Approuvés'], ['REJECTED', 'Refusés'], ['SUSPENDED', 'Suspendus'], ['DRAFT', 'Brouillons'], ['', 'Tous']]} />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom ou ville…" className="mb-4 max-w-sm" />
      {!data ? <Spinner /> : !data.items.length ? <Empty title="Aucun salon" /> : (
        <Table head={['Salon', 'Propriétaire', 'Contenu', 'Abonnement', 'Statut', '']}>
          {data.items.map((s) => (
            <tr key={s.id}>
              <td>
                <p className="font-medium">{s.status === 'APPROVED' && s.subscriptions.length ? <Link href={`/${locale}/salons/${s.slug}`} className="hover:text-brand-700" target="_blank">{s.name}</Link> : s.name}</p>
                <p className="text-xs text-muted">{SALON_TYPE[s.type]} · {s.address}, {s.city}</p>
                {s.description && <p className="mt-1 line-clamp-2 max-w-sm text-xs text-ink-soft">{s.description}</p>}
                {s.reviewNote && <p className="mt-1 max-w-sm text-xs text-info">Note : {s.reviewNote}</p>}
              </td>
              <td><p>{s.owner.firstName} {s.owner.lastName}</p><p className="text-xs text-muted">{s.owner.email}{s.owner.phone ? ` · ${s.owner.phone}` : ''}</p></td>
              <td className="text-xs text-ink-soft">{s._count.services} prestation(s)<br />{s._count.staff} professionnel(s)<br />{s._count.photos} photo(s){s.latitude == null ? <><br /><span className="text-warn">Sans position GPS</span></> : null}</td>
              <td>{s.subscriptions[0] ? <><Badge tone="ok">{s.subscriptions[0].plan.name}</Badge><p className="mt-1 text-xs text-muted">jusqu’au {fmt.shortDate(s.subscriptions[0].endsAt, 'fr')}</p></> : <Badge>Aucun</Badge>}</td>
              <td><Badge tone={SALON_STATUS[s.status][1]}>{SALON_STATUS[s.status][0]}</Badge></td>
              <td>
                <div className="flex flex-wrap justify-end gap-1">
                  {ALLOWED[s.status].map((k) => (
                    <Button key={k} size="sm" variant={k === 'APPROVE' || k === 'REACTIVATE' ? 'primary' : k === 'SUSPEND' ? 'danger' : 'outline'} onClick={() => setDecision({ id: s.id, kind: k, name: s.name })}>{DECISIONS[k]}</Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <DecisionModal open={!!decision} title={decision ? `${DECISIONS[decision.kind]} — ${decision.name}` : ''} noteRequired={!!decision && ['REJECT', 'REQUEST_INFO', 'SUSPEND'].includes(decision.kind)} confirmLabel="Confirmer"
        onClose={() => setDecision(null)}
        onConfirm={async (note) => { await api(`/admin/salons/${decision!.id}/decision`, { body: { decision: decision!.kind, note: note || undefined } }); await reload(); }} />
    </>
  );
}
