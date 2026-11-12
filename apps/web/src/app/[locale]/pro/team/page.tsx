'use client';
import { CalendarOff, Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageTitle, Spinner, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { casablancaToIso, usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

type Range = { weekday: number; start: string; end: string };
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function HoursEditor({ member, onClose }: { member: any; onClose: (saved: boolean) => void }) {
  const { locale, t } = useI18n();
  const [ranges, setRanges] = useState<Range[]>(member.workingHours.map((w: any) => ({ weekday: w.weekday, start: fmt.minutes(w.startMin), end: fmt.minutes(w.endMin === 1440 ? 1439 : w.endMin) })));
  const action = useAction();
  const patch = (target: Range, p: Partial<Range>) => setRanges(ranges.map((r) => (r === target ? { ...r, ...p } : r)));
  return (
    <Modal open onClose={() => onClose(false)} title={t('Horaires de {name}', { name: member.displayName })} wide>
      <p className="mb-4 text-sm text-muted">{t('Ajoutez deux plages dans une journée pour créer une pause (par exemple 9:00–13:00 et 15:00–20:00). Un jour sans plage est un jour de repos.')}</p>
      <div className="space-y-3">
        {ORDER.map((d) => (
          <div key={d} className="flex flex-wrap items-start gap-3 border-b border-line pb-3">
            <span className="w-24 pt-2 text-sm font-medium capitalize">{fmt.weekday(d, locale)}</span>
            <div className="flex-1 space-y-2">
              {ranges.filter((r) => r.weekday === d).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="time" value={r.start} onChange={(e) => patch(r, { start: e.target.value })} className="h-9 w-28" aria-label={t('Début')} />
                  <span className="text-muted">–</span>
                  <Input type="time" value={r.end} onChange={(e) => patch(r, { end: e.target.value })} className="h-9 w-28" aria-label={t('Fin')} />
                  <Button variant="ghost" size="sm" onClick={() => setRanges(ranges.filter((x) => x !== r))} aria-label={t('Retirer')}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              {!ranges.some((r) => r.weekday === d) && <p className="pt-2 text-sm text-muted">{t('Repos')}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => setRanges([...ranges, { weekday: d, start: '09:00', end: '18:00' }])}><Plus className="size-4" />{t('Plage')}</Button>
          </div>
        ))}
      </div>
      {action.error && <div className="mt-4"><Alert>{action.error}</Alert></div>}
      <Button className="mt-5 w-full" busy={action.busy} onClick={() => action.run(async () => {
        await api(`/pro/staff/${member.id}/hours`, { method: 'PUT', body: { hours: ranges.map((r) => ({ weekday: r.weekday, startMin: toMin(r.start), endMin: toMin(r.end) })) } });
        onClose(true);
      })}>{t('Enregistrer les horaires')}</Button>
    </Modal>
  );
}

function TimeOffEditor({ member, onClose }: { member: any; onClose: (saved: boolean) => void }) {
  const { locale, t } = useI18n();
  const today = fmt.day();
  const [form, setForm] = useState({ from: today, fromTime: '09:00', to: today, toTime: '18:00', reason: '' });
  const [warning, setWarning] = useState<string | null>(null);
  const action = useAction();
  return (
    <Modal open onClose={() => onClose(true)} title={t('Absences de {name}', { name: member.displayName })} wide>
      {!!member.timeOffs.length && (
        <ul className="mb-5 space-y-2">
          {member.timeOffs.map((o: any) => (
            <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl bg-sand-deep px-3 py-2 text-sm">
              <span>{fmt.dateTime(o.startAt, locale)} → {fmt.dateTime(o.endAt, locale)}{o.reason ? ` · ${o.reason}` : ''}</span>
              <Button variant="ghost" size="sm" aria-label={t('Supprimer')} onClick={() => action.run(async () => { await api(`/pro/time-off/${o.id}`, { method: 'DELETE' }); onClose(true); })}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Du')}><Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
        <Field label={t('Heure')}><Input type="time" value={form.fromTime} onChange={(e) => setForm({ ...form, fromTime: e.target.value })} /></Field>
        <Field label={t('Au')}><Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
        <Field label={t('Heure')}><Input type="time" value={form.toTime} onChange={(e) => setForm({ ...form, toTime: e.target.value })} /></Field>
      </div>
      <div className="mt-3"><Field label={t('Motif (facultatif)')}><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={t('Congé, pause, formation…')} maxLength={200} /></Field></div>
      {warning && <div className="mt-4"><Alert tone="warn">{warning}</Alert></div>}
      {action.error && <div className="mt-4"><Alert>{action.error}</Alert></div>}
      <Button className="mt-5 w-full" busy={action.busy} onClick={() => action.run(async () => {
        const res = await api(`/pro/staff/${member.id}/time-off`, { body: { startAt: casablancaToIso(form.from, form.fromTime), endAt: casablancaToIso(form.to, form.toTime), reason: form.reason || undefined } });
        if (res.conflictingAppointments) setWarning(t('Absence enregistrée. Attention : {n} rendez-vous déjà pris sur cette période sont à traiter dans le planning.', { n: res.conflictingAppointments }));
        else onClose(true);
      })}>{t('Ajouter l’absence')}</Button>
    </Modal>
  );
}

export default function Team() {
  const { t } = useI18n();
  const { salon, reload: reloadSalon } = usePro();
  const { data, reload } = useApi<any[]>('/pro/staff');
  const { data: services } = useApi<any[]>('/pro/services');
  const [editing, setEditing] = useState<{ id?: string; displayName: string; title: string; active: boolean; serviceIds: string[] } | null>(null);
  const [hours, setHours] = useState<any>(null);
  const [off, setOff] = useState<any>(null);
  const action = useAction();
  const refresh = async () => { await Promise.all([reload(), reloadSalon()]); };
  const activeCount = (data ?? []).filter((m) => m.active).length;

  return (
    <>
      <PageTitle title={t('Équipe et horaires')} subtitle={t('{n} professionnel(s) actif(s) sur {max} inclus dans votre abonnement', { n: activeCount, max: salon.features.maxStaff })}
        action={salon.isOwner && <Button disabled={activeCount >= salon.features.maxStaff} onClick={() => setEditing({ displayName: '', title: '', active: true, serviceIds: (services ?? []).map((s) => s.id) })}><Plus className="size-4" />{t('Ajouter un professionnel')}</Button>} />
      {action.error && <div className="mb-4"><Alert>{action.error}</Alert></div>}
      {!data ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-center gap-4">
                <label className="group relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-brand-100 text-xl font-semibold text-brand-700" title={t('Changer la photo')}>
                  {m.photoUrl ? <img src={m.photoUrl} alt="" className="size-full object-cover" /> : m.displayName.charAt(0)}
                  {salon.isOwner && <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const form = new FormData();
                    form.append('file', file);
                    action.run(async () => { await api(`/pro/staff/${m.id}/photo`, { form }); await reload(); });
                  }} />}
                </label>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{m.displayName}{m.isOwner && <Badge tone="brand">{t('Propriétaire')}</Badge>}{!m.active && <Badge>{t('Inactif')}</Badge>}</p>
                  <p className="text-sm text-muted">{m.title ?? t('Coiffeur')} · {t('{n} prestation(s)', { n: m.services.length })}</p>
                </div>
                {salon.isOwner && <Button variant="ghost" size="sm" aria-label={t('Modifier')} onClick={() => setEditing({ id: m.id, displayName: m.displayName, title: m.title ?? '', active: m.active, serviceIds: m.services.map((s: any) => s.serviceId) })}><Pencil className="size-4" /></Button>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setHours(m)}><Clock className="size-4" />{t('Horaires')}</Button>
                <Button variant="outline" size="sm" onClick={() => setOff(m)}><CalendarOff className="size-4" />{t('Absences')}{m.timeOffs.length ? ` (${m.timeOffs.length})` : ''}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('Modifier le professionnel') : t('Nouveau professionnel')}>
        {editing && (
          <div className="space-y-4">
            <Field label={t('Nom affiché')}><Input value={editing.displayName} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} maxLength={60} /></Field>
            <Field label={t('Fonction (facultatif)')}><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder={t('Barbier, Coloriste…')} maxLength={60} /></Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-soft">{t('Prestations réalisées')}</legend>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line p-3">
                {(services ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={editing.serviceIds.includes(s.id)}
                      onChange={(e) => setEditing({ ...editing, serviceIds: e.target.checked ? [...editing.serviceIds, s.id] : editing.serviceIds.filter((x) => x !== s.id) })} />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {editing.id && <Toggle label={t('Actif (visible et réservable)')} checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} />}
            {action.error && <Alert>{action.error}</Alert>}
            <Button className="w-full" busy={action.busy} disabled={editing.displayName.length < 2} onClick={() => action.run(async () => {
              const { id, ...rest } = editing;
              await api(id ? `/pro/staff/${id}` : '/pro/staff', { method: id ? 'PATCH' : 'POST', body: { ...rest, title: rest.title || undefined } });
              setEditing(null);
              await refresh();
            })}>{t('Enregistrer')}</Button>
          </div>
        )}
      </Modal>
      {hours && <HoursEditor member={hours} onClose={(saved) => { setHours(null); if (saved) reload(); }} />}
      {off && <TimeOffEditor member={off} onClose={(saved) => { setOff(null); if (saved) reload(); }} />}
    </>
  );
}
