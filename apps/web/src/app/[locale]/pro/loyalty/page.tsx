'use client';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageTitle, Select, Spinner, Toggle, buttonClass } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

const REWARD_TYPE: Record<string, string> = { DISCOUNT_AMOUNT: 'Réduction en dirhams', DISCOUNT_PERCENT: 'Réduction en pourcentage', FREE_SERVICE: 'Prestation offerte' };

export default function Loyalty() {
  const { locale, t } = useI18n();
  const { salon } = usePro();
  const { data, reload } = useApi<any>('/pro/loyalty');
  const [program, setProgram] = useState({ enabled: false, pointsPerVisit: 10, pointsPer10Mad: 0 });
  const [reward, setReward] = useState<{ name: string; pointsCost: number; type: string; value: number } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const save = useAction(), create = useAction(), use = useAction();

  useEffect(() => { if (data) setProgram({ enabled: data.program.enabled, pointsPerVisit: data.program.pointsPerVisit, pointsPer10Mad: data.program.pointsPer10Mad }); }, [data]);

  if (!data) return <Spinner />;
  if (!data.available) {
    return (
      <>
        <PageTitle title={t('Fidélité')} />
        <Card className="p-8 text-center">
          <p className="font-medium">{t('Le programme de fidélité est inclus à partir de la formule Pro.')}</p>
          <Link href={`/${locale}/pro/billing`} className={`${buttonClass('brand')} mt-4`}>{t('Voir les formules')}</Link>
        </Card>
      </>
    );
  }
  const pending = data.redemptions.filter((r: any) => r.status === 'PENDING');

  return (
    <>
      <PageTitle title={t('Fidélité')} subtitle={t('Récompensez vos clients réguliers.')} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">{t('Règles du programme')}</h2>
          <Toggle label={t('Programme actif')} checked={program.enabled} onChange={(v) => setProgram({ ...program, enabled: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Points par visite')}><Input type="number" min={0} max={1000} value={program.pointsPerVisit} onChange={(e) => setProgram({ ...program, pointsPerVisit: Number(e.target.value) })} /></Field>
            <Field label={t('Points par tranche de 10 DH')}><Input type="number" min={0} max={100} value={program.pointsPer10Mad} onChange={(e) => setProgram({ ...program, pointsPer10Mad: Number(e.target.value) })} /></Field>
          </div>
          <p className="text-sm text-muted">{t('Exemple : une prestation à 50 DH rapporte {n} points.', { n: program.pointsPerVisit + 5 * program.pointsPer10Mad })}</p>
          {save.error && <Alert>{save.error}</Alert>}
          {salon.isOwner && <Button busy={save.busy} onClick={() => save.run(async () => { await api('/pro/loyalty', { method: 'PUT', body: program }); await reload(); })}>{t('Enregistrer')}</Button>}
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">{t('Valider un bon')}</h2>
          <p className="text-sm text-muted">{t('Saisissez le code présenté par le client pour utiliser sa récompense.')}</p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="A1B2C3D4" className="font-mono uppercase tracking-widest" maxLength={8} dir="ltr" />
            <Button busy={use.busy} disabled={code.length < 8} onClick={() => use.run(async () => { await api(`/pro/loyalty/redemptions/${code}/use`, { method: 'POST' }); setCode(''); setMessage(t('Bon validé.')); await reload(); })}>{t('Valider')}</Button>
          </div>
          {use.error && <Alert>{use.error}</Alert>}
          {message && <Alert tone="ok">{message}</Alert>}
          {!!pending.length && (
            <ul className="space-y-2 text-sm">
              {pending.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-sand-deep px-3 py-2">
                  <span>{r.client ? `${r.client.firstName} ${r.client.lastName}` : t('Client')} · {r.reward.name}</span>
                  <button className="font-mono font-semibold tracking-widest text-brand-700" dir="ltr" onClick={() => setCode(r.code)}>{r.code}</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('Récompenses')}</h2>
        {salon.isOwner && <Button size="sm" onClick={() => setReward({ name: '', pointsCost: 100, type: 'DISCOUNT_AMOUNT', value: 20 })}><Plus className="size-4" />{t('Ajouter')}</Button>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.rewards.filter((r: any) => r.active).map((r: any) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-sm text-muted">{t(REWARD_TYPE[r.type])}{r.value ? ` · ${r.type === 'DISCOUNT_PERCENT' ? `${r.value} %` : fmt.mad(r.value, locale)}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="brand">{r.pointsCost} {t('points')}</Badge>
              {salon.isOwner && <Button variant="ghost" size="sm" aria-label={t('Supprimer')} onClick={async () => { if (confirm(t('Retirer cette récompense ?'))) { await api(`/pro/loyalty/rewards/${r.id}`, { method: 'DELETE' }); reload(); } }}><Trash2 className="size-4" /></Button>}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!reward} onClose={() => setReward(null)} title={t('Nouvelle récompense')}>
        {reward && (
          <div className="space-y-4">
            <Field label={t('Nom')}><Input value={reward.name} onChange={(e) => setReward({ ...reward, name: e.target.value })} placeholder={t('Réduction de 20 DH')} maxLength={80} /></Field>
            <Field label={t('Type')}><Select value={reward.type} onChange={(e) => setReward({ ...reward, type: e.target.value })}>{Object.entries(REWARD_TYPE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Coût en points')}><Input type="number" min={1} value={reward.pointsCost} onChange={(e) => setReward({ ...reward, pointsCost: Number(e.target.value) })} /></Field>
              {reward.type !== 'FREE_SERVICE' && <Field label={reward.type === 'DISCOUNT_PERCENT' ? t('Pourcentage') : t('Montant (DH)')}><Input type="number" min={1} value={reward.value} onChange={(e) => setReward({ ...reward, value: Number(e.target.value) })} /></Field>}
            </div>
            {create.error && <Alert>{create.error}</Alert>}
            <Button className="w-full" busy={create.busy} disabled={reward.name.length < 2} onClick={() => create.run(async () => {
              await api('/pro/loyalty/rewards', { body: { name: reward.name, pointsCost: reward.pointsCost, type: reward.type, ...(reward.type !== 'FREE_SERVICE' ? { value: reward.value } : {}) } });
              setReward(null);
              await reload();
            })}>{t('Enregistrer')}</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
