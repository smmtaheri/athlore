import { useEffect, useState } from "react";

export function useCodeResendCooldown() {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = window.setInterval(
      () => setSecondsRemaining((value) => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [secondsRemaining]);
  return { secondsRemaining, setSecondsRemaining };
}
