import { Locale, translate } from '@/lib/translate';

/**
 * Modèle de politique de confidentialité. À faire valider par un juriste et à compléter
 * (identité du responsable de traitement, référence de la déclaration CNDP) avant la mise en production.
 */
export default async function Privacy({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = translate(locale);
  const sections: [string, string][] = [
    [t('Données collectées'), t('Identité (nom, prénom), adresse email, numéro de téléphone facultatif, historique de réservations et de tickets, points de fidélité, avis publiés. Pour les professionnels : informations du salon et preuves de paiement de l’abonnement.')],
    [t('Finalités'), t('Gestion des comptes, prise de rendez-vous, file d’attente, programme de fidélité, envoi de notifications liées au service, gestion des abonnements professionnels, sécurité de la plateforme.')],
    [t('Partage'), t('Le salon dans lequel vous réservez voit votre nom, votre téléphone et l’historique de vos visites dans ce salon uniquement. Aucune donnée n’est vendue à des tiers.')],
    [t('Conservation'), t('Les données sont conservées pendant la durée de vie du compte, puis supprimées ou anonymisées, sauf obligation légale de conservation.')],
    [t('Vos droits'), t('Conformément à la loi 09-08, vous disposez d’un droit d’accès, de rectification et d’opposition. Vous pouvez l’exercer depuis votre profil ou via la page Réclamation.')],
    [t('Sécurité'), t('Mots de passe hachés, connexions chiffrées, accès cloisonné par salon, journalisation des actions sensibles.')],
  ];
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold">{t('Politique de confidentialité')}</h1>
      <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{t('Document type : à faire valider juridiquement avant la mise en service (déclaration CNDP).')}</p>
      <div className="mt-8 space-y-7">
        {sections.map(([title, text]) => (
          <section key={title}><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 leading-relaxed text-ink-soft">{text}</p></section>
        ))}
      </div>
    </article>
  );
}
