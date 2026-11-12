'use client';
import { Bell, CalendarDays, Gift, Star, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { RescheduleModal } from '@/components/RescheduleModal';
import { TicketCard } from '@/components/TicketCard';
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, Spinner, Tabs, Textarea, Toggle, buttonClass, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { APPOINTMENT_STATUS, TICKET_STATUS } from '@/lib/labels';
import { fmt } from '@/lib/translate';

type Tab = 'appointments' | 'tickets' | 'loyalty' | 'notifications' | 'profile';

function ReviewModal({ target, onClose }: { target: { appointmentId?: string; ticketId?: string; salon: string } | null; onClose: (saved: boolean) => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const action = useAction();
  return (
    <Modal open={!!target} onClose={() => onClose(false)} title={t('Votre avis sur {salon}', { salon: target?.salon ?? '' })}>
      <div className="flex justify-center gap-1" role="radiogroup" aria-label={t('Note')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} / 5`} onClick={() => setRating(n)}>
            <Star className={cx('size-9', n <= rating ? 'fill-brand-500 text-brand-500' : 'text-line')} />
          </button>
        ))}
      </div>
      <Field label={t('Commentaire (facultatif)')}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} /></Field>
      {action.error && <div className="mt-3"><Alert>{action.error}</Alert></div>}
      <Button className="mt-4 w-full" busy={action.busy} onClick={() => action.run(async () => {
        await api('/reviews', { body: { appointmentId: target!.appointmentId, ticketId: target!.ticketId, rating, comment: comment || undefined } });
        setComment('');
        onClose(true);
      })}>{t('Publier mon avis')}</Button>
    </Modal>
  );
}

function Appointments() {
  const { locale, t } = useI18n();
  const { data, reload } = useApi<any[]>('/me/appointments');
  const [review, setReview] = useState<{ appointmentId: string; salon: string } | null>(null);
  const [moving, setMoving] = useState<any>(null);
  const action = useAction();
  if (!data) return <Spinner />;
  const now = Date.now();
  const upcoming = data.filter((a) => ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status) && new Date(a.endAt).getTime() > now).reverse();
  const past = data.filter((a) => !upcoming.includes(a));
  const row = (a: any, isUpcoming: boolean) => {
    const [label, tone] = APPOINTMENT_STATUS[a.status];
    const canCancel = a.status === 'CONFIRMED' && new Date(a.startAt).getTime() - now > a.salon.cancelMinHours * 3_600_000;
    return (
      <Card key={a.id} className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-sand-deep py-2">
          <span className="text-xs uppercase text-muted">{fmt.monthShort(a.startAt, locale)}</span>
          <span className="text-2xl font-semibold tabular-nums">{fmt.dayOfMonth(a.startAt)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/${locale}/salons/${a.salon.slug}`} className="font-medium hover:text-brand-700">{a.salon.name}</Link>
          <p className="text-sm text-ink-soft">{a.personName ? `${a.personName} · ` : ''}{a.service.name} — {a.staff.displayName}</p>
          <p className="text-sm text-muted">{fmt.time(a.startAt)} – {fmt.time(a.endAt)} · {fmt.mad(a.priceMad, locale)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={tone}>{t(label)}</Badge>
          {isUpcoming && canCancel && (
            <Button variant="outline" size="sm" onClick={() => setMoving({ id: a.id, salonId: a.salon.id, serviceId: a.service.id, staffId: a.staff.id, startAt: a.startAt })}>{t('Déplacer')}</Button>
          )}
          {isUpcoming && canCancel && (
            <Button variant="outline" size="sm" busy={action.busy}
              onClick={() => confirm(t('Annuler ce rendez-vous ?')) && action.run(async () => { await api(`/appointments/${a.id}/cancel`, { method: 'POST' }); await reload(); })}>{t('Annuler')}</Button>
          )}
          {a.status === 'COMPLETED' && !a.review && <Button variant="outline" size="sm" onClick={() => setReview({ appointmentId: a.id, salon: a.salon.name })}><Star className="size-4" />{t('Donner mon avis')}</Button>}
        </div>
      </Card>
    );
  };
  return (
    <div className="space-y-8">
      {action.error && <Alert>{action.error}</Alert>}
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('À venir')}</h2>
        {upcoming.length ? <div className="space-y-3">{upcoming.map((a) => row(a, true))}</div> : (
          <Empty icon={<CalendarDays className="size-8" />} title={t('Aucun rendez-vous à venir')}>
            <Link href={`/${locale}/salons`} className="font-medium text-brand-700 hover:underline">{t('Trouver un salon')}</Link>
          </Empty>
        )}
      </section>
      {!!past.length && <section><h2 className="mb-3 text-lg font-semibold">{t('Historique')}</h2><div className="space-y-3">{past.map((a) => row(a, false))}</div></section>}
      <ReviewModal target={review} onClose={(saved) => { setReview(null); if (saved) reload(); }} />
      <RescheduleModal target={moving} onClose={(moved) => { setMoving(null); if (moved) reload(); }} />
    </div>
  );
}

function Tickets() {
  const { locale, t } = useI18n();
  const { data, reload } = useApi<any[]>('/queue/tickets');
  const [review, setReview] = useState<{ ticketId: string; salon: string } | null>(null);
  if (!data) return <Spinner />;
  const active = data.filter((x) => ['WAITING', 'CALLED', 'IN_SERVICE'].includes(x.status));
  const past = data.filter((x) => !active.includes(x));
  return (
    <div className="space-y-8">
      {active.length ? <div className="grid gap-4 md:grid-cols-2">{active.map((x) => <TicketCard key={x.id} ticketId={x.id} onChange={reload} />)}</div> : (
        <Empty icon={<Ticket className="size-8" />} title={t('Aucun ticket en cours')}>{t('Scannez le QR Code d’un salon ou ouvrez sa page pour rejoindre la file.')}</Empty>
      )}
      {!!past.length && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('Historique')}</h2>
          <div className="space-y-3">
            {past.map((x) => {
              const [label, tone] = TICKET_STATUS[x.status];
              return (
                <Card key={x.id} className="flex flex-wrap items-center gap-4 p-4">
                  <span className="font-display text-2xl font-semibold tabular-nums text-brand-700">{String(x.number).padStart(3, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/${locale}/salons/${x.salon.slug}`} className="font-medium hover:text-brand-700">{x.salon.name}</Link>
                    <p className="text-sm text-muted">{x.service.name} · {fmt.dateTime(x.joinedAt, locale)}</p>
                  </div>
                  <Badge tone={tone}>{t(label)}</Badge>
                  {x.status === 'DONE' && !x.review && <Button variant="outline" size="sm" onClick={() => setReview({ ticketId: x.id, salon: x.salon.name })}><Star className="size-4" />{t('Donner mon avis')}</Button>}
                </Card>
              );
            })}
          </div>
        </section>
      )}
      <ReviewModal target={review} onClose={(saved) => { setReview(null); if (saved) reload(); }} />
    </div>
  );
}

function Loyalty() {
  const { locale, t } = useI18n();
  const { data, reload } = useApi<any[]>('/me/loyalty');
  const action = useAction();
  if (!data) return <Spinner />;
  if (!data.length) return <Empty icon={<Gift className="size-8" />} title={t('Pas encore de points')}>{t('Vous cumulez des points après chaque prestation dans les salons qui proposent un programme de fidélité.')}</Empty>;
  return (
    <div className="space-y-5">
      {action.error && <Alert>{action.error}</Alert>}
      {data.map((x) => (
        <Card key={x.salon.id} className="p-5">
          <div className="flex items-center justify-between gap-4">
            <Link href={`/${locale}/salons/${x.salon.slug}`} className="text-lg font-semibold hover:text-brand-700">{x.salon.name}</Link>
            <p className="text-end"><span className="font-display text-3xl font-semibold tabular-nums text-brand-700">{x.balance}</span> <span className="text-sm text-muted">{t('points')}</span></p>
          </div>
          {!!x.redemptions.length && (
            <div className="mt-4 space-y-2">
              {x.redemptions.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-ok-soft px-4 py-3 text-sm">
                  <span>{r.reward.name} — {t('à présenter au salon')}</span>
                  <span className="rounded-lg bg-white px-3 py-1 font-mono text-base font-semibold tracking-widest" dir="ltr">{r.code}</span>
                </div>
              ))}
            </div>
          )}
          {!!x.rewards.length && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {x.rewards.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-muted">{r.pointsCost} {t('points')}</p></div>
                  <Button size="sm" variant="outline" disabled={x.balance < r.pointsCost} busy={action.busy}
                    onClick={() => action.run(async () => { await api(`/loyalty/rewards/${r.id}/redeem`, { method: 'POST' }); await reload(); })}>{t('Échanger')}</Button>
                </div>
              ))}
            </div>
          )}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted">{t('Historique des points')}</summary>
            <ul className="mt-2 space-y-1">
              {x.history.map((h: any) => (
                <li key={h.id} className="flex justify-between text-ink-soft">
                  <span>{fmt.shortDate(h.createdAt, locale)} · {h.reason === 'EARN' ? t('Prestation') : t('Récompense')}</span>
                  <span className={cx('tabular-nums', h.points > 0 ? 'text-ok' : 'text-danger')} dir="ltr">{h.points > 0 ? '+' : ''}{h.points}</span>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      ))}
    </div>
  );
}

function Notifications() {
  const { locale, t } = useI18n();
  const { data, reload } = useApi<{ items: any[]; unread: number }>('/me/notifications');
  if (!data) return <Spinner />;
  if (!data.items.length) return <Empty icon={<Bell className="size-8" />} title={t('Aucune notification')} />;
  return (
    <div className="space-y-3">
      {data.unread > 0 && <Button variant="outline" size="sm" onClick={async () => { await api('/me/notifications/read-all', { method: 'POST' }); reload(); }}>{t('Tout marquer comme lu')}</Button>}
      {data.items.map((n) => (
        <Card key={n.id} className={cx('p-4', !n.readAt && 'border-brand-300 bg-brand-50')}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{n.title}</p>
            <span className="shrink-0 text-xs text-muted">{fmt.dateTime(n.createdAt, locale)}</span>
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-soft">{n.body}</p>
          <p className="mt-2 text-xs text-muted">{n.channel === 'EMAIL' ? 'Email' : 'Push'} · {n.status === 'SENT' ? t('Envoyée') : n.status === 'FAILED' ? t('Échec de l’envoi') : t('En attente')}</p>
        </Card>
      ))}
    </div>
  );
}

function Profile() {
  const { locale, t } = useI18n();
  const { user, reload } = useAuth();
  const [form, setForm] = useState({ firstName: user!.firstName, lastName: user!.lastName, phone: user!.phone ?? '' });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  const [saved, setSaved] = useState<string | null>(null);
  const profile = useAction(), password = useAction(), verify = useAction(), removal = useAction();
  const { signOut } = useAuth();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState('');
  const exportData = async () => {
    const blob = new Blob([JSON.stringify(await api('/me/export'), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'mes-donnees.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const prefs = user!.notifPrefs ?? {};
  const setPref = async (key: 'push' | 'email', value: boolean) => { await api('/me', { method: 'PATCH', body: { notifPrefs: { [key]: value } } }); await reload(); };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{t('Mes informations')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Prénom')}><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label={t('Nom')}><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        </div>
        <Field label={t('Adresse email')}><Input value={user!.email} disabled dir="ltr" /></Field>
        {!user!.emailVerified && (
          <Alert tone="warn">
            {t('Adresse email non confirmée.')}{' '}
            <button className="underline" disabled={verify.busy} onClick={() => verify.run(async () => { await api('/auth/resend-verification', { method: 'POST' }); setSaved(t('Email de confirmation envoyé.')); })}>{t('Renvoyer le lien')}</button>
          </Alert>
        )}
        <Field label={t('Téléphone')} hint="06XXXXXXXX"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" /></Field>
        {profile.error && <Alert>{profile.error}</Alert>}
        {saved && <Alert tone="ok">{saved}</Alert>}
        <Button busy={profile.busy} onClick={() => profile.run(async () => { await api('/me', { method: 'PATCH', body: { ...form, phone: form.phone || undefined } }); await reload(); setSaved(t('Modifications enregistrées.')); })}>{t('Enregistrer')}</Button>
      </Card>
      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="mb-2 text-lg font-semibold">{t('Préférences de notification')}</h2>
          <Toggle label={t('Notifications push')} checked={prefs.push !== false} onChange={(v) => setPref('push', v)} />
          <Toggle label={t('Notifications par email')} checked={prefs.email !== false} onChange={(v) => setPref('email', v)} />
          <p className="mt-2 text-xs text-muted">{t('Les messages de sécurité (vérification, mot de passe) sont toujours envoyés.')}</p>
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">{t('Mot de passe')}</h2>
          {user!.hasPassword && <Field label={t('Mot de passe actuel')}><Input type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} dir="ltr" /></Field>}
          <Field label={t('Nouveau mot de passe')} hint={t('8 caractères minimum')}><Input type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} dir="ltr" /></Field>
          {password.error && <Alert>{password.error}</Alert>}
          <Button variant="outline" busy={password.busy} disabled={pwd.newPassword.length < 8}
            onClick={() => password.run(async () => { await api('/me/password', { body: { newPassword: pwd.newPassword, currentPassword: pwd.currentPassword || undefined } }); setPwd({ currentPassword: '', newPassword: '' }); await reload(); setSaved(t('Mot de passe modifié.')); })}>{t('Changer le mot de passe')}</Button>
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">{t('Mes données')}</h2>
          <p className="text-sm text-muted">{t('Vous pouvez obtenir une copie de vos données ou supprimer définitivement votre compte.')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportData}>{t('Télécharger mes données')}</Button>
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleting(true)}>{t('Supprimer mon compte')}</Button>
          </div>
        </Card>
        <Modal open={deleting} onClose={() => setDeleting(false)} title={t('Supprimer mon compte')}>
          <div className="space-y-4">
            <Alert tone="warn">{t('Cette action est définitive : vos rendez-vous à venir et vos tickets seront annulés, vos points de fidélité perdus.')}</Alert>
            {user!.hasPassword && <Field label={t('Mot de passe')}><Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} dir="ltr" /></Field>}
            {removal.error && <Alert>{removal.error}</Alert>}
            <Button variant="danger" className="w-full" busy={removal.busy} disabled={user!.hasPassword && !confirmPwd}
              onClick={() => removal.run(async () => { await api('/me/delete', { body: { password: confirmPwd || undefined } }); await signOut(); router.push(`/${locale}`); })}>{t('Supprimer définitivement')}</Button>
          </div>
        </Modal>
        {user!.role === 'CLIENT' && (
          <Card className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-ink-soft">{t('Vous êtes coiffeur ou barbier ?')}</p>
            <Link href={`/${locale}/become-pro`} className={buttonClass('outline', 'sm')}>{t('Devenir professionnel')}</Link>
          </Card>
        )}
      </div>
    </div>
  );
}

function Account() {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const tab = (useSearchParams().get('tab') as Tab) ?? 'appointments';
  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">{t('Bonjour {name}', { name: user!.firstName })}</h1>
      <Tabs<Tab> value={tab} onChange={(v) => router.replace(`/${locale}/account?tab=${v}`, { scroll: false })} items={[
        { value: 'appointments', label: t('Rendez-vous') }, { value: 'tickets', label: t('File d’attente') },
        { value: 'loyalty', label: t('Fidélité') }, { value: 'notifications', label: t('Notifications') }, { value: 'profile', label: t('Profil') },
      ]} />
      {tab === 'appointments' && <Appointments />}
      {tab === 'tickets' && <Tickets />}
      {tab === 'loyalty' && <Loyalty />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'profile' && <Profile />}
    </>
  );
}

export default function AccountPage() {
  return <div className="mx-auto max-w-5xl px-4 py-8"><Suspense fallback={<Spinner />}><LoginGate><Account /></LoginGate></Suspense></div>;
}
