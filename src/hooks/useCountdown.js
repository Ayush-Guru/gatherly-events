import { useEffect, useState } from 'react';

const calculate = (target) => {
  const difference = Math.max(0, new Date(target).getTime() - Date.now());
  return {
    total: difference,
    days: Math.floor(difference / 86400000),
    hours: Math.floor((difference / 3600000) % 24),
    minutes: Math.floor((difference / 60000) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
};

export function useCountdown(target) {
  const [time, setTime] = useState(() => calculate(target));
  useEffect(() => {
    const timer = window.setInterval(() => setTime(calculate(target)), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  return time;
}
