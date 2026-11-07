/**
 * Coordonnées FunBike centralisées — source unique de vérité.
 *
 * Utilisé par la page Contact ET par le footer : modifier une information ici
 * la met à jour automatiquement aux deux endroits. Ne créer aucune autre
 * source de coordonnées (ne rien dupliquer ailleurs).
 * Conserver les valeurs existantes telles quelles — ne rien inventer.
 */

/** Adresse e-mail principale (affichée et utilisée par le formulaire de demande). */
export let CONTACT_EMAIL = "contact@funbike.mg";

/** Numéro de téléphone principal. */
export let CONTACT_PHONE = "+261 34 00 000 00";

/** Lien d'appel du numéro de téléphone principal. */
export let CONTACT_PHONE_HREF = "tel:+261340000000";

/** Adresse physique affichée. */
export let CONTACT_ADDRESS = "Antananarivo, Madagascar";

/** Horaires d'ouverture affichés. */
export let CONTACT_HOURS = "Lun - sam · 8h00 - 17h30";

/**
 * Numéro WhatsApp FunBike.
 * Aucun numéro WhatsApp FunBike n'est actuellement affiché sur le site :
 * renseigner ici le numéro dès qu'il existe (ne rien inventer en attendant).
 */
export let CONTACT_WHATSAPP: string | null = null;

/**
 * Liens des réseaux sociaux.
 * Aucun lien réseau social n'est actuellement affiché sur la page Contact :
 * compléter cette liste dès qu'ils existent (ne rien inventer en attendant).
 */
export let CONTACT_SOCIAL_LINKS: { label: string; url: string }[] = [];

export interface ContactInfoRow {
  id: "address" | "hours" | "phone" | "email";
  label: string;
  value: string;
  href?: string;
}

/** Lignes d'informations affichées sur la page Contact, dans l'ordre. */
export const CONTACT_INFO: ContactInfoRow[] = [
  { id: "address", label: "Showroom & atelier", value: CONTACT_ADDRESS },
  { id: "hours", label: "Horaires", value: CONTACT_HOURS },
  { id: "phone", label: "Téléphone", value: CONTACT_PHONE, href: CONTACT_PHONE_HREF },
  { id: "email", label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
];

/** Actualise les coordonnées de l'API avant l'affichage du site. */
export function setContactInfo(contact: { email: string; phone: string; phoneHref: string; address: string; hours: string; whatsapp?: string | null; socialLinks?: { label: string; url: string }[] }) {
  CONTACT_EMAIL = contact.email; CONTACT_PHONE = contact.phone; CONTACT_PHONE_HREF = contact.phoneHref;
  CONTACT_ADDRESS = contact.address; CONTACT_HOURS = contact.hours;
  CONTACT_WHATSAPP = contact.whatsapp ?? null; CONTACT_SOCIAL_LINKS = contact.socialLinks ?? [];
  CONTACT_INFO.splice(0, CONTACT_INFO.length,
    { id: "address", label: "Showroom & atelier", value: CONTACT_ADDRESS },
    { id: "hours", label: "Horaires", value: CONTACT_HOURS },
    { id: "phone", label: "Téléphone", value: CONTACT_PHONE, href: CONTACT_PHONE_HREF },
    { id: "email", label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  );
}
