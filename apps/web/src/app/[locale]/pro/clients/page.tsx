'use client';
import { useState } from 'react';
import { Empty, Input, PageTitle, Spinner, Table } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmt } from '@/lib/translate';

export default function Clients() {
  const { locale, t } = useI18n();
  const { data } = useApi<any[]>('/pro/clients');
  const [q, setQ] = useState('');
  const rows = (data ?? []).filter((c) => `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageTitle title={t('Clients')} subtitle={t('Les clients ayant déjà été servis dans votre salon.')} />
      {!data ? <Spinner /> : !data.length ? <Empty title={t('Aucun client pour le moment')}>{t('Vos clients apparaissent ici après leur première prestation terminée.')}</Empty> : (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Rechercher un client…')} className="mb-4 max-w-sm" />
          <Table head={[t('Client'), t('Téléphone'), t('Visites'), t('Total dépensé'), t('Points'), t('Dernière visite')]}>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td dir="ltr" className="text-start">{c.phone ?? '—'}</td>
                <td className="tabular-nums">{c.visits}</td>
                <td className="tabular-nums">{fmt.mad(c.spentMad, locale)}</td>
                <td className="tabular-nums">{c.points}</td>
                <td>{fmt.shortDate(c.lastVisit, locale)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
