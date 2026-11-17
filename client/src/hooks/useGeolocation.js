import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser geolocation helper.
 * `start()` begins watching the position; `getPosition()` resolves a single fix.
 */
export default function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [watching, setWatching] = useState(false);
  const watchId = useRef(null);

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const getPosition = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (!supported) {
          reject(new Error('Geolocation is not supported by this browser.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            setPosition(fix);
            setError(null);
            resolve(fix);
          },
          (err) => {
            const message =
              err.code === err.PERMISSION_DENIED
                ? 'Location permission denied. Enable it in your browser settings.'
                : 'Could not get your location.';
            setError(message);
            reject(new Error(message));
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
      }),
    [supported]
  );

  const start = useCallback(() => {
    if (!supported || watchId.current !== null) return;
    setWatching(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setError(null);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable it in your browser settings.'
            : 'Could not get your location.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, [supported]);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setWatching(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { position, error, watching, supported, start, stop, getPosition };
}
