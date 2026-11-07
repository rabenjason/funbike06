/** Coordonnées alimentées par l’API avant l’affichage du site. */

/** Adresse e-mail principale (affichée et utilisée par le formulaire de demande). */
export let CONTACT_EMAIL = "";

/** Numéro de téléphone principal. */
export let CONTACT_PHONE = "";

/** Lien d'appel du numéro de téléphone principal. */
export let CONTACT_PHONE_HREF = "";

/** Adresse physique affichée. */
export let CONTACT_ADDRESS = "";

/** Horaires d'ouverture affichés. */
export let CONTACT_HOURS = "";

/** Numéro WhatsApp éventuellement fourni par l’API. */
export let CONTACT_WHATSAPP: string | null = null;

/** Liens des réseaux sociaux éventuellement fournis par l’API. */
export let CONTACT_SOCIAL_LINKS: { label: string; url: string }[] = [];

export interface ContactInfoRow {
  id: "address" | "hours" | "phone" | "email";
  label: string;
  value: string;
  href?: string;
}

/** Rempli par l'API avant l'affichage du site. */
export const CONTACT_INFO: ContactInfoRow[] = [];

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
