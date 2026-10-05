"use client";

import { useEffect, useState } from "react";

/** Unix seconds, re-rendering every `intervalMs` for countdowns. */
export function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
