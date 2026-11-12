import { twMerge } from 'tailwind-merge';

/**
 * Assemble des classes Tailwind. En cas de conflit (par exemple `h-11` puis `h-9`), la dernière l'emporte :
 * un composant peut ainsi surcharger proprement la taille par défaut d'un champ ou d'un bouton.
 */
export const cx = (...parts: (string | false | null | undefined)[]) => twMerge(parts.filter(Boolean).join(' '));

export const VARIANTS = {
  primary: 'bg-ink text-white hover:bg-ink-soft',
  brand: 'bg-brand-600 text-white hover:bg-brand-700',
  outline: 'border border-line bg-surface text-ink hover:bg-sand-deep',
  ghost: 'text-ink-soft hover:bg-sand-deep',
  danger: 'bg-danger text-white hover:opacity-90',
};
export const SIZES = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-sm', lg: 'h-12 px-6 text-base' };

export const buttonClass = (variant: keyof typeof VARIANTS = 'primary', size: keyof typeof SIZES = 'md') =>
  cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], SIZES[size]);
