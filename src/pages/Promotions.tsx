import { products } from "../catalog/products";
import { BikeCard, PartCard } from "../components/Cards";
import { usePromotions } from "../components/PromotionsContext";

export default function Promotions({ go }: { go: (page: string, id?: string, categoryId?: string) => void }) {
  const { campaigns, status } = usePromotions();
  return <div className="mx-auto w-full max-w-(--container-site) px-4 pb-10 pt-6 sm:px-6 sm:pt-8 md:px-8 lg:px-10">
    <h1 className="sr-only">Promotions</h1>
    {status === "loading" && <p role="status">Chargement des promotions…</p>}
    {status === "error" && <p role="alert">Les promotions sont momentanément indisponibles. Veuillez réessayer.</p>}
    {status === "ready" && campaigns.length === 0 && <div><h2 className="fluid-h2 font-display font-semibold">Promotions</h2><p className="mt-3 text-sm text-black/60 dark:text-white/60">Aucune promotion active pour le moment.</p><p className="mt-2 text-sm text-black/60 dark:text-white/60">Découvrez notre catalogue ou revenez bientôt.</p></div>}
    <div className="space-y-12">
      {campaigns.map((campaign) => {
        const selected = campaign.products.map((item) => products.find((p) => p.id === item.productId && p.categoryId === item.categoryId)).filter((p): p is (typeof products)[number] => !!p);
        return <section key={campaign.id} aria-labelledby={`promotion-${campaign.id}`}>
          <h2 id={`promotion-${campaign.id}`} className="fluid-h2 font-display font-semibold text-[#171816] dark:text-[#f2f0ea]">{campaign.name}</h2>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">Offre du {campaign.startDate.split('-').reverse().join('/')} au {campaign.endDate.split('-').reverse().join('/')} inclus.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">{selected.map((product) => <div key={`${product.categoryId}:${product.id}`} className={(product.categoryId === 'motos' ? 'col-span-2 sm:col-span-1 ' : '') + 'min-w-0 [&>article]:h-full'}>{product.categoryId === 'motos' ? <BikeCard bike={product} go={go} uniformLayout /> : <PartCard part={product} go={go} />}</div>)}</div>
        </section>;
      })}
    </div>
  </div>;
}
