'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export interface MapPoint { id: string; lat: number; lng: number; label: string; href?: string }

/** Carte interactive (OpenStreetMap). `onPick` permet de choisir un emplacement en cliquant. */
export function SalonMap({ points, height = 320, onPick }: { points: MapPoint[]; height?: number; onPick?: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(points);

  useEffect(() => {
    let map: import('leaflet').Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView([31.79, -7.09], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({
        className: '', iconSize: [28, 28], iconAnchor: [14, 28],
        html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#a66d1b;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
      });
      const markers = points.map((p) => {
        const marker = L.marker([p.lat, p.lng], { icon, title: p.label }).addTo(map!);
        const link = document.createElement(p.href ? 'a' : 'span');
        link.textContent = p.label;
        if (p.href) (link as HTMLAnchorElement).href = p.href;
        link.style.fontWeight = '600';
        marker.bindPopup(link);
        return marker;
      });
      if (markers.length === 1) map.setView(markers[0].getLatLng(), 15);
      else if (markers.length > 1) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
      if (onPick) map.on('click', (e) => onPick(e.latlng.lat, e.latlng.lng));
    })();
    return () => { cancelled = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-2xl border border-line bg-sand-deep" />;
}
