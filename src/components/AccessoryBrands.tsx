import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { getAvailableEquipmentBrands } from "../catalog";
import type { Brand } from "../types/product";

/** Visualisation partagée avec les filtres des pièces détachées. */
export type AccessoryBrand = {
  name?: string;
  logo?: string;
  icon?: IconDefinition;
};

/** Brand mark in one fixed-size slot so every selector logo has the same footprint. */
export function BrandVisual({ brand }: { brand: AccessoryBrand }) {
  if (brand.icon) {
    return (
      <span className="brand-logo-slot text-sm text-[#98741b] dark:text-[#ffd100]" aria-hidden="true">
        <FontAwesomeIcon icon={brand.icon} />
      </span>
    );
  }

  return (
    <span className="brand-logo-slot" aria-hidden="true">
      {brand.logo ? <img src={brand.logo} alt="" className="partner-logo" /> : <span className="text-xs font-bold">{brand.name?.slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}

export function AccessoryBrandSelector({
  active,
  onSelect,
  equipmentBrands,
}: {
  active: string;
  onSelect: (brand: string) => void;
  equipmentBrands: Brand[];
}) {
  return (
    <div className="equipment-brand-scroll" role="group" aria-label="Marques d’équipements">
      <div className="equipment-brand-list">
        {equipmentBrands.map((brand) => {
          const selected = active === brand.id;
          return (
            <button
              key={brand.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(brand.id)}
              className="equipment-brand-button"
            >
              <BrandVisual brand={{ name: brand.name, logo: brand.logo }} />
              <span className="equipment-brand-name block truncate">{brand.name}</span>
              {selected && <motion.span
                aria-hidden="true"
                layoutId="accessory-brand-border"
                className="equipment-brand-active"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AccessoryBrandQuickLinks({ onSelect }: { onSelect: (brand: string) => void }) {
  const equipmentBrands = getAvailableEquipmentBrands();
  return (
    <div className="grid grid-cols-2 border-y border-black/15 sm:flex sm:flex-wrap dark:border-white/15">
      {equipmentBrands.map((brand, index) => (
        <motion.button
          key={brand.id}
          type="button"
          onClick={() => onSelect(brand.id)}
          whileHover={{ x: 3 }}
          className={
            "group grid w-full min-w-0 grid-cols-[3.25rem_minmax(0,1fr)_1rem] items-center gap-1.5 border-b border-r border-black/10 px-2 py-2.5 text-left transition hover:bg-white/50 even:border-r-0 sm:w-auto sm:flex-none sm:grid-cols-[3.25rem_auto_1rem] sm:gap-2 sm:border-b-0 sm:px-4 sm:even:border-r sm:last:border-r-0 dark:border-white/10 dark:hover:bg-white/[0.04] " +
            (index === equipmentBrands.length - 1 && equipmentBrands.length % 2 ? "col-span-2 sm:col-span-1" : "")
          }
        >
          <BrandVisual brand={{ name: brand.name, logo: brand.logo }} />
          <span className="min-w-0 truncate text-[10px] font-bold text-black/65 dark:text-white/65">{brand.name}</span>
          <FontAwesomeIcon
            icon={faArrowUpRightFromSquare}
            className="justify-self-end text-[10px] text-black/35 transition group-hover:text-[#98741b] dark:text-white/35 dark:group-hover:text-[#ffd100]"
          />
        </motion.button>
      ))}
    </div>
  );
}
