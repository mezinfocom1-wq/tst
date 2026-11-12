import Link from 'next/link';

/** Pied de page bilingue minimal (les libellés propres à chaque langue sont dans les pages). */
export function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted">
        <p>© {new Date().getFullYear()} Salonat · Maroc</p>
        <nav className="flex flex-wrap gap-5">
          <Link href="/fr/legal/privacy" className="hover:text-ink">Confidentialité · الخصوصية</Link>
          <Link href="/fr/pricing" className="hover:text-ink">Professionnels · المهنيون</Link>
          <Link href="/fr/support" className="hover:text-ink">Réclamation · شكاية</Link>
        </nav>
      </div>
    </footer>
  );
}
