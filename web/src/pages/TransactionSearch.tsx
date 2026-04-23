import { useDeferredValue, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TransactionDetail from "@/components/shared/TransactionDetail";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { useEnsureTransactions } from "@/hooks/useData";
import { useDataStore } from "@/store/dataStore";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { Transaction } from "@/types";

type FraudFilter = "all" | "yes" | "no";
const DISPLAY_CAP = 5000;

export default function TransactionSearch() {
  const { ready } = useEnsureTransactions();
  const source = useDataStore((s) => s.source);
  const train = useDataStore((s) => s.trainTransactions);
  const evalRows = useDataStore((s) => s.evalTransactions);
  const labels = useDataStore((s) => s.fraudLabels);
  const predictions = useDataStore((s) => s.predictions);
  const mcc = useDataStore((s) => s.mcc);

  // Fast-typing inputs: user state updates immediately, filter uses deferred.
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [city, setCity] = useState("");
  const [fraudFilter, setFraudFilter] = useState<FraudFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [selected, setSelected] = useState<Transaction | null>(null);

  const dSearch = useDeferredValue(search);
  const dMin = useDeferredValue(minAmount);
  const dMax = useDeferredValue(maxAmount);
  const dCity = useDeferredValue(city);
  const dFraud = useDeferredValue(fraudFilter);

  const rows = source === "train" ? train : evalRows;
  const isTraining = source === "train";
  const isPending =
    dSearch !== search || dMin !== minAmount || dMax !== maxAmount || dCity !== city || dFraud !== fraudFilter;

  // Pass 1: filter (single O(n) loop, pre-lowercased city, early continues).
  const filtered = useMemo(() => {
    const min = dMin ? Number(dMin) : -Infinity;
    const max = dMax ? Number(dMax) : Infinity;
    const q = dSearch.trim();
    const c = dCity.trim().toLowerCase();
    const hasQ = q.length > 0;
    const hasC = c.length > 0;
    const hasAmt = Number.isFinite(min) || Number.isFinite(max);
    const predFilter = dFraud;
    const result: Transaction[] = [];
    for (let i = 0; i < rows.length; i++) {
      const tx = rows[i];
      if (hasQ && !tx.transaction_id.includes(q) && !tx.client_id.includes(q)) continue;
      if (hasC && !tx._cityLower.includes(c)) continue;
      if (hasAmt && (tx.amount < min || tx.amount > max)) continue;
      if (predFilter !== "all") {
        const p = predictions[tx.transaction_id];
        const pred = p?.predicted_fraud ?? false;
        if (predFilter === "yes" && !pred) continue;
        if (predFilter === "no" && pred) continue;
      }
      result.push(tx);
    }
    return result;
  }, [rows, dSearch, dMin, dMax, dCity, dFraud, predictions]);

  // Pass 2: sort the filtered set, then cap to DISPLAY_CAP before handing to TanStack.
  // This is the biggest win — the table engine no longer builds 210k row wrappers.
  const sortedVisible = useMemo(() => {
    const s = sorting[0];
    const arr = filtered;
    if (!s) return arr.length > DISPLAY_CAP ? arr.slice(0, DISPLAY_CAP) : arr;
    const dir = s.desc ? -1 : 1;
    const cmp = getComparator(s.id, dir, predictions, labels);
    // Avoid mutating original; for huge sets this copy is ~1-2ms.
    const copy = arr.slice();
    copy.sort(cmp);
    return copy.length > DISPLAY_CAP ? copy.slice(0, DISPLAY_CAP) : copy;
  }, [filtered, sorting, predictions, labels]);

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "transaction_id",
        accessorKey: "transaction_id",
        header: "ID",
        cell: (info) => <span className="font-mono text-xs">{info.getValue<string>()}</span>,
      },
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        cell: (info) => formatDate(info.getValue<string>()),
      },
      { id: "client_id", accessorKey: "client_id", header: "Client" },
      {
        id: "amount",
        accessorKey: "amount",
        header: "Amount",
        cell: (info) => <span className="font-medium">{formatCurrency(info.getValue<number>())}</span>,
      },
      {
        id: "merchant_city",
        accessorKey: "merchant_city",
        header: "Merchant",
        cell: ({ row }) => (
          <span>
            {row.original.merchant_city}, {row.original.merchant_state}
          </span>
        ),
      },
      {
        id: "mcc",
        accessorKey: "mcc",
        header: "MCC",
        cell: (info) => (
          <span className="text-xs text-muted-foreground" title={mcc[info.getValue<string>()]}>
            {info.getValue<string>()}
          </span>
        ),
      },
      {
        id: "prediction",
        header: "Predicted",
        enableSorting: true,
        cell: ({ row }) => {
          const p = predictions[row.original.transaction_id];
          if (!p) return <span className="text-xs text-muted-foreground">—</span>;
          return p.predicted_fraud ? <Badge variant="destructive">Fraud</Badge> : <Badge variant="secondary">Legit</Badge>;
        },
      },
      ...(isTraining
        ? [
            {
              id: "actual",
              header: "Actual",
              enableSorting: true,
              cell: ({ row }) => {
                const v = labels[row.original.transaction_id];
                if (!v) return <span className="text-xs text-muted-foreground">—</span>;
                return v === "Yes" ? <Badge variant="warning">Fraud</Badge> : <Badge variant="success">Legit</Badge>;
              },
            } as ColumnDef<Transaction>,
          ]
        : []),
    ],
    [predictions, labels, mcc, isTraining]
  );

  const table = useReactTable({
    data: sortedVisible,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true, // we sort ourselves before passing data in
    manualFiltering: true,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualRows = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });
  const items = virtualRows.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualRows.getTotalSize() - (items[items.length - 1]?.end ?? 0);

  if (!ready) return <LoadingScreen message="Loading transactions…" />;

  const truncated = filtered.length > DISPLAY_CAP;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Transaction Search
            {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
          <CardDescription>
            Filter & sort {formatNumber(rows.length)} transactions. Virtualized & deferred for smooth typing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="col-span-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transaction ID or client ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input placeholder="Min $" type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          <Input placeholder="Max $" type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
          <Input placeholder="Merchant city" value={city} onChange={(e) => setCity(e.target.value)} />
          <div className="col-span-2 md:col-span-1">
            <Select value={fraudFilter} onValueChange={(v) => setFraudFilter(v as FraudFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All predictions</SelectItem>
                <SelectItem value="yes">Predicted fraud</SelectItem>
                <SelectItem value="no">Predicted legit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <span>{formatNumber(filtered.length)} results</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setMinAmount("");
                setMaxAmount("");
                setCity("");
                setFraudFilter("all");
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {truncated && (
        <div className="rounded-lg border-2 border-warning/50 bg-warning/15 px-4 py-3 text-sm font-medium text-foreground shadow-sm">
          Showing first {formatNumber(DISPLAY_CAP)} of {formatNumber(filtered.length)} matches (sorted).
          Refine filters to narrow the result set.
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div ref={parentRef} className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const canSort = h.column.getCanSort();
                      const sort = h.column.getIsSorted();
                      return (
                        <th
                          key={h.id}
                          onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                          className="text-left p-2 font-medium text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap select-none cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-1">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {canSort &&
                              (sort === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : sort === "desc" ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-40" />
                              ))}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ height: paddingTop }} />
                  </tr>
                )}
                {items.map((vr) => {
                  const row = table.getRowModel().rows[vr.index];
                  return (
                    <tr
                      key={row.id}
                      className="border-t hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelected(row.original)}
                      style={{ height: 40 }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-2 whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ height: paddingBottom }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <TransactionDetail open={!!selected} onOpenChange={(o) => !o && setSelected(null)} tx={selected} isTraining={isTraining} />
    </div>
  );
}

// -------- Manual comparators (faster than TanStack's reflection-based defaults) --------
type PredMap = Record<string, { predicted_fraud: boolean; probability: number }>;
function getComparator(
  id: string,
  dir: 1 | -1,
  predictions: PredMap,
  labels: Record<string, "Yes" | "No">
): (a: Transaction, b: Transaction) => number {
  switch (id) {
    case "date":
      return (a, b) => (a._ts - b._ts) * dir;
    case "amount":
      return (a, b) => (a.amount - b.amount) * dir;
    case "transaction_id":
      return (a, b) => cmpStr(a.transaction_id, b.transaction_id) * dir;
    case "client_id":
      return (a, b) => cmpStr(a.client_id, b.client_id) * dir;
    case "merchant_city":
      return (a, b) => cmpStr(a._cityLower, b._cityLower) * dir;
    case "mcc":
      return (a, b) => cmpStr(a.mcc, b.mcc) * dir;
    case "prediction":
      return (a, b) => ((predictions[a.transaction_id]?.probability ?? -1) - (predictions[b.transaction_id]?.probability ?? -1)) * dir;
    case "actual":
      return (a, b) => ((labels[a.transaction_id] === "Yes" ? 1 : 0) - (labels[b.transaction_id] === "Yes" ? 1 : 0)) * dir;
    default:
      return () => 0;
  }
}
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
