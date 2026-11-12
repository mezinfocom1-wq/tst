'use client';
import { CreditCard, FileCheck, LayoutDashboard, MessageSquareWarning, ScrollText, Settings, Store, Tags, Users } from 'lucide-react';
import { Suspense } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { Sidebar } from '@/components/Sidebar';
import { Spinner } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

function AdminShell({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  const { data } = useApi<any>('/admin/stats', 60_000);
  const base = `/${locale}/admin`;
  const todo = data?.todo ?? {};
  const items = [
    { href: base, label: 'Vue d’ensemble', icon: LayoutDashboard },
    { href: `${base}/applications`, label: 'Demandes pro', icon: FileCheck, badge: todo.pendingApplications },
    { href: `${base}/salons`, label: 'Salons', icon: Store, badge: todo.pendingSalons },
    { href: `${base}/payments`, label: 'Paiements', icon: CreditCard, badge: todo.paymentsToVerify },
    { href: `${base}/plans`, label: 'Formules', icon: Tags },
    { href: `${base}/users`, label: 'Utilisateurs', icon: Users },
    { href: `${base}/complaints`, label: 'Réclamations et avis', icon: MessageSquareWarning, badge: todo.openComplaints },
    { href: `${base}/settings`, label: 'Configuration', icon: Settings },
    { href: `${base}/audit`, label: 'Journal d’activité', icon: ScrollText },
  ];
  return (
    <div className="lg:flex" dir="ltr">
      <Sidebar items={items} base={base} />
      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</div>
    </div>
  );
}

/** Espace Super Admin (interface en français uniquement). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Spinner />}><LoginGate roles={['SUPER_ADMIN']}><AdminShell>{children}</AdminShell></LoginGate></Suspense>;
}
