"use client";

import { useEffect } from "react";

export default function OfflineReady() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .catch(() => { /* Offline preparation must not prevent access to the content. */ });
  }, []);
  return null;
}
