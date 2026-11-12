'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Locale, translate } from './translate';
import { setZoneTable } from './zone';

const Ctx = createContext<{ locale: Locale; t: ReturnType<typeof translate>; zoneReady: boolean }>({ locale: 'fr', t: translate('fr'), zoneReady: false });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [zoneReady, setZoneReady] = useState(false);

  // Table des décalages horaires du Maroc, fournie par le serveur. Son arrivée rafraîchit tous les affichages d'heure.
  useEffect(() => {
    fetch('/api/meta/timezone')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { setZoneTable(data.transitions); setZoneReady(true); })
      .catch(() => {});
  }, []);

  const value = useMemo(() => ({ locale, t: translate(locale), zoneReady }), [locale, zoneReady]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
