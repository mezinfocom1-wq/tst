'use client';
import { Download, ExternalLink, Printer, Send, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { SalonMap } from '@/components/SalonMap';
import { Alert, Badge, Button, Card, Field, Input, PageTitle, Select, Textarea, Toggle, buttonClass } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { CITIES, SALON_STATUS, SALON_TYPE } from '@/lib/labels';
import { usePro } from '@/lib/pro';

function FileButton({ label, onFile, disabled }: { label: string; onFile: (f: File) => void; disabled?: boolean }) {
  return (
    <label className={`${buttonClass('outline', 'sm')} cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <Upload className="size-4" />{label}
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );
}

export default function SalonSettings() {
  const { locale, t } = useI18n();
  const { salon, reload } = usePro();
  const [form, setForm] = useState({
    name: salon.name, description: salon.description, type: salon.type, phone: salon.phone ?? '', email: salon.email ?? '',
    address: salon.address, city: salon.city, district: salon.district ?? '', latitude: salon.latitude, longitude: salon.longitude, brandColor: salon.brandColor ?? '',
  });
  const [rules, setRules] = useState({
    bookingEnabled: salon.bookingEnabled, queueEnabled: salon.queueEnabled, queueOnsiteOnly: salon.queueOnsiteOnly, allowRequeue: salon.allowRequeue,
    lateToleranceMin: salon.lateToleranceMin, cancelMinHours: salon.cancelMinHours, bookingLeadMin: salon.bookingLeadMin, slotStepMin: salon.slotStepMin,
  });
  const [qr, setQr] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const info = useAction(), rule = useAction(), media = useAction(), submit = useAction();
  const owner = salon.isOwner;
  const qrUrl = salon.qrUrl.replace('/fr/', `/${locale}/`);

  useEffect(() => { QRCode.toDataURL(qrUrl, { width: 640, margin: 2, color: { dark: '#17130f', light: '#ffffff' } }).then(setQr); }, [qrUrl]);

  const upload = (path: string, file: File) => media.run(async () => {
    const data = new FormData();
    data.append('file', file);
    await api(path, { form: data });
    await reload();
  });
  const [statusLabel, statusTone] = SALON_STATUS[salon.status];
  const canSubmit = ['DRAFT', 'INFO_REQUESTED', 'REJECTED'].includes(salon.status);

  return (
    <>
      <PageTitle title={t('Mon salon')} action={salon.published && <Link href={`/${locale}/salons/${salon.slug}`} className={buttonClass('outline', 'sm')} target="_blank"><ExternalLink className="size-4" />{t('Voir la page publique')}</Link>} />

      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">{t('Validation du salon')} <Badge tone={statusTone}>{t(statusLabel)}</Badge></p>
          <p className="mt-1 text-sm text-muted">
            {salon.status === 'APPROVED' ? (salon.subscription ? t('Votre salon est publié dans la marketplace.') : t('Salon approuvé. Activez votre abonnement pour le publier.'))
              : salon.status === 'PENDING_REVIEW' ? t('Notre équipe examine votre salon. Vous serez prévenu par email.')
              : t('Complétez la fiche puis soumettez-la : la validation est obligatoire avant publication.')}
          </p>
          {salon.reviewNote && <p className="mt-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{t('Message de notre équipe')} : {salon.reviewNote}</p>}
          {submit.error && <div className="mt-2"><Alert>{submit.error}</Alert></div>}
        </div>
        {owner && canSubmit && <Button busy={submit.busy} onClick={() => submit.run(async () => { await api('/pro/salon/submit', { method: 'POST' }); await reload(); })}><Send className="size-4" />{t('Soumettre à la validation')}</Button>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">{t('Informations')}</h2>
          <Field label={t('Nom du salon')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!owner} /></Field>
          <Field label={t('Description')}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} disabled={!owner} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Type de salon')}><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={!owner}>{Object.entries(SALON_TYPE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</Select></Field>
            <Field label={t('Téléphone')}><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" disabled={!owner} /></Field>
          </div>
          <Field label={t('Email de contact')}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" disabled={!owner} /></Field>
          <Field label={t('Adresse')}><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!owner} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Ville')}><Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={!owner}>{[...new Set([form.city, ...CITIES])].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label={t('Quartier')}><Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!owner} /></Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-soft">{t('Position sur la carte')}</p>
            <SalonMap height={220} points={form.latitude != null && form.longitude != null ? [{ id: 'me', lat: form.latitude, lng: form.longitude, label: form.name }] : []}
              onPick={owner ? (lat, lng) => setForm((f) => ({ ...f, latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) })) : undefined} />
            <p className="mt-1 text-xs text-muted">{t('Cliquez sur la carte pour placer votre salon.')}{form.latitude != null ? ` (${form.latitude}, ${form.longitude})` : ''}</p>
          </div>
          {salon.features.customBranding && (
            <Field label={t('Couleur de votre page')}>
              <div className="flex items-center gap-3">
                <input type="color" value={form.brandColor || '#17130f'} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="size-11 rounded-xl border border-line" disabled={!owner} />
                <span className="text-sm text-muted" dir="ltr">{form.brandColor || '—'}</span>
              </div>
            </Field>
          )}
          {info.error && <Alert>{info.error}</Alert>}
          {saved && <Alert tone="ok">{saved}</Alert>}
          {owner && <Button busy={info.busy} onClick={() => info.run(async () => {
            const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v != null));
            await api('/pro/salon', { method: 'PATCH', body });
            await reload();
            setSaved(t('Modifications enregistrées.'));
          })}>{t('Enregistrer')}</Button>}
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">{t('Logo et photos')}</h2>
            <div className="flex items-center gap-4">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-brand-700">{salon.logoUrl ? <img src={salon.logoUrl} alt="" className="size-full object-cover" /> : 'Logo'}</div>
              {owner && <FileButton label={t('Changer le logo')} onFile={(f) => upload('/pro/salon/logo', f)} disabled={media.busy} />}
            </div>
            <div>
              <div className="mb-2 h-28 overflow-hidden rounded-2xl bg-sand-deep">{salon.coverUrl && <img src={salon.coverUrl} alt="" className="size-full object-cover" />}</div>
              {owner && (salon.features.customBranding
                ? <FileButton label={t('Changer la couverture')} onFile={(f) => upload('/pro/salon/cover', f)} disabled={media.busy} />
                : <p className="text-xs text-muted">{t('Image de couverture et couleur personnalisée : disponibles à partir de la formule Pro.')}</p>)}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">{t('Photos ({n} / {max})', { n: salon.photos.length, max: salon.features.maxPhotos })}</p>
              <div className="grid grid-cols-3 gap-2">
                {salon.photos.map((p) => (
                  <div key={p.id} className="group relative">
                    <img src={p.url} alt="" className="aspect-square w-full rounded-xl object-cover" />
                    {owner && <button className="absolute end-1 top-1 rounded-lg bg-ink/70 p-1.5 text-white" aria-label={t('Supprimer')}
                      onClick={() => media.run(async () => { await api(`/pro/salon/photos/${p.id}`, { method: 'DELETE' }); await reload(); })}><Trash2 className="size-4" /></button>}
                  </div>
                ))}
              </div>
              {owner && <div className="mt-3"><FileButton label={t('Ajouter une photo')} onFile={(f) => upload('/pro/salon/photos', f)} disabled={media.busy || salon.photos.length >= salon.features.maxPhotos} /></div>}
            </div>
            <p className="text-xs text-muted">{t('Formats acceptés : JPEG, PNG, WebP — 5 Mo maximum.')}</p>
            {media.error && <Alert>{media.error}</Alert>}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-lg font-semibold">{t('Réservations et file d’attente')}</h2>
            <Toggle label={t('Accepter les rendez-vous en ligne')} checked={rules.bookingEnabled} onChange={(v) => setRules({ ...rules, bookingEnabled: v })} />
            <Toggle label={t('Activer la file d’attente')} checked={rules.queueEnabled} onChange={(v) => setRules({ ...rules, queueEnabled: v })} />
            <Toggle label={t('File réservée aux clients sur place (QR Code obligatoire)')} checked={rules.queueOnsiteOnly} onChange={(v) => setRules({ ...rules, queueOnsiteOnly: v })} />
            <Toggle label={t('Autoriser la réintégration d’un client absent ou en retard')} checked={rules.allowRequeue} onChange={(v) => setRules({ ...rules, allowRequeue: v })} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label={t('Tolérance de retard (min)')}><Select value={rules.lateToleranceMin} onChange={(e) => setRules({ ...rules, lateToleranceMin: Number(e.target.value) })}>{[...new Set([0, 5, 10, 15, 20, 30, rules.lateToleranceMin])].sort((a, b) => a - b).map((n) => <option key={n}>{n}</option>)}</Select></Field>
              <Field label={t('Annulation possible jusqu’à (h avant)')}><Input type="number" min={0} max={72} value={rules.cancelMinHours} onChange={(e) => setRules({ ...rules, cancelMinHours: Number(e.target.value) })} /></Field>
              <Field label={t('Délai minimal de réservation (min)')}><Input type="number" min={0} max={1440} step={15} value={rules.bookingLeadMin} onChange={(e) => setRules({ ...rules, bookingLeadMin: Number(e.target.value) })} /></Field>
              <Field label={t('Intervalle des créneaux (min)')}><Select value={rules.slotStepMin} onChange={(e) => setRules({ ...rules, slotStepMin: Number(e.target.value) })}>{[5, 10, 15, 20, 30, 60].map((n) => <option key={n}>{n}</option>)}</Select></Field>
            </div>
            {rule.error && <div className="mt-3"><Alert>{rule.error}</Alert></div>}
            {owner && <Button className="mt-4" variant="outline" busy={rule.busy} onClick={() => rule.run(async () => { await api('/pro/salon', { method: 'PATCH', body: rules }); await reload(); setSaved(t('Modifications enregistrées.')); })}>{t('Enregistrer les règles')}</Button>}
          </Card>

          <Card id="qr" className="p-5">
            <h2 className="text-lg font-semibold">{t('QR Code du salon')}</h2>
            <p className="mt-1 text-sm text-muted">{t('Affichez-le dans votre salon : vos clients le scannent pour rejoindre la file d’attente.')}</p>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              {qr && <img src={qr} alt={t('QR Code du salon')} className="size-40 rounded-xl border border-line" />}
              <div className="flex flex-col gap-2">
                <a href={qr} download={`qr-${salon.slug}.png`} className={buttonClass('outline', 'sm')}><Download className="size-4" />{t('Télécharger')}</a>
                <Button variant="outline" size="sm" onClick={() => {
                  const w = window.open('', '_blank');
                  if (!w) return;
                  w.document.write(`<html><body style="font-family:sans-serif;text-align:center;padding:48px"><h1>${salon.name.replace(/[<>&]/g, '')}</h1><p style="font-size:20px">${t('Scannez pour rejoindre la file d’attente')}</p><img src="${qr}" style="width:420px"/></body></html>`);
                  w.document.close();
                  w.onload = () => w.print();
                }}><Printer className="size-4" />{t('Imprimer une affiche')}</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
