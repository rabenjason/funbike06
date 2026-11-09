import { products } from "../catalog/products";
import type { Product } from "../types/product";
import { BikeCard, PartCard } from "../components/Cards";
import { usePromotions } from "../components/PromotionsContext";

const groups = [
  { key: "motos", label: "Motos", categories: ["motos"] },
  { key: "equipements", label: "Équipements et casques", categories: ["equipements", "casques"] },
  { key: "pieces", label: "Pièces détachées", categories: ["pieces-detachees"] },
] as const;
const knownCategories: readonly string[] = groups.flatMap((group) => [...group.categories]);

function categoryGroups(selected: Product[]) {
  const sections = groups.map((group) => ({
    key: group.key,
    label: group.label,
    products: selected.filter((product) => (group.categories as readonly string[]).includes(product.categoryId)),
  }));
  const other = selected.filter((product) => !knownCategories.includes(product.categoryId));
  return [...sections, { key: "autres", label: "Autres produits", products: other }].filter((group) => group.products.length > 0);
}

export default function Promotions({ go }: { go: (page: string, id?: string, categoryId?: string) => void }) {
  const { campaigns, status } = usePromotions();
  return <div className="mx-auto w-full max-w-(--container-site) px-4 pb-10 pt-6 sm:px-6 sm:pt-8 md:px-8 lg:px-10">
    <h1 className="sr-only">Promotions</h1>
    {status === "loading" && <p role="status">Chargement des promotions…</p>}
    {status === "error" && <p role="alert">Les promotions sont momentanément indisponibles. Veuillez réessayer.</p>}
    {status === "ready" && campaigns.length === 0 && <div><h2 className="fluid-h2 font-display font-semibold">Promotions</h2><p className="mt-3 text-sm text-black/60 dark:text-white/60">Aucune promotion active pour le moment.</p><p className="mt-2 text-sm text-black/60 dark:text-white/60">Découvrez notre catalogue ou revenez bientôt.</p></div>}
    <div className="space-y-12">
      {campaigns.map((campaign) => {
        const selected = campaign.products.map((item) => products.find((p) => p.id === item.productId && p.categoryId === item.categoryId)).filter((p): p is Product => !!p);
        return <section key={campaign.id} aria-labelledby={`promotion-${campaign.id}`}>
          <h2 id={`promotion-${campaign.id}`} className="fluid-h2 font-display font-semibold text-[#171816] dark:text-[#f2f0ea]">{campaign.name}</h2>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">Offre du {campaign.startDate.split('-').reverse().join('/')} au {campaign.endDate.split('-').reverse().join('/')} inclus.</p>
          <div className="mt-7 space-y-9 sm:space-y-10">
            {categoryGroups(selected).map((group) => <section key={group.key} aria-labelledby={`promotion-${campaign.id}-${group.key}`}>
              <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-black/10 pb-2 dark:border-white/10">
                <h3 id={`promotion-${campaign.id}-${group.key}`} className="font-display text-lg font-semibold text-[#171816] dark:text-[#f2f0ea]">{group.label}</h3>
                <span className="shrink-0 text-xs text-black/50 dark:text-white/50">{group.products.length} produit{group.products.length > 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                {group.products.map((product) => <div key={`${product.categoryId}:${product.id}`} className="min-w-0 [&>article]:h-full">{product.categoryId === 'motos' ? <BikeCard bike={product} go={go} uniformLayout compact /> : <PartCard part={product} go={go} compact />}</div>)}
              </div>
            </section>)}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
