import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import {
  motorcycles,
  brands,
  getAvailableEquipmentBrands,
  getProductFamily,
  getAvailableMotoFamilies,
  getAvailableSpareBrands,
  getAvailableTypes,
  getEquipmentProducts,
  spareParts,
  helmets,
  ridingGear,
  productTypes,
} from "../data";
import type { Product } from "../types/product";
import { Section } from "../components/Layout";
import { BikeCard, PartCard } from "../components/Cards";
import { BikeCardSkeleton, PartCardSkeleton } from "../components/Skeletons";
import Pagination from "../components/Pagination";
import { useBriefLoading } from "../hooks/useBriefLoading";
import {
  AccessoryBrandSelector,
  BrandVisual,
  type AccessoryBrand,
} from "../components/AccessoryBrands";

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const BIKES_PER_PAGE = 6;
const PARTS_PER_PAGE = 8;

const normalizeSearch = (value: string) => value.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const containsAll = (text: string, terms: string[]) => {
  const normalized = normalizeSearch(text);
  return terms.every((term) => normalized.includes(term));
};
const getBrandName = (id: string) => brands.find((brand) => brand.id === id)?.name ?? "Marque non renseignée";
const getTypeName = (id: string) => productTypes.find((type) => type.id === id)?.name ?? "";
const itemLabel = (product: Product) => [
  product.name,
  getBrandName(product.brandId),
  getTypeName(product.productTypeId),
  ...(product.compatibleBrandIds ?? []).map(getBrandName),
].join(" ");
function scrollToRef(ref: React.RefObject<HTMLDivElement | null>) {
  const el = ref.current;
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 96;
  window.scrollTo({ top, behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/*  Tout le catalogue (aperçus)                                        */
/* ------------------------------------------------------------------ */

export function Catalogue({
  go,
  motosOnly = false,
  initialQuery,
}: {
  go: (p: string, id?: string) => void;
  motosOnly?: boolean;
  initialQuery?: string;
}) {
  const [family, setFamily] = useState<string>("");
  const availableFamilies = getAvailableMotoFamilies(motorcycles);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const terms = useMemo(() => normalizeSearch(query).trim().split(/\s+/).filter(Boolean), [query]);
  const bikeList = useMemo(
    () =>
      motorcycles.filter(
        (bike) =>
          bike.status === "PUBLISHED" && (family === "" || getProductFamily(bike)?.id === family) && containsAll(`${bike.name} ${getBrandName(bike.brandId)} ${bike.description} ${getProductFamily(bike)?.name ?? ""}`, terms),
      ),
    [family, terms],
  );
  const partList = useMemo(
    () => (terms.length === 0 || motosOnly ? [] : [...spareParts, ...helmets, ...ridingGear].filter((product) => product.status === "PUBLISHED" && containsAll(itemLabel(product), terms))),
    [terms, motosOnly],
  );

  const totalPages = Math.max(1, Math.ceil(bikeList.length / BIKES_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = bikeList.slice((safePage - 1) * BIKES_PER_PAGE, safePage * BIKES_PER_PAGE);
  const loading = useBriefLoading(`${family}-${safePage}`);

  function changePage(next: number) {
    setPage(next);
    scrollToRef(gridRef);
  }

  return (
    <div>

      <Section
        title="Véhicules"
        subtitle={`${bikeList.length} modèle(s) disponible(s) · page ${safePage} sur ${totalPages}`}
        number="01 / Motos"
      >
        <div
          ref={gridRef}
          className="mb-7 flex flex-col gap-4 border-b border-black/15 pb-4 dark:border-white/15 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {[{ id: "", name: "Tous" }, ...availableFamilies].map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  setFamily(x.id);
                  setPage(1);
                }}
                aria-pressed={family === x.id}
                className={
                  "relative py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition " +
                  (family === x.id ? "text-[#171816] dark:text-white" : "text-black/45 hover:text-black dark:text-white/45 dark:hover:text-white")
                }
              >
                {x.name}
                {family === x.id && <motion.span layoutId="family-filter" className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-[#ffd100]" />}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 w-full items-center gap-2 border-b border-black/20 pb-2 text-black/40 focus-within:border-[#a27b17] dark:border-white/20 dark:focus-within:border-[#ffd100] lg:max-w-sm">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={motosOnly ? "Rechercher une moto ou une marque" : "Motos, casques, blousons, pièces..."}
              aria-label="Rechercher dans le catalogue"
              className="min-w-0 flex-1 bg-transparent text-xs text-[#171816] outline-none placeholder:text-black/40 dark:text-[#f2f0ea] dark:placeholder:text-white/40"
            />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8">
          {loading
            ? Array.from({ length: Math.max(visible.length, 3) }, (_, i) => <BikeCardSkeleton key={i} />)
            : visible.map((b) => <BikeCard key={b.id} bike={b} go={go} />)}
        </div>
        {!loading && bikeList.length === 0 && (
          <p className="py-12 text-center text-sm text-black/50 dark:text-white/50">
            {partList.length > 0 ? "Aucune moto correspondante. Des produits sont proposés plus bas." : "Aucun résultat pour cette recherche."}
          </p>
        )}

        <Pagination id={motosOnly ? "motos" : "catalogue"} page={safePage} total={totalPages} onChange={changePage} />
      </Section>

      {!motosOnly && (
        <>
          {partList.length > 0 && (
            <Section title="Résultats de recherche" subtitle={`${partList.length} produit(s) trouvé(s).`} number="02 / Résultats">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
                {partList.map((p) => (
                  <PartCard key={p.id} part={p} go={go} onEnquire={p.categoryId === "pieces-detachees" || p.brandId === "tvs" ? () => go("contact", p.id) : undefined} />
                ))}
              </div>
            </Section>
          )}
          {!terms.length && (
            <Section title="Pièces & Consommables" subtitle="Pneus, kits chaîne, freinage, filtration et pièces mécaniques." number="02 / Atelier">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                {spareParts.filter((product) => product.status === "PUBLISHED").slice(0, 5).map((p) => (
                  <PartCard key={p.id} part={p} go={go} onEnquire={() => go("contact", p.id)} />
                ))}
              </div>
              <button
                onClick={() => go("spares")}
                className="mt-8 border-b border-[#171816] pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#171816] transition hover:border-[#98741b] hover:text-[#98741b] dark:border-[#f2f0ea] dark:text-[#f2f0ea] dark:hover:text-[#ffd100]"
              >
                Voir toutes les pièces détachées
              </button>
            </Section>
          )}
          {!terms.length && (
            <Section title="Équipements pilote" subtitle="Casques, tenues, bottes et accessoires pour le pilote." number="03 / Équipement">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                {[...helmets, ...ridingGear].filter((product) => product.status === "PUBLISHED" && (product.categoryId === "casques" || product.categoryId === "equipements")).slice(0, 5).map((p) => (
                  <PartCard key={p.id} part={p} go={go} onEnquire={p.brandId === "tvs" ? () => go("contact", p.id) : undefined} />
                ))}
              </div>
              <button
                onClick={() => go("equipements")}
                className="mt-8 border-b border-[#171816] pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#171816] transition hover:border-[#98741b] hover:text-[#98741b] dark:border-[#f2f0ea] dark:text-[#f2f0ea] dark:hover:text-[#ffd100]"
              >
                Voir les équipements pilote
              </button>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page ÉQUIPEMENTS                                                   */
/* ------------------------------------------------------------------ */

export function Equipements({ go, initialBrand }: { go: (p: string, id?: string) => void; initialBrand?: string }) {
  const equipmentBrands = getAvailableEquipmentBrands();
  // Compatibilité avec les liens existants de l'accueil et de l'assistant.
  const aliases: Record<string, string> = { tld: "troy-lee-designs", mt: "mt-helmets" };
  const requestedBrand = initialBrand && equipmentBrands.some((brand) => brand.id === initialBrand)
    ? initialBrand
    : initialBrand ? (aliases[initialBrand] ?? initialBrand) : "troy-lee-designs";
  const [tab, setTab] = useState(() => equipmentBrands.some((brand) => brand.id === requestedBrand) ? requestedBrand : (initialBrand ? "" : (equipmentBrands[0]?.id ?? "")));
  const [category, setCategory] = useState<string>("");
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const allItems = getEquipmentProducts(tab);
  const types = getAvailableTypes(allItems);
  const items = category ? allItems.filter((item) => item.productTypeId === category) : allItems;
  const totalPages = Math.max(1, Math.ceil(items.length / PARTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = items.slice((safePage - 1) * PARTS_PER_PAGE, safePage * PARTS_PER_PAGE);
  const loading = useBriefLoading(`gear-${tab}-${category}-${safePage}`);

  const selectedBrand = equipmentBrands.find((brand) => brand.id === tab);
  const heading = {
    title: selectedBrand ? `Équipements ${selectedBrand.name}` : "Équipements",
    text: "Contactez Funbike pour connaître les tailles, tarifs et disponibilités.",
  };

  return (
    <div>
      <Section
        title="Choisir une marque"
        subtitle="Touchez une marque pour afficher sa gamme et les informations utiles."
        number="01 / Équipements"
      >
        <div ref={gridRef}>
          <AccessoryBrandSelector
            active={tab}
            onSelect={(key) => {
              setTab(key);
              setCategory("");
              setPage(1);
            }}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            aria-live="polite"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="mt-8"
          >
            <>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-[-0.04em] text-[#171816] dark:text-[#f2f0ea]">{heading.title}</h3>
                    <p className="mt-1 max-w-2xl text-sm text-black/55 dark:text-white/55">{heading.text}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
                    {items.length} références · page {safePage}/{totalPages}
                  </span>
                </div>

                {types.length > 0 && (
                  <div role="tablist" aria-label="Types des équipements" className="no-scrollbar mb-5 flex gap-5 overflow-x-auto border-b border-black/15 dark:border-white/15">
                    {[{ id: "", name: "Tous" }, ...types].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={category === cat.id}
                        onClick={() => {
                          setCategory(cat.id);
                          setPage(1);
                        }}
                        className={
                          "relative min-h-11 shrink-0 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors " +
                          (category === cat.id ? "text-[#171816] dark:text-white" : "text-black/45 hover:text-black dark:text-white/45 dark:hover:text-white")
                        }
                      >
                        {cat.name}
                        {category === cat.id && <motion.span layoutId="tvs-category-active" className="absolute inset-x-0 bottom-0 h-[2px] bg-[#ffd100]" />}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
                  {loading
                    ? Array.from({ length: visible.length }, (_, i) => <PartCardSkeleton key={i} />)
                    : visible.map((part) => (
                        <PartCard key={part.id} part={part} go={go} onEnquire={() => go("contact", part.id)} />
                      ))}
                </div>

                {!loading && items.length === 0 && (
                  <p className="mt-4 text-sm text-black/55 dark:text-white/55">Aucun équipement publié pour cette marque.</p>
                )}

                {tab === "tvs" && (
                  <p className="mt-4 text-xs leading-5 text-black/50 dark:text-white/50">
                    Visuels et références du catalogue officiel TVS. Tarifs, tailles et disponibilités chez Funbike Madagascar à confirmer.
                  </p>
                )}

                <Pagination
                  id={`equipements-${tab}`}
                  page={safePage}
                  total={totalPages}
                  onChange={(next) => {
                    setPage(next);
                    scrollToRef(gridRef);
                  }}
                />
              </>
          </motion.div>
        </AnimatePresence>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page PIÈCES DÉTACHÉES                                               */
/* ------------------------------------------------------------------ */

function SpareBrandSelector({ active, onSelect, available }: { active: string; onSelect: (brand: string) => void; available: ReturnType<typeof getAvailableSpareBrands> }) {
  const tabs = [{ key: "", name: "Toutes", icon: faGears }, ...available.map((brand) => ({ key: brand.id, name: brand.name, logo: brand.logoUrl }))];
  return (
    <div className="no-scrollbar flex overflow-x-auto border-b border-black/15 dark:border-white/15">
      {tabs.map((brand) => {
        const selected = active === brand.key;
        const visual: AccessoryBrand = { name: brand.name, logo: "logo" in brand ? brand.logo : undefined, icon: "icon" in brand ? brand.icon : undefined };
        return (
          <button
            key={brand.key}
            type="button"
            aria-pressed={selected}
            aria-controls="spare-parts-products"
            onClick={(event) => {
              onSelect(brand.key);
              event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
            }}
            className={
              "relative flex min-w-max items-center gap-2.5 px-3 py-3 text-left transition sm:px-5 " +
              (selected ? "bg-[#ffd100]/15" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]")
            }
          >
            <BrandVisual brand={visual} />
            <span
              className={
                "block truncate text-xs font-bold " +
                (selected ? "text-[#171816] dark:text-[#f2f0ea]" : "text-black/50 dark:text-white/50")
              }
            >
              {brand.name}
            </span>
            {selected && (
              <>
                <motion.span
                  aria-hidden="true"
                  layoutId="spare-brand-border"
                  className="pointer-events-none absolute inset-0 border border-[#ffd100]"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
                <motion.span
                  aria-hidden="true"
                  layoutId="spare-brand-active"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#ffd100]"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Spares({ go, initialBrand }: { go: (p: string, id?: string) => void; initialBrand?: string }) {
  const availableBrands = getAvailableSpareBrands(spareParts);
  const requested = initialBrand?.startsWith("spare-") ? initialBrand.slice(6) : initialBrand;
  const [brand, setBrand] = useState<string>(availableBrands.some((item) => item.id === requested) ? requested! : "");
  const [type, setType] = useState<string>("");
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const brandItems = spareParts.filter((part) => part.status === "PUBLISHED" && (!brand || part.brandId === brand || part.compatibleBrandIds?.includes(brand)));
  const types = getAvailableTypes(brandItems);
  const items = type ? brandItems.filter((part) => part.productTypeId === type) : brandItems;

  const totalPages = Math.max(1, Math.ceil(items.length / PARTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = items.slice((safePage - 1) * PARTS_PER_PAGE, safePage * PARTS_PER_PAGE);
  const loading = useBriefLoading(`spares-${brand}-${type}-${safePage}`);

  const selectedBrand = availableBrands.find((item) => item.id === brand);
  const title = selectedBrand ? `Pièces détachées ${selectedBrand.name}` : "Pièces détachées moto";
  const text = "Contactez-nous pour confirmer la compatibilité et la disponibilité des pièces.";

  return (
    <div>
      <Section
        title="Choisir une marque"
        subtitle="Touchez une marque pour afficher ses pièces et consommables."
        number="01 / Pièces"
      >
        <div ref={gridRef}>
          <SpareBrandSelector
            active={brand}
            available={availableBrands}
            onSelect={(next) => {
              setBrand(next);
              setType("");
              setPage(1);
            }}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={brand}
            aria-live="polite"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="mt-8"
          >
            <>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-[-0.04em] text-[#171816] dark:text-[#f2f0ea]">{title}</h3>
                    <p className="mt-1 max-w-2xl text-sm text-black/55 dark:text-white/55">{text}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
                    {items.length} références · page {safePage}/{totalPages}
                  </span>
                </div>

                {/* Filtre TYPE */}
                <div role="tablist" aria-label="Type de pièce" className="no-scrollbar mb-5 flex gap-5 overflow-x-auto border-b border-black/15 dark:border-white/15">
                  {[{ id: "", name: "Toutes" }, ...types].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={type === t.id}
                      onClick={() => {
                        setType(t.id);
                        setPage(1);
                      }}
                      className={
                        "relative min-h-11 shrink-0 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors " +
                        (type === t.id ? "text-[#171816] dark:text-white" : "text-black/45 hover:text-black dark:text-white/45 dark:hover:text-white")
                      }
                    >
                      {t.name}
                      {type === t.id && <motion.span layoutId="spare-type-active" className="absolute inset-x-0 bottom-0 h-[2px] bg-[#ffd100]" />}
                    </button>
                  ))}
                </div>

                <div id="spare-parts-products" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
                  {loading
                    ? Array.from({ length: visible.length }, (_, i) => <PartCardSkeleton key={i} />)
                    : visible.map((part) => (
                        <PartCard key={part.id} part={part} go={go} onEnquire={() => go("contact", part.id)} />
                      ))}
                </div>

                <p className="mt-4 text-xs leading-5 text-black/50 dark:text-white/50">
                  Produits simulés pour structurer le catalogue. Dimensions, compatibilité exacte et disponibilité à confirmer avec le modèle et l'année de la moto.
                </p>

                <Pagination
                  id={`spares-${brand}-${type}`}
                  page={safePage}
                  total={totalPages}
                  onChange={(next) => {
                    setPage(next);
                    scrollToRef(gridRef);
                  }}
                />
              </>
          </motion.div>
        </AnimatePresence>
      </Section>
    </div>
  );
}
