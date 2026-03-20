"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/mapbox";
import type { MapData, MapStop, LocationPin } from "./chat-messages";
import { Popup } from "react-map-gl/mapbox";
import { IconBus } from "@tabler/icons-react";
import { useDictionary } from "@/lib/i18n/i18n-provider";
import "mapbox-gl/dist/mapbox-gl.css";

const HK_CENTER = { latitude: 22.3193, longitude: 114.1694 };
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

function etaColor(minutes: number): string {
  if (minutes <= 0) return "bg-red-500/20 text-red-400";
  if (minutes <= 5) return "bg-emerald-500/20 text-emerald-400";
  if (minutes <= 15) return "bg-amber-500/20 text-amber-400";
  return "bg-zinc-500/20 text-zinc-400";
}

function etaLabel(minutes: number): string {
  if (minutes <= 0) return "Departed";
  return `${minutes}m`;
}

interface TransportMapProps {
  mapData: MapData;
  userLocation: { latitude: number; longitude: number } | null;
  selectedPin?: LocationPin | null;
}

export function TransportMap({ mapData, userLocation, selectedPin }: TransportMapProps) {
  const dict = useDictionary();
  const mapRef = useRef<MapRef>(null);
  const [activeStop, setActiveStop] = useState<MapStop | null>(null);
  const [viewState, setViewState] = useState(() =>
    selectedPin
      ? { latitude: selectedPin.lat, longitude: selectedPin.lng, zoom: 16 }
      : { ...HK_CENTER, zoom: 13 }
  );

  useEffect(() => {
    if (!mapRef.current) return;

    const allCoords = [
      ...mapData.stops.map((s) => [s.lng, s.lat] as [number, number]),
      ...mapData.routes.flatMap((r) =>
        r.stops.map((s) => [s.lng, s.lat] as [number, number])
      ),
    ];

    if (allCoords.length === 0) return;

    if (allCoords.length === 1) {
      mapRef.current.flyTo({
        center: allCoords[0],
        zoom: 15,
        duration: 1000,
      });
      return;
    }

    const lngs = allCoords.map((c) => c[0]);
    const lats = allCoords.map((c) => c[1]);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs) - 0.005, Math.min(...lats) - 0.005],
        [Math.max(...lngs) + 0.005, Math.max(...lats) + 0.005],
      ],
      { padding: 60, duration: 1000 }
    );
  }, [mapData]);

  useEffect(() => {
    if (!selectedPin) return;
    // Update viewState so map renders centered even if mapRef isn't ready yet (e.g. mobile drawer mounting)
    startTransition(() => {
      setViewState({
        latitude: selectedPin.lat,
        longitude: selectedPin.lng,
        zoom: 16,
      });
    });
    // Also flyTo if map is already mounted (desktop)
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [selectedPin.lng, selectedPin.lat],
        zoom: 16,
        duration: 1000,
      });
    }
  }, [selectedPin]);

  useEffect(() => {
    // Don't override view if a pin is selected
    if (selectedPin) return;
    if (userLocation) {
      startTransition(() => {
        setViewState((prev) => ({
          ...prev,
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        }));
      });
    }
  }, [userLocation, selectedPin]);

  const routeGeoJSON = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: mapData.routes.map((route, i) => ({
        type: "Feature" as const,
        properties: { color: route.color, name: route.name, index: i },
        geometry: {
          type: "LineString" as const,
          coordinates: route.stops.map((s) => [s.lng, s.lat]),
        },
      })),
    }),
    [mapData.routes]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => mapRef.current?.resize(), 100);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-900 text-zinc-500 text-sm">
        {dict.map.missingToken}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(e) => setViewState(e.viewState)}
      onLoad={() => mapRef.current?.resize()}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      mapboxAccessToken={MAPBOX_TOKEN}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Route lines */}
      <Source id="routes" type="geojson" data={routeGeoJSON}>
        <Layer
          id="route-lines"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": 3.5,
            "line-opacity": 0.85,
          }}
          layout={{
            "line-join": "round",
            "line-cap": "round",
          }}
        />
      </Source>

      {/* Station markers */}
      {mapData.stops.map((stop, i) => {
        const hasArrivals = stop.arrivals && stop.arrivals.length > 0;
        const nextEta = hasArrivals
          ? Math.min(...stop.arrivals!.flatMap((a) => a.etas.map((e) => e.minutes)))
          : null;

        return (
          <Marker
            key={`${stop.lat}-${stop.lng}-${i}`}
            latitude={stop.lat}
            longitude={stop.lng}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveStop(activeStop?.lat === stop.lat && activeStop?.lng === stop.lng ? null : stop);
              }}
              className="flex flex-col items-center group cursor-pointer"
            >
              <div className="flex items-center gap-1">
                <div className="size-3 rounded-full bg-blue-400 border-[1.5px] border-white shadow-lg shadow-blue-400/30 group-hover:scale-125 transition-transform" />
                {nextEta !== null && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${etaColor(nextEta)}`}>
                    {etaLabel(nextEta)}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[10px] font-medium text-white/90 bg-zinc-900/80 vibrancy px-1.5 py-0.5 rounded-md whitespace-nowrap max-w-[120px] truncate">
                {stop.name}
              </span>
            </button>
          </Marker>
        );
      })}

      {/* Active stop popup with arrival info */}
      {activeStop && (
        <Popup
          latitude={activeStop.lat}
          longitude={activeStop.lng}
          offset={25}
          closeButton
          closeOnClick={false}
          onClose={() => setActiveStop(null)}
          focusAfterOpen={false}
          className="[&_.mapboxgl-popup-content]:!bg-zinc-900 [&_.mapboxgl-popup-content]:!text-white [&_.mapboxgl-popup-content]:!rounded-xl [&_.mapboxgl-popup-content]:!px-4 [&_.mapboxgl-popup-content]:!py-3 [&_.mapboxgl-popup-content]:!shadow-xl [&_.mapboxgl-popup-content]:!max-w-[320px] [&_.mapboxgl-popup-tip]:!border-t-zinc-900 [&_.mapboxgl-popup-close-button]:!text-zinc-400 [&_.mapboxgl-popup-close-button]:!text-lg [&_.mapboxgl-popup-close-button]:!right-2 [&_.mapboxgl-popup-close-button]:!top-2 [&_.mapboxgl-popup-close-button]:!outline-none [&_.mapboxgl-popup-close-button:focus]:!outline-none [&_.mapboxgl-popup-close-button]:!w-6 [&_.mapboxgl-popup-close-button]:!h-6 [&_.mapboxgl-popup-close-button]:!rounded-full [&_.mapboxgl-popup-close-button]:!flex [&_.mapboxgl-popup-close-button]:!items-center [&_.mapboxgl-popup-close-button]:!justify-center [&_.mapboxgl-popup-close-button]:!bg-zinc-700/60"
        >
          <p className="text-[13px] font-semibold pr-4">{activeStop.name}</p>
          {activeStop.arrivals && activeStop.arrivals.length > 0 ? (
            <div className="mt-1.5 space-y-1.5">
              {activeStop.arrivals.map((arrival, j) => (
                <div key={j} className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-0.5 rounded bg-white/[0.08] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    <IconBus size={10} className="text-zinc-400" />
                    {arrival.route}
                  </span>
                  <span className="text-[10px] text-zinc-500 truncate max-w-[100px]">
                    {arrival.destination}
                  </span>
                  <div className="flex gap-0.5 ml-auto">
                    {arrival.etas.slice(0, 3).map((eta, k) => (
                      <span
                        key={k}
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${etaColor(eta.minutes)}`}
                      >
                        {etaLabel(eta.minutes)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {activeStop.lat.toFixed(6)}, {activeStop.lng.toFixed(6)}
            </p>
          )}
        </Popup>
      )}

      {/* Selected pin */}
      {selectedPin && (
        <>
          <Marker latitude={selectedPin.lat} longitude={selectedPin.lng}>
            <div className="flex flex-col items-center animate-bounce">
              <div className="size-5 rounded-full bg-red-500 border-2 border-white shadow-lg shadow-red-500/40" />
            </div>
          </Marker>
          {/* Only show selected pin popup if no active stop popup is at the same location */}
          {!(activeStop && activeStop.lat === selectedPin.lat && activeStop.lng === selectedPin.lng) && (
            <Popup
              latitude={selectedPin.lat}
              longitude={selectedPin.lng}
              offset={20}
              closeButton={false}
              className="[&_.mapboxgl-popup-content]:!bg-zinc-900 [&_.mapboxgl-popup-content]:!text-white [&_.mapboxgl-popup-content]:!rounded-xl [&_.mapboxgl-popup-content]:!px-3 [&_.mapboxgl-popup-content]:!py-2 [&_.mapboxgl-popup-content]:!shadow-xl [&_.mapboxgl-popup-tip]:!border-t-zinc-900"
            >
              <p className="text-[13px] font-medium">{selectedPin.name}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {selectedPin.lat.toFixed(6)}, {selectedPin.lng.toFixed(6)}
              </p>
            </Popup>
          )}
        </>
      )}

      {/* User location marker */}
      {userLocation && (
        <Marker
          latitude={userLocation.latitude}
          longitude={userLocation.longitude}
        >
          <div className="relative flex items-center justify-center">
            <div className="absolute size-8 rounded-full bg-blue-500/20 animate-ping" />
            <div className="size-4 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
          </div>
        </Marker>
      )}
    </Map>
    </div>
  );
}
