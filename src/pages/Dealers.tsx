import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faArrowUpRightFromSquare,
  faClock,
  faEnvelope,
  faLocationCrosshairs,
  faLocationDot,
  faMagnifyingGlass,
  faMinus,
  faPhone,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import type { Dealer } from "../types";
import { DEALERS } from "../catalog/dealers";

export type { Dealer };
export { DEALERS };

const ZOOMS = [0.22, 0.12, 0.065, 0.035];
const osmEmbed = (lat: number, lon: number, d: number) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d}%2C${lat - d}%2C${lon + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lon}`;
const directionsLink = (d: Dealer) => `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lon}`;
const telHref = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim().replace(/\s+/g, " ");
function groupCities(dealers: Dealer[]) {
  const cities: { id: string; name: string; dealers: Dealer[] }[] = [];
  const lookup = new Map<string, (typeof cities)[number]>();
  for (const dealer of dealers) {
    const id = normalize(dealer.city);
    let city = lookup.get(id);
    if (!city) { city = { id, name: dealer.city.trim(), dealers: [] }; lookup.set(id, city); cities.push(city); }
    city.dealers.push(dealer);
  }
  return cities;
}

const ICON = "w-4 shrink-0 text-[#98741b] dark:text-[#ffd100]";
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40 dark:text-white/40";

export default function Dealers(props: { go: (p: string, id?: string) => void; initialCity?: string }) {
  if (DEALERS.length === 0) return <div className="mx-auto max-w-5xl p-8 text-sm">Aucun revendeur renseigné pour le moment.</div>;
  return <DealerContent {...props} />;
}

function DealerContent({ go, initialCity }: { go: (p: string, id?: string) => void; initialCity?: string }) {
  const valid = DEALERS.some((d) => d.key === initialCity);
  const [activeKey, setActiveKey] = useState(valid ? initialCity! : DEALERS[0].key);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [mapReady, setMapReady] = useState(false);
  const [mapEnabled, setMapEnabled] = useState(false);
  const locatorRef = useRef<HTMLDivElement>(null);
  const cityTrackRef = useRef<HTMLDivElement>(null);
  const dealerTrackRef = useRef<HTMLUListElement>(null);
  const [cityAtStart, setCityAtStart] = useState(true);
  const [cityAtEnd, setCityAtEnd] = useState(true);
  const [sliderAtStart, setSliderAtStart] = useState(true);
  const [sliderAtEnd, setSliderAtEnd] = useState(false);
  const dealer = DEALERS.find((d) => d.key === activeKey)!;
  const coords = typeof dealer.lat === "number" && Number.isFinite(dealer.lat) && Math.abs(dealer.lat) <= 90 && typeof dealer.lon === "number" && Number.isFinite(dealer.lon) && Math.abs(dealer.lon) <= 180 ? { lat: dealer.lat, lon: dealer.lon } : null;
  const cities = groupCities(DEALERS);
  const activeCity = normalize(dealer.city);
  const selectedCity = cities.find((city) => city.id === activeCity)!;
  const activeCityIndex = cities.findIndex((city) => city.id === activeCity);
  const terms = normalize(query).split(" ").filter(Boolean);
  const results = terms.length ? DEALERS.filter((item) => {
    const text = normalize(`${item.city} ${item.name} ${item.address}`);
    return terms.every((term) => text.includes(term));
  }) : [];

  useEffect(() => {
    if (initialCity && DEALERS.some((d) => d.key === initialCity)) select(initialCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCity]);

  function select(key: string, scroll = false) {
    setQuery("");
    if (key !== activeKey) {
      setActiveKey(key);
      setZoom(1);
      setMapReady(false);
      setMapEnabled(false);
    }
    if (scroll) requestAnimationFrame(() => locatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // Une ville sélectionnée depuis une fiche ou un lien reste visible dans la rangée mobile.
  useEffect(() => {
    const track = cityTrackRef.current;
    const selected = track?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!track || !selected) return;
    const bounds = track.getBoundingClientRect();
    const tabBounds = selected.getBoundingClientRect();
    if (tabBounds.left < bounds.left) track.scrollLeft += tabBounds.left - bounds.left;
    else if (tabBounds.right > bounds.right) track.scrollLeft += tabBounds.right - bounds.right;
  }, [activeKey]);

  function moveCityFocus(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % cities.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + cities.length) % cities.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = cities.length - 1;
    else return;
    event.preventDefault();
    select(cities[next].dealers[0].key);
    cityTrackRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  function updateCityEdges() {
    const track = cityTrackRef.current;
    if (!track) return;
    setCityAtStart(track.scrollLeft <= 2);
    setCityAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 2);
  }
  function scrollCities(direction: 1 | -1) {
    const track = cityTrackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.8, 180), behavior: "smooth" });
  }
  useEffect(() => {
    updateCityEdges();
    const track = cityTrackRef.current;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateCityEdges) : null;
    if (track) observer?.observe(track);
    window.addEventListener("resize", updateCityEdges);
    return () => { observer?.disconnect(); window.removeEventListener("resize", updateCityEdges); };
  }, [cities.length]);

  function changeZoom(delta: 1 | -1) {
    setZoom((z) => Math.max(0, Math.min(ZOOMS.length - 1, z + delta)));
    setMapReady(false);
  }

  /* Slider des fiches revendeurs : les flèches parcourent la liste générée
     depuis l’API des revendeurs, quel que soit le nombre de revendeurs. */
  function updateSliderEdges() {
    const el = dealerTrackRef.current;
    if (!el) return;
    setSliderAtStart(el.scrollLeft <= 4);
    setSliderAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }

  function scrollDealers(direction: 1 | -1) {
    const el = dealerTrackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 240), behavior: "smooth" });
  }

  useEffect(() => {
    updateSliderEdges();
    window.addEventListener("resize", updateSliderEdges);
    return () => window.removeEventListener("resize", updateSliderEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-x-hidden bg-white text-[#171816] dark:bg-[#141513] dark:text-[#f2f0ea]">
      <div className="page-compact-top mx-auto w-full max-w-(--container-site) px-4 pb-10 pt-6 sm:px-7 sm:pb-10 sm:pt-8 lg:px-10 lg:pb-12 lg:pt-10">
        {/* ---------------- Locator ---------------- */}
        <div ref={locatorRef} className="scroll-mt-20">
          <h1 className="mb-4 font-display text-[clamp(1.45rem,1.2rem+1.1vw,2.15rem)] font-semibold leading-tight tracking-[-0.05em]">
            Choisissez votre ville.
          </h1>

          <div className="relative mb-4 max-w-xl">
            <label htmlFor="dealer-search" className="mb-1.5 block text-sm font-semibold">Rechercher un revendeur ou une ville</label>
            <div className="flex min-h-11 items-center gap-3 border border-black/20 bg-white px-3 focus-within:ring-2 focus-within:ring-[#98741b] dark:border-white/20 dark:bg-[#1b1c19] dark:focus-within:ring-[#ffd100]">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-sm text-black/45 dark:text-white/55" aria-hidden="true" />
              <input id="dealer-search" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Ville, nom ou adresse" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
              {query && <button type="button" onClick={() => setQuery("")} className="min-h-11 text-xs font-semibold underline">Effacer</button>}
            </div>
            {terms.length > 0 && <div className="absolute inset-x-0 top-full z-30 max-h-64 overflow-y-auto border border-black/15 bg-white shadow-lg dark:border-white/15 dark:bg-[#1b1c19]">
              {results.length ? <ul aria-label="Résultats de recherche des revendeurs">{results.map((item) => <li key={item.key}><button type="button" onClick={() => select(item.key)} className="block w-full border-b border-black/10 px-3 py-3 text-left text-sm hover:bg-black/5 focus-visible:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"><span className="block font-semibold">{item.name}</span><span className="block text-xs text-black/60 dark:text-white/60">{item.city}{item.address && ` · ${item.address}`}</span></button></li>)}</ul> : <p role="status" className="p-3 text-sm">Aucun revendeur trouvé.</p>}
            </div>}
          </div>

          {/* Deux villes visibles sur mobile ; quatre sur ordinateur, puis défilement. */}
          <div className="flex items-stretch">
            {cities.length > 4 && <button type="button" onClick={() => scrollCities(-1)} disabled={cityAtStart} aria-label="Villes précédentes" className="hidden min-h-11 w-11 shrink-0 items-center justify-center border-y border-l border-black/10 disabled:opacity-30 sm:flex dark:border-white/10"><FontAwesomeIcon icon={faArrowLeft} /></button>}
            <div
              ref={cityTrackRef}
              role="tablist"
              aria-label="Choisir une ville"
              onScroll={updateCityEdges}
              className={"flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto border-black/10 [scrollbar-width:none] sm:snap-none sm:gap-0 sm:border-y dark:border-white/10 " + (cities.length > 4 ? "dealer-cities-many" : "")}
            >
              {cities.map((city, index) => (
                <button
                  key={city.id}
                  id={`dealer-city-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={activeCity === city.id}
                  aria-controls="dealer-panel"
                  tabIndex={activeCity === city.id ? 0 : -1}
                  onKeyDown={(event) => moveCityFocus(event, index)}
                  onClick={() => { if (city.id !== activeCity) select(city.dealers[0].key); else setQuery(""); }}
                  className="dealer-city snap-start"
                >
                  <span className="truncate">{city.name}</span>
                  {activeCity === city.id && <motion.span layoutId="dealer-city-indicator" className="absolute inset-x-0 bottom-0 hidden h-[3px] bg-[#ffd100] sm:block" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                </button>
              ))}
            </div>
            {cities.length > 4 && <button type="button" onClick={() => scrollCities(1)} disabled={cityAtEnd} aria-label="Villes suivantes" className="hidden min-h-11 w-11 shrink-0 items-center justify-center border-y border-r border-black/10 disabled:opacity-30 sm:flex dark:border-white/10"><FontAwesomeIcon icon={faArrowRight} /></button>}
          </div>
          {cities.length > 2 ? (
            <p className="mb-3 mt-1.5 text-right text-[11px] text-black/55 sm:hidden dark:text-white/60">
              Glissez pour voir les autres villes <span aria-hidden="true">→</span>
            </p>
          ) : <div className="mb-4 sm:hidden" />}
          <div className="hidden sm:mb-4 sm:block" />
          {selectedCity.dealers.length > 1 && <label className="mb-4 block max-w-xl text-sm font-semibold">Revendeur à {selectedCity.name}
            <select value={activeKey} onChange={(event) => select(event.target.value)} className="mt-2 block min-h-11 w-full border border-black/20 bg-white px-3 text-sm dark:border-white/20 dark:bg-[#1b1c19]">
              {selectedCity.dealers.map((item) => <option key={item.key} value={item.key}>{item.name}{item.address && ` — ${item.address}`}</option>)}
            </select>
          </label>}

          {/* Map + selected dealer: stacked on phones, side by side from 1024px */}
          <div
            id="dealer-panel"
            role="tabpanel"
            aria-labelledby={`dealer-city-tab-${activeCityIndex}`}
            className="grid overflow-hidden border border-black/10 bg-white lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] dark:border-white/10 dark:bg-[#1b1c19]"
          >
            <div className="relative aspect-[16/10] bg-[#e4e7dc] sm:aspect-auto sm:h-[320px] md:h-[340px] lg:h-full lg:min-h-[400px] dark:bg-[#232722]">
              {coords ? <>
              {!mapReady && <div className="skeleton absolute inset-0" aria-hidden="true" />}
              <iframe
                key={`${dealer.key}-${zoom}`}
                title={`Carte OpenStreetMap de ${dealer.city}`}
                src={osmEmbed(coords.lat, coords.lon, ZOOMS[zoom])}
                loading="lazy"
                onLoad={() => setMapReady(true)}
                className="absolute inset-0 h-full w-full border-0 transition-opacity duration-300 dark:[filter:invert(0.9)_hue-rotate(180deg)_saturate(0.4)]"
                style={{ opacity: mapReady ? 1 : 0, pointerEvents: mapEnabled ? "auto" : "none" }}
              />

              {/* Tap to activate: lets the page scroll normally on touch screens */}
              {!mapEnabled && (
                <button
                  type="button"
                  onClick={() => setMapEnabled(true)}
                  aria-label={`Activer la carte interactive de ${dealer.city}`}
                  className="absolute inset-0 z-10 flex items-end justify-start p-3 text-left sm:p-4"
                >
                  <span className="inline-flex min-h-10 items-center gap-2 bg-[#171816] px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-lg dark:bg-white dark:text-[#171816]">
                    <FontAwesomeIcon icon={faLocationCrosshairs} /> Explorer la carte
                  </span>
                </button>
              )}

              <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-4.5rem)] items-center gap-2 bg-white/95 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#171816] shadow-md backdrop-blur dark:bg-[#171816]/95 dark:text-white">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#ffd100]" />
                <span className="truncate">{dealer.city}</span>
              </div>

              <div className="absolute right-3 top-3 z-20 flex flex-col border border-black/10 bg-white shadow-md dark:border-white/10 dark:bg-[#171816]">
                <button
                  type="button"
                  aria-label="Zoomer sur la carte"
                  onClick={() => changeZoom(1)}
                  disabled={zoom === ZOOMS.length - 1}
                  className="grid h-10 w-10 place-items-center text-sm disabled:opacity-30"
                >
                  <FontAwesomeIcon icon={faPlus} />
                </button>
                <span className="h-px bg-black/10 dark:bg-white/10" />
                <button
                  type="button"
                  aria-label="Dézoomer la carte"
                  onClick={() => changeZoom(-1)}
                  disabled={zoom === 0}
                  className="grid h-10 w-10 place-items-center text-sm disabled:opacity-30"
                >
                  <FontAwesomeIcon icon={faMinus} />
                </button>
              </div>
              </> : <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-black/60 dark:text-white/60">Localisation à renseigner</div>}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={dealer.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="flex min-w-0 flex-col border-t border-black/10 p-4 sm:p-6 lg:border-l lg:border-t-0 lg:p-7 dark:border-white/10"
              >
                {dealer.kind && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#876914] dark:text-[#ffd100]">{dealer.kind}</p>}
                <h2 className="mt-1.5 font-display text-[clamp(1.4rem,1.15rem+1.4vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.05em]">
                  {dealer.name}
                </h2>
                {dealer.desc && <p className="mt-2 text-[14px] leading-6 text-black/60 dark:text-white/60">{dealer.desc}</p>}

                <dl className="mt-4 divide-y divide-black/10 border-y border-black/10 text-[14px] dark:divide-white/10 dark:border-white/10">
                  <div className="flex gap-3 py-3">
                    <FontAwesomeIcon icon={faLocationDot} className={"mt-1 " + ICON} />
                    <div className="min-w-0">
                      <dt className={LABEL}>Adresse</dt>
                      <dd className="break-words">{dealer.address || "Non renseignée"}</dd>
                    </div>
                  </div>
                  <div className="flex gap-3 py-3">
                    <FontAwesomeIcon icon={faClock} className={"mt-1 " + ICON} />
                    <div className="min-w-0">
                      <dt className={LABEL}>Horaires</dt>
                      <dd className="whitespace-pre-line break-words">{dealer.hours || "Non renseignés"}</dd>
                    </div>
                  </div>
                  <div className="flex gap-3 py-3">
                    <FontAwesomeIcon icon={faPhone} className={"mt-1 " + ICON} />
                    <div className="min-w-0">
                      <dt className={LABEL}>Téléphone</dt>
                      <dd>
                        {dealer.phone.trim() ? <a href={telHref(dealer.phone)} className="hover:underline">{dealer.phone}</a> : "Non renseigné"}
                      </dd>
                    </div>
                  </div>
                </dl>

                {dealer.services.length > 0 && <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Services">
                  {dealer.services.map((s) => (
                    <li
                      key={s}
                      className="border border-black/10 px-2 py-1 text-[11px] font-medium text-black/60 dark:border-white/10 dark:text-white/60"
                    >
                      {s}
                    </li>
                  ))}
                </ul>}

                {/* Phones: primary action full width + two equal 48px buttons.
                    ≥640px: compact inline actions. */}
                <div className="mt-auto grid grid-cols-2 gap-2 pt-5 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-3">
                  {coords && <a
                    href={directionsLink(dealer)}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 bg-[#ffd100] px-4 text-[12px] font-bold uppercase tracking-[0.08em] text-[#171816] transition active:scale-[0.98] hover:bg-[#ffe36b] sm:min-h-11 sm:text-[11px]"
                  >
                    Itinéraire <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                  </a>}
                  {dealer.phone.trim() && <a
                    href={telHref(dealer.phone)}
                    className="inline-flex min-h-12 items-center justify-center gap-2 border border-black/15 text-[12px] font-bold uppercase tracking-[0.08em] transition active:scale-[0.98] sm:min-h-11 sm:border-0 sm:border-b sm:border-black/30 sm:text-[11px] dark:border-white/20"
                  >
                    <FontAwesomeIcon icon={faPhone} /> Appeler
                  </a>}
                  {dealer.email.trim() && <a
                    href={`mailto:${dealer.email}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 border border-black/15 text-[12px] font-bold uppercase tracking-[0.08em] transition active:scale-[0.98] sm:min-h-11 sm:border-0 sm:border-b sm:border-black/30 sm:text-[11px] dark:border-white/20"
                  >
                    <FontAwesomeIcon icon={faEnvelope} /> Écrire
                  </a>}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {coords && <p className="mt-2 text-[10px] leading-4 text-black/40 dark:text-white/40">
            Carte ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
              OpenStreetMap
            </a>{" "}
            et ses contributeurs. Confirmez l'adresse exacte avant de vous déplacer.
          </p>}
        </div>

        {/* ---------------- Directory ---------------- */}
        <section className="mt-12 sm:mt-20" aria-labelledby="network-heading">
          <div className="mb-4 flex flex-col gap-1 border-t border-black/15 pt-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3 dark:border-white/15">
            <h2 id="network-heading" className="font-display text-[clamp(1.4rem,1.15rem+1.5vw,2.7rem)] font-semibold tracking-[-0.05em]">
              D'une ville à l'autre.
            </h2>
            {/* Flèches du slider de fiches (voir plus bas) */}
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-[13px] text-black/50 sm:text-sm dark:text-white/50">Touchez une fiche pour voir le revendeur.</p>
              <div className="flex shrink-0 items-center border border-black/10 bg-white shadow-md dark:border-white/10 dark:bg-[#171816]">
                <button
                  type="button"
                  onClick={() => scrollDealers(-1)}
                  disabled={sliderAtStart}
                  aria-label="Fiches des revendeurs précédentes"
                  className="grid h-10 w-10 place-items-center text-sm disabled:opacity-30"
                >
                  <FontAwesomeIcon icon={faArrowLeft} />
                </button>
                <span className="h-5 w-px bg-black/10 dark:bg-white/10" />
                <button
                  type="button"
                  onClick={() => scrollDealers(1)}
                  disabled={sliderAtEnd}
                  aria-label="Fiches des revendeurs suivantes"
                  className="grid h-10 w-10 place-items-center text-sm disabled:opacity-30"
                >
                  <FontAwesomeIcon icon={faArrowRight} />
                </button>
              </div>
            </div>
          </div>

          {/* Slider de fiches : une fiche par revendeur, générée depuis
              l’API des revendeurs — s'adapte automatiquement au nombre de
              revendeurs, sur ordinateur, tablette et mobile. */}
          <ul
            ref={dealerTrackRef}
            onScroll={updateSliderEdges}
            aria-label="Fiches des revendeurs"
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none]"
          >
            {DEALERS.map((d) => {
              const selected = d.key === activeKey;
              return (
                <li key={d.key} className="w-[min(16.5rem,78%)] shrink-0 snap-start sm:w-[19rem] lg:w-[20rem]">
                  <button
                    type="button"
                    onClick={() => select(d.key, true)}
                    aria-current={selected ? "true" : undefined}
                    className="group relative flex min-h-[7.5rem] w-full flex-col items-start gap-1 border border-black/10 bg-white py-4 pl-4 pr-3 text-left transition hover:bg-black/[0.025] active:bg-black/[0.04] dark:border-white/10 dark:bg-[#1b1c19] dark:hover:bg-white/[0.03] dark:active:bg-white/[0.05]"
                  >
                    <span
                      aria-hidden="true"
                      className={"absolute inset-y-3 left-0 w-[3px] transition " + (selected ? "bg-[#ffd100]" : "bg-transparent")}
                    />
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="min-w-0 font-display text-[clamp(1.02rem,0.92rem+0.55vw,1.3rem)] font-semibold leading-tight">{d.city}</span>
                      <span className="grid h-10 w-10 shrink-0 place-items-center text-xs text-black/40 transition group-hover:translate-x-1 group-hover:text-[#98741b] dark:text-white/40 dark:group-hover:text-[#ffd100]">
                        <FontAwesomeIcon icon={faArrowRight} />
                      </span>
                    </span>
                    <span className="mt-0.5 block w-full truncate text-[12px] text-black/50 sm:hidden dark:text-white/50">
                      {d.name}{d.address && ` · ${d.address}`}
                    </span>
                    <span className="hidden w-full truncate text-sm text-black/60 sm:block dark:text-white/60">{d.name}</span>
                    {d.kind && <span className="hidden w-full truncate text-sm text-black/45 sm:block dark:text-white/45">{d.kind}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------------- Become a dealer ---------------- */}
        <section className="mt-12 border-t border-black/15 pt-8 sm:mt-20 sm:py-12 dark:border-white/15">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <h2 className="max-w-lg font-display text-[clamp(1.35rem,1.1rem+2vw,3rem)] font-semibold leading-[1.1] tracking-[-0.05em]">
              Et si la prochaine adresse était la vôtre ?
            </h2>
            {/* Phones: solid full-width button (48px) */}
            <button
              type="button"
              onClick={() => go("contact")}
              className="inline-flex min-h-12 w-full items-center justify-between gap-4 bg-[#171816] px-4 text-[12px] font-bold uppercase tracking-[0.1em] text-white transition active:scale-[0.98] sm:hidden dark:bg-[#ffd100] dark:text-[#171816]"
            >
              Devenir revendeur <FontAwesomeIcon icon={faArrowRight} />
            </button>
            {/* Tablet / desktop: editorial underlined link */}
            <button
              type="button"
              onClick={() => go("contact")}
              className="hidden min-h-11 items-center gap-4 border-b-2 border-[#171816] text-[11px] font-bold uppercase tracking-[0.12em] transition hover:text-[#98741b] sm:inline-flex dark:border-[#ffd100] dark:hover:text-[#ffd100]"
            >
              Devenir revendeur <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
