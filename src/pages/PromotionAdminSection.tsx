import { useState, type ReactNode } from "react";
import type { Product } from "../types/product";
import type { AdminCatalog } from "./AdminCatalog";
import { useConfirmation } from "../components/ConfirmationModal";
import AdminPromotions from "./AdminPromotions";
import { AdminPromotionReservations } from "./AdminPromotionReservations";

export function PromotionAdminSection({ catalog, productEditor, onDirtyChange, onSavingChange, onChanged, count }: { catalog: AdminCatalog; productEditor: (close: () => void, saved: (p: Product, refreshFailed?: boolean) => void, onBusy: (busy: boolean) => void) => ReactNode; onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void; onChanged: () => void; count: number | null }) {
  const confirm = useConfirmation(); const [tab, setTab] = useState<'campaigns' | 'reservations'>('campaigns');
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false);
  function dirtyChanged(value: boolean) { setDirty(value); onDirtyChange(value); }
  function savingChanged(value: boolean) { setSaving(value); onSavingChange(value); }
  async function switchTab(next: 'campaigns' | 'reservations') {
    if (next === tab || saving) return;
    if (dirty && !await confirm({ title: 'Abandonner les modifications ?', description: 'Les modifications non enregistrées seront perdues.', confirmLabel: 'Abandonner', cancelLabel: 'Continuer à modifier', destructive: true })) return;
    setDirty(false); onDirtyChange(false); setTab(next);
    if (next === 'reservations') onChanged();
  }
  // Stable callbacks are required by the child effects, which report changes to the parent.
  const [callbacks] = useState(() => ({ dirty: (value: boolean) => dirtyChanged(value), saving: (value: boolean) => savingChanged(value) }));
  return <div><nav aria-label="Gestion des promotions" className="mb-5 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void switchTab('campaigns')} aria-current={tab === 'campaigns' ? 'page' : undefined} className={tab === 'campaigns' ? 'rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white' : 'rounded-md border border-black/20 px-3 py-2 text-sm font-semibold'}>Campagnes</button><button type="button" disabled={saving} onClick={() => void switchTab('reservations')} aria-current={tab === 'reservations' ? 'page' : undefined} className={tab === 'reservations' ? 'rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white' : 'rounded-md border border-black/20 px-3 py-2 text-sm font-semibold'}>Réservations{count !== null && count > 0 ? ` — ${count} nouvelle${count > 1 ? 's' : ''}` : ''}</button></nav>
    {tab === 'campaigns' ? <AdminPromotions catalog={catalog} productEditor={productEditor} onDirtyChange={callbacks.dirty} onSavingChange={callbacks.saving} /> : <AdminPromotionReservations onChanged={onChanged} onDirtyChange={callbacks.dirty} onSavingChange={callbacks.saving} />}
  </div>;
}
