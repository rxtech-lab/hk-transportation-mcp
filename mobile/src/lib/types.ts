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
