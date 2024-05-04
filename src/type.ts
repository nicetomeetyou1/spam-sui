export type NestedResult = {
  index: number;
  resultIndex: number;
  kind: "NestedResult";
}

export type UserCounter = {
  id: { id: string} ;
  tx_count: number;
  registered: boolean;
  epoch: number;
}