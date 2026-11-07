import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./adminApi";

/** Actualise la pastille même lorsqu'un autre onglet de l'administration est ouvert. */
export function useUnreadMessages(userId: string | null) {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let active = true;
    let version = 0;
    setCount(null); setFailed(false);
    if (!userId) { refreshRef.current = () => {}; return; }
    const update = () => {
      const current = ++version;
      request("messages.php?count=unread").then((result) => {
        if (!Number.isSafeInteger(result.unreadCount) || result.unreadCount < 0) throw new Error("Compteur invalide.");
        if (active && current === version) { setCount(result.unreadCount); setFailed(false); }
      }).catch(() => {
        // Une erreur ne doit pas être interprétée comme zéro message.
        if (active && current === version) { setCount(null); setFailed(true); }
      });
    };
    const onVisible = () => { if (document.visibilityState === "visible") update(); };
    refreshRef.current = update;
    update();
    const timer = window.setInterval(onVisible, 30000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false; version++; refreshRef.current = () => {};
      window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible);
    };
  }, [userId]);
  return { count, failed, refresh };
}
