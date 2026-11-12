'use client';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, PageTitle, Spinner, Stars, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

export default function Reviews() {
  const { locale, t } = useI18n();
  const { salon } = usePro();
  const { data, reload } = useApi<any[]>('/pro/reviews');
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const action = useAction();
  return (
    <>
      <PageTitle title={t('Avis')} subtitle={salon.ratingCount ? `${salon.ratingAvg.toFixed(1)} / 5 · ${t('{n} avis', { n: salon.ratingCount })}` : undefined} />
      {!data ? <Spinner /> : !data.length ? <Empty title={t('Pas encore d’avis')}>{t('Les clients peuvent donner leur avis après une prestation terminée.')}</Empty> : (
        <div className="space-y-3">
          {data.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-3 font-medium">{r.author}<Stars value={r.rating} size={14} />{r.hidden && <Badge tone="danger">{t('Masqué par la modération')}</Badge>}</p>
                <span className="text-xs text-muted">{fmt.shortDate(r.createdAt, locale)}</span>
              </div>
              {r.comment && <p className="mt-2 text-sm text-ink-soft">{r.comment}</p>}
              {r.reply && <p className="mt-3 rounded-xl bg-sand-deep p-3 text-sm"><span className="font-medium">{t('Votre réponse')} : </span>{r.reply}</p>}
              {salon.isOwner && (replying === r.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className="min-h-20" />
                  {action.error && <Alert>{action.error}</Alert>}
                  <div className="flex gap-2">
                    <Button size="sm" busy={action.busy} disabled={!text.trim()} onClick={() => action.run(async () => { await api(`/pro/reviews/${r.id}/reply`, { body: { reply: text } }); setReplying(null); await reload(); })}>{t('Publier la réponse')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>{t('Annuler')}</Button>
                  </div>
                </div>
              ) : <Button className="mt-3" size="sm" variant="outline" onClick={() => { setReplying(r.id); setText(r.reply ?? ''); }}>{r.reply ? t('Modifier la réponse') : t('Répondre')}</Button>)}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
