"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Connection, ServiceType } from "./types";

export function useConnections(type: ServiceType) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingConnections, setLoadingConnections] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoadingConnections(true);
    api.connections
      .list()
      .then((all) => {
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
