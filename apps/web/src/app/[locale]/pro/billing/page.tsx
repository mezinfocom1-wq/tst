'use client';
import { Check, FileText, Printer, Upload } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageTitle, Spinner, Table, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@/lib/labels';
import { usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

function Receipt({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const { locale, t } = useI18n();
  const { data } = useApi<any>(`/pro/billing/payments/${paymentId}/receipt`);
  return (
    <Modal open onClose={onClose} title={t('Reçu de paiement')} wide>
      {!data ? <Spinner /> : (
        <div>
          <div className="rounded-2xl border border-line p-6 text-sm">
            <div className="flex justify-between gap-4 border-b border-line pb-4">
              <div><p className="font-display text-xl font-semibold">{data.issuer}</p><p className="text-muted">{t('Reçu de paiement')}</p></div>
              <div className="text-end"><p className="font-semibold" dir="ltr">{data.receiptNumber}</p><p className="text-muted">{fmt.shortDate(data.issuedAt, locale)}</p></div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-y-2">
              <dt className="text-muted">{t('Salon')}</dt><dd className="text-end">{data.salon.name} — {data.salon.city}</dd>
              <dt className="text-muted">{t('Formule')}</dt><dd className="text-end">{data.plan}</dd>
              <dt className="text-muted">{t('Période')}</dt><dd className="text-end">{fmt.shortDate(data.periodStart, locale)} → {fmt.shortDate(data.periodEnd, locale)}</dd>
              <dt className="text-muted">{t('Référence du virement')}</dt><dd className="text-end" dir="ltr">{data.reference}</dd>
              <dt className="border-t border-line pt-3 font-semibold">{t('Montant réglé')}</dt><dd className="border-t border-line pt-3 text-end text-lg font-semibold">{fmt.mad(data.amountMad, locale)}</dd>
            </dl>
          </div>
          <Button className="no-print mt-4" variant="outline" onClick={() => window.print()}><Printer className="size-4" />{t('Imprimer')}</Button>
        </div>
      )}
    </Modal>
  );
}

export default function Billing() {
  const { locale, t } = useI18n();
  const { reload: reloadSalon } = usePro();
  const { data, reload } = useApi<any>('/pro/billing');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const choose = useAction(), proof = useAction(), cancel = useAction();
  if (!data) return <Spinner />;

  const pending = data.subscriptions.find((s: any) => s.status === 'PENDING');
  const payment = pending?.payments[0];
  const refresh = async () => { await Promise.all([reload(), reloadSalon()]); };

  return (
    <>
      <PageTitle title={t('Abonnement')} />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        {data.active ? (
          <>
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold">{data.active.plan.name} <Badge tone="ok">{t('Actif')}</Badge></p>
              <p className="text-sm text-muted">{data.active.cancelledAt ? t('Se termine le {date} (non renouvelé).', { date: fmt.shortDate(data.active.endsAt, locale) }) : t('Valable jusqu’au {date}. Renouvelez en choisissant de nouveau votre formule.', { date: fmt.shortDate(data.active.endsAt, locale) })}</p>
            </div>
            {!data.active.cancelledAt && <Button variant="ghost" size="sm" busy={cancel.busy} onClick={() => confirm(t('Annuler l’abonnement ? Il restera actif jusqu’à son terme.')) && cancel.run(async () => { await api('/pro/billing/cancel', { method: 'POST' }); await refresh(); })}>{t('Annuler l’abonnement')}</Button>}
          </>
        ) : <p className="text-sm text-ink-soft">{t('Aucun abonnement actif. Choisissez une formule : votre salon sera visible une fois le paiement validé et le salon approuvé.')}</p>}
      </Card>

      {pending && payment && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('Paiement de la formule {plan}', { plan: pending.plan.name })}</h2>
            <Badge tone={PAYMENT_STATUS[payment.status][1]}>{t(PAYMENT_STATUS[payment.status][0])}</Badge>
          </div>
          {payment.status === 'TO_VERIFY' ? (
            <Alert tone="info">{t('Preuve reçue (référence {ref}). Notre équipe vérifie votre paiement ; l’abonnement sera activé après validation.', { ref: payment.reference })}</Alert>
          ) : (
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl bg-sand-deep p-5 text-sm">
                <p className="mb-3 font-semibold">{t('1. Effectuez un virement de {amount}', { amount: fmt.mad(payment.amountMad, locale) })}</p>
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3"><dt className="text-muted">{t('Banque')}</dt><dd>{data.bank.bankName}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted">{t('Titulaire')}</dt><dd>{data.bank.accountHolder}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted">RIB</dt><dd className="font-mono" dir="ltr">{data.bank.rib}</dd></div>
                </dl>
                <p className="mt-3 text-muted">{data.bank.instructions}</p>
              </div>
              <div className="space-y-4">
                <p className="text-sm font-semibold">{t('2. Déposez la preuve de paiement')}</p>
                {payment.status === 'REJECTED' && <Alert>{t('Paiement refusé')} : {payment.adminNote}</Alert>}
                <Field label={t('Référence de la transaction')}><Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} dir="ltr" /></Field>
                <label className={cx('flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm', file ? 'border-ok bg-ok-soft text-ok' : 'border-line text-ink-soft hover:border-brand-300')}>
                  {file ? <Check className="size-5" /> : <Upload className="size-5" />}
                  <span className="truncate">{file ? file.name : t('Reçu de virement (image ou PDF, 8 Mo maximum)')}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                {proof.error && <Alert>{proof.error}</Alert>}
                <Button busy={proof.busy} disabled={!file || reference.trim().length < 3} onClick={() => proof.run(async () => {
                  const form = new FormData();
                  form.append('reference', reference.trim());
                  form.append('file', file!);
                  await api(`/pro/billing/payments/${payment.id}/proof`, { form });
                  setFile(null);
                  setReference('');
                  await refresh();
                })}>{t('Envoyer la preuve')}</Button>
                <p className="text-xs text-muted">{t('Le dépôt d’une preuve n’active pas l’abonnement : il est activé après vérification manuelle.')}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold">{t('Formules')}</h2>
      {choose.error && <div className="mb-3"><Alert>{choose.error}</Alert></div>}
      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((p: any) => {
          const current = data.active?.planId === p.id;
          return (
            <Card key={p.id} className={cx('flex flex-col p-5', current && 'border-brand-500 ring-2 ring-brand-100')}>
              <p className="flex items-center justify-between font-semibold">{p.name}{current && <Badge tone="brand">{t('Formule actuelle')}</Badge>}</p>
              <p className="mt-1 flex-1 text-sm text-muted">{p.description}</p>
              <p className="mt-4"><span className="font-display text-3xl font-semibold tabular-nums">{fmt.mad(p.priceMad, locale)}</span> <span className="text-sm text-muted">/ {p.durationDays} {t('jours')}</span></p>
              <Button className="mt-4" variant={current ? 'outline' : 'primary'} busy={choose.busy} disabled={payment?.status === 'TO_VERIFY'}
                onClick={() => choose.run(async () => { await api('/pro/billing/subscribe', { body: { planId: p.id } }); await refresh(); })}>
                {current ? t('Renouveler') : data.active ? t('Changer pour cette formule') : t('Choisir cette formule')}
              </Button>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">{t('Historique')}</h2>
      <Table head={[t('Date'), t('Formule'), t('Abonnement'), t('Période'), t('Paiement'), t('Montant'), '']}>
        {data.subscriptions.map((s: any) => (
          <tr key={s.id}>
            <td>{fmt.shortDate(s.createdAt, locale)}</td>
            <td className="font-medium">{s.plan.name}</td>
            <td><Badge tone={SUBSCRIPTION_STATUS[s.status][1]}>{t(SUBSCRIPTION_STATUS[s.status][0])}</Badge></td>
            <td>{s.startsAt ? `${fmt.shortDate(s.startsAt, locale)} → ${fmt.shortDate(s.endsAt, locale)}` : '—'}</td>
            <td>{s.payments[0] && <Badge tone={PAYMENT_STATUS[s.payments[0].status][1]}>{t(PAYMENT_STATUS[s.payments[0].status][0])}</Badge>}</td>
            <td className="tabular-nums">{fmt.mad(s.payments[0]?.amountMad, locale)}</td>
            <td>{s.payments[0]?.status === 'VALIDATED' && <Button variant="ghost" size="sm" onClick={() => setReceipt(s.payments[0].id)}><FileText className="size-4" />{t('Reçu')}</Button>}</td>
          </tr>
        ))}
      </Table>
      {receipt && <Receipt paymentId={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}
