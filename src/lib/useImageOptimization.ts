import { useEffect, useRef, useState } from "react";
import { optimizeProductImage, type PhotoOptimization } from "./optimizeProductImage";

type Selection = { file: File; originalSize: number; status: PhotoOptimization | "processing" };

/** Une sélection à la fois ; ignorer les résultats d'une sélection annulée ou remplacée. */
export function useImageOptimization() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);
  function choose(file: File | null) {
    controller.current?.abort(); controller.current = null;
    if (!file) { setSelection(null); return; }
    const next = new AbortController(); controller.current = next;
    setSelection({ file, originalSize: file.size, status: "processing" });
    void optimizeProductImage(file, next.signal).then(result => {
      if (!next.signal.aborted) setSelection({ file: result.file, originalSize: file.size, status: result.status });
    }).catch(() => {
      if (!next.signal.aborted) setSelection({ file, originalSize: file.size, status: "failed" });
    }).finally(() => { if (controller.current === next) controller.current = null; });
  }
  return { selection, choose };
}
