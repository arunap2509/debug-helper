"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Connection, ServiceType } from "./types";

// Shared across every page that mounts useConnections in this browser
// session, so navigating between postgres/redis/localstack/wiremock doesn't
// replay the "loading connections" spinner (and the resulting flash of the
// empty-state CTA) every single time — only the very first load in the
// session pays that cost. Subsequent mounts render from cache immediately
// and silently revalidate in the background.
let cachedConnections: Connection[] | null = null;
let inFlightFetch: Promise<Connection[]> | null = null;

function fetchConnections(): Promise<Connection[]> {
  if (!inFlightFetch) {
    inFlightFetch = api.connections.list().finally(() => {
      inFlightFetch = null;
    });
  }
  return inFlightFetch;
}

// Call after any create/update/delete in Admin so the next page mount
// refetches instead of rendering the now-stale cached list.
export function invalidateConnectionsCache() {
  cachedConnections = null;
}

export function useConnections(type: ServiceType) {
  const initial = cachedConnections ? cachedConnections.filter((c) => c.type === type) : null;
  const [connections, setConnections] = useState<Connection[] | null>(initial);
  const [selected, setSelected] = useState<string | null>(initial?.[0]?.id ?? null);
  const [loadingConnections, setLoadingConnections] = useState<boolean>(initial === null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (cachedConnections === null) {
      setLoadingConnections(true);
    }
    fetchConnections()
      .then((all) => {
        cachedConnections = all;
        const filtered = all.filter((c) => c.type === type);
        setConnections(filtered);
        setError(null);
        setSelected((prev) => (prev && filtered.some((c) => c.id === prev) ? prev : (filtered[0]?.id ?? null)));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingConnections(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return { connections, selected, setSelected, error, loadingConnections };
}
