export interface DisplayArrivalsInput {
  title?: string;
  stops: StopData[];
}

export interface StopData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  arrivals: ArrivalData[];
}

export interface ArrivalData {
  route: string;
  destination: string;
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
