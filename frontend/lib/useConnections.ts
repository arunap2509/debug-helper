"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Connection, ServiceType } from "./types";

export function useConnections(type: ServiceType) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.connections
      .list()
      .then((all) => {
        const filtered = all.filter((c) => c.type === type);
        setConnections(filtered);
        setError(null);
        setSelected((prev) => (prev && filtered.some((c) => c.id === prev) ? prev : (filtered[0]?.id ?? null)));
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return { connections, selected, setSelected, error };
}
