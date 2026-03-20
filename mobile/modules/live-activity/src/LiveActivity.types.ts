export type LiveEtaParam = {
  minutes: number;
  remarks: string;
};

export type StartLiveActivityParams = {
  route: string;
  stopName: string;
  stopId: string;
  destination: string;
  etas: LiveEtaParam[];
};

export type UpdateLiveActivityParams = {
  etas: LiveEtaParam[];
};
