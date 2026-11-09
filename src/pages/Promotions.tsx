import { products } from "../catalog/products";
import { BikeCard, PartCard } from "../components/Cards";
import { Section } from "../components/Layout";
import { usePromotions } from "../components/PromotionsContext";

export default function Promotions({ go }: { go: (page: string, id?: string, categoryId?: string) => void }) {
  const { campaigns, status } = usePromotions();
  return <div>
    {status === "loading" && <Section title="Promotions"><p role="status">Chargement des promotions…</p></Section>}
    {status === "error" && <Section title="Promotions"><p role="alert">Les promotions sont momentanément indisponibles. Veuillez réessayer.</p></Section>}
    {status === "ready" && campaigns.length === 0 && <Section title="Promotions" subtitle="Aucune promotion active pour le moment."><p className="text-sm text-black/60 dark:text-white/60">Découvrez notre catalogue ou revenez bientôt.</p></Section>}
    {campaigns.map((campaign) => {
      const selected = campaign.products.map((item) => products.find((p) => p.id === item.productId && p.categoryId === item.categoryId)).filter((p): p is (typeof products)[number] => !!p);
      return <Section key={campaign.id} title={campaign.name} subtitle={campaign.description}>
        {campaign.bannerUrl && <img src={campaign.bannerUrl} alt="" className="mb-7 max-h-80 w-full object-cover" />}
        <p className="mb-5 text-sm text-black/60 dark:text-white/60">Offre du {campaign.startDate.split('-').reverse().join('/')} au {campaign.endDate.split('-').reverse().join('/')} inclus.</p>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">{selected.map((product) => product.categoryId === 'motos' ? <BikeCard key={product.id} bike={product} go={go} uniformLayout /> : <PartCard key={product.id} part={product} go={go} />)}</div>
      </Section>;
    })}
  </div>;
}
