export interface ArrivalsQuery {
  endpoint: "nearby" | "route";
  lat: number;
  lon: number;
  radius?: number;
  routes?: string;
  dest_lat?: number;
  dest_lon?: number;
  radius_origin?: number;
  radius_dest?: number;
  max_transfers?: number;
}

export interface DisplayArrivalsInput {
  title?: string;
  query?: ArrivalsQuery;
  /** @deprecated Superseded by `query`; only present in chat sessions persisted before the switch. */
  url?: string;
  stops?: StopData[];
}

/** Input the model passes to the client-side `display_route` tool. */
export interface DisplayRouteInput {
  route: string;
  operator?: "KMB" | "CTB" | "GMB";
  bound?: string;
}

export interface RouteStopPoint {
  id: string;
  name: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  lng: number;
  seq: number;
}

/** One direction/service-type variant of a route, as returned by /api/route-info. */
export interface RouteVariant {
  route_id: string;
  route: string;
  bound: string;
  service_type: string;
  operator: string;
  /** First stop of this variant's ordered stop list. */
  origin: string;
  origin_tc?: string;
  origin_sc?: string;
  /** Last stop of this variant's ordered stop list. */
  destination: string;
  destination_tc?: string;
  destination_sc?: string;
  /** The operator's published labels — may describe the opposite direction. */
  published_origin?: string;
  published_destination?: string;
  stop_count: number;
  stops: RouteStopPoint[];
}

export interface RouteInfoData {
  route: string;
  routes: RouteVariant[];
  /** Set when the lookup failed, so the card can show an error instead of spinning. */
  error?: string;
}

export interface StopData {
  id: string;
  name: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  lng: number;
  arrivals: ArrivalData[];
}

export interface ArrivalData {
  route: string;
  destination: string;
  dest_tc: string;
  dest_sc: string;
  operator?: string;
  etas: EtaData[];
}

export interface EtaData {
  minutes: number;
  remarks?: string;
}

export interface LocationPin {
  name: string;
  lat: number;
  lng: number;
}

export interface MapStop {
  id?: string;
  name: string;
  name_en?: string;
  name_tc?: string;
  name_sc?: string;
  lat: number;
  lng: number;
  arrivals?: StopArrival[];
}

export interface StopArrival {
  route: string;
  destination: string;
  etas: { minutes: number; remarks?: string }[];
}

export interface MapRoute {
  name: string;
  color: string;
  stops: MapStop[];
}

export interface MapData {
  stops: MapStop[];
  routes: MapRoute[];
}
