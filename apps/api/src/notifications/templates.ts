import type { NotifChannel } from '@prisma/client';

export interface Template {
  channels: NotifChannel[];
  /** Les messages de sécurité ignorent les préférences de l'utilisateur. */
  mandatory?: boolean;
  fr: { title: string; body: string };
  ar: { title: string; body: string };
}

const both: NotifChannel[] = ['PUSH', 'EMAIL'];
const push: NotifChannel[] = ['PUSH'];
const email: NotifChannel[] = ['EMAIL'];

/** Modèles par défaut. Le Super Admin peut les surcharger (table NotificationTemplate). */
export const TEMPLATES = {
  verify_email: {
    channels: email, mandatory: true,
    fr: { title: 'Confirmez votre adresse email', body: 'Bonjour {{firstName}},\n\nConfirmez votre adresse en ouvrant ce lien :\n{{link}}\n\nCe lien expire dans 24 heures.' },
    ar: { title: 'أكّد بريدك الإلكتروني', body: 'مرحبا {{firstName}}،\n\nأكّد عنوانك عبر هذا الرابط:\n{{link}}\n\nتنتهي صلاحية الرابط بعد 24 ساعة.' },
  },
  reset_password: {
    channels: email, mandatory: true,
    fr: { title: 'Réinitialisation du mot de passe', body: 'Bonjour {{firstName}},\n\nChoisissez un nouveau mot de passe via ce lien :\n{{link}}\n\nCe lien expire dans 1 heure. Ignorez ce message si vous n\'êtes pas à l\'origine de la demande.' },
    ar: { title: 'إعادة تعيين كلمة المرور', body: 'مرحبا {{firstName}}،\n\nاختر كلمة مرور جديدة عبر هذا الرابط:\n{{link}}\n\nتنتهي صلاحية الرابط بعد ساعة واحدة.' },
  },
  booking_confirmed: {
    channels: both,
    fr: { title: 'Réservation confirmée', body: 'Votre rendez-vous chez {{salon}} est confirmé : {{when}} ({{services}}).' },
    ar: { title: 'تم تأكيد الحجز', body: 'تم تأكيد موعدك في {{salon}}: {{when}} ({{services}}).' },
  },
  booking_cancelled: {
    channels: both,
    fr: { title: 'Rendez-vous annulé', body: 'Le rendez-vous chez {{salon}} du {{when}} a été annulé.' },
    ar: { title: 'تم إلغاء الموعد', body: 'تم إلغاء الموعد في {{salon}} بتاريخ {{when}}.' },
  },
  booking_reminder: {
    channels: both,
    fr: { title: 'Rappel de rendez-vous', body: 'Rappel : rendez-vous chez {{salon}} {{when}}.' },
    ar: { title: 'تذكير بالموعد', body: 'تذكير: موعدك في {{salon}} {{when}}.' },
  },
  pro_new_booking: {
    channels: push,
    fr: { title: 'Nouvelle réservation', body: '{{client}} a réservé {{services}} — {{when}}.' },
    ar: { title: 'حجز جديد', body: '{{client}} حجز {{services}} — {{when}}.' },
  },
  queue_joined: {
    channels: push,
    fr: { title: 'Ticket n° {{number}}', body: 'Vous êtes dans la file de {{salon}}. Attente estimée : {{wait}} min.' },
    ar: { title: 'التذكرة رقم {{number}}', body: 'أنت في طابور {{salon}}. الانتظار المتوقع: {{wait}} دقيقة.' },
  },
  queue_near: {
    channels: push,
    fr: { title: 'Votre tour approche', body: 'Ticket n° {{number}} chez {{salon}} : il reste {{ahead}} personne(s) devant vous.' },
    ar: { title: 'دورك يقترب', body: 'التذكرة رقم {{number}} في {{salon}}: بقي {{ahead}} شخص أمامك.' },
  },
  queue_called: {
    channels: push,
    fr: { title: "C'est votre tour", body: 'Ticket n° {{number}} : présentez-vous chez {{salon}} ({{staff}}).' },
    ar: { title: 'حان دورك', body: 'التذكرة رقم {{number}}: تفضل إلى {{salon}} ({{staff}}).' },
  },
  queue_cancelled: {
    channels: push,
    fr: { title: 'Ticket annulé', body: 'Votre ticket n° {{number}} chez {{salon}} a été annulé.' },
    ar: { title: 'تم إلغاء التذكرة', body: 'تم إلغاء تذكرتك رقم {{number}} في {{salon}}.' },
  },
  application_approved: {
    channels: email,
    fr: { title: 'Demande professionnelle acceptée', body: 'Bonjour {{firstName}},\n\nVotre demande d\'accès professionnel est acceptée. Vous pouvez maintenant créer votre salon.' },
    ar: { title: 'تم قبول طلبك المهني', body: 'مرحبا {{firstName}}،\n\nتم قبول طلبك. يمكنك الآن إنشاء صالونك.' },
  },
  application_rejected: {
    channels: email,
    fr: { title: 'Demande professionnelle refusée', body: 'Bonjour {{firstName}},\n\nVotre demande n\'a pas été retenue. Motif : {{note}}' },
    ar: { title: 'تم رفض طلبك المهني', body: 'مرحبا {{firstName}}،\n\nلم يتم قبول طلبك. السبب: {{note}}' },
  },
  application_info: {
    channels: email,
    fr: { title: 'Informations complémentaires demandées', body: 'Bonjour {{firstName}},\n\nMerci de compléter votre demande : {{note}}' },
    ar: { title: 'مطلوب معلومات إضافية', body: 'مرحبا {{firstName}}،\n\nالمرجو إكمال طلبك: {{note}}' },
  },
  salon_status: {
    channels: both,
    fr: { title: 'Salon : {{status}}', body: 'Le statut de votre salon {{salon}} est maintenant « {{status}} ». {{note}}' },
    ar: { title: 'الصالون: {{status}}', body: 'حالة صالونك {{salon}} الآن «{{status}}». {{note}}' },
  },
  payment_validated: {
    channels: both,
    fr: { title: 'Paiement validé', body: 'Votre paiement est validé. Abonnement {{plan}} actif jusqu\'au {{until}}. Reçu n° {{receipt}}.' },
    ar: { title: 'تم تأكيد الدفع', body: 'تم تأكيد دفعتك. اشتراك {{plan}} مفعّل إلى غاية {{until}}. الوصل رقم {{receipt}}.' },
  },
  payment_rejected: {
    channels: both,
    fr: { title: 'Paiement refusé', body: 'Votre preuve de paiement a été refusée. Motif : {{note}}' },
    ar: { title: 'تم رفض الدفع', body: 'تم رفض إثبات الدفع. السبب: {{note}}' },
  },
  subscription_expiring: {
    channels: both,
    fr: { title: 'Abonnement bientôt expiré', body: 'Votre abonnement {{plan}} expire le {{until}}. Renouvelez-le pour rester visible.' },
    ar: { title: 'الاشتراك يقترب من الانتهاء', body: 'ينتهي اشتراكك {{plan}} في {{until}}. جدّده لتبقى ظاهرا.' },
  },
  subscription_expired: {
    channels: both,
    fr: { title: 'Abonnement expiré', body: 'Votre abonnement {{plan}} a expiré. Votre salon n\'est plus visible dans la marketplace.' },
    ar: { title: 'انتهى الاشتراك', body: 'انتهى اشتراكك {{plan}}. لم يعد صالونك ظاهرا.' },
  },
  team_invite: {
    channels: email, mandatory: true,
    fr: { title: 'Invitation à rejoindre {{salon}}', body: 'Bonjour {{name}},\n\n{{owner}} vous invite à gérer votre planning et la file d\'attente du salon {{salon}}.\n\nAcceptez l\'invitation avec ce lien (valable 7 jours) :\n{{link}}\n\nConnectez-vous ou créez un compte avec cette adresse email.' },
    ar: { title: 'دعوة للانضمام إلى {{salon}}', body: 'مرحبا {{name}}،\n\nيدعوك {{owner}} لتدبير جدولك وطابور الانتظار في صالون {{salon}}.\n\nاقبل الدعوة عبر هذا الرابط (صالح لمدة 7 أيام):\n{{link}}\n\nسجّل الدخول أو أنشئ حسابا بهذا البريد الإلكتروني.' },
  },
  admin_action_required: {
    channels: email,
    fr: { title: 'Action requise : {{what}}', body: 'Un élément attend votre validation : {{what}} ({{detail}}).' },
    ar: { title: 'إجراء مطلوب: {{what}}', body: 'عنصر ينتظر موافقتك: {{what}} ({{detail}}).' },
  },
} satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;

export const render = (text: string, vars: Record<string, unknown>) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
