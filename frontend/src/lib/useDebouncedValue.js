import { useEffect, useState } from "react";

/**
 * Delay a rapidly changing value without delaying its local UI state.
 *
 * Search inputs use this helper so typing remains immediate while the browser
 * avoids issuing a request for every individual keystroke.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}
