import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { useDataStore } from "@/store/dataStore";
import type { Transaction } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tx: Transaction | null;
  isTraining: boolean;
}

export default function TransactionDetail({ open, onOpenChange, tx, isTraining }: Props) {
  const users = useDataStore((s) => s.users);
  const cards = useDataStore((s) => s.cards);
  const mcc = useDataStore((s) => s.mcc);
  const labels = useDataStore((s) => s.fraudLabels);
  const predictions = useDataStore((s) => s.predictions);

  if (!tx) return null;
  const user = users.get(tx.client_id);
  const card = cards.get(tx.card_id);
  const mccLabel = mcc[tx.mcc] ?? "Unknown category";
  const prediction = predictions[tx.transaction_id];
  const actualFraud = isTraining ? labels[tx.transaction_id] === "Yes" : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Transaction #{tx.transaction_id}
            {prediction?.predicted_fraud && <Badge variant="destructive">Predicted Fraud</Badge>}
            {isTraining && actualFraud && <Badge variant="warning">Actual Fraud</Badge>}
            {isTraining && actualFraud === false && <Badge variant="success">Legit</Badge>}
          </DialogTitle>
          <DialogDescription>{formatDate(tx.date)}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Section title="Transaction">
            <Row label="Amount" value={formatCurrency(tx.amount)} />
            <Row label="Type" value={tx.use_chip} />
            <Row label="Errors" value={tx.errors || "None"} />
            <Row label="MCC" value={`${tx.mcc} — ${mccLabel}`} />
          </Section>

          <Section title="Merchant">
            <Row label="ID" value={tx.merchant_id} />
            <Row label="City" value={tx.merchant_city} />
            <Row label="State" value={tx.merchant_state} />
            <Row label="ZIP" value={tx.zip} />
          </Section>

          <Section title="User">
            {user ? (
              <>
                <Row label="Client ID" value={user.id} />
                <Row label="Age" value={String(user.current_age)} />
                <Row label="Gender" value={user.gender} />
                <Row label="Yearly income" value={formatCurrency(user.yearly_income)} />
                <Row label="Credit score" value={String(user.credit_score)} />
                <Row label="Total debt" value={formatCurrency(user.total_debt)} />
              </>
            ) : (
              <div className="text-muted-foreground">No user data</div>
            )}
          </Section>

          <Section title="Card">
            {card ? (
              <>
                <Row label="Brand" value={card.card_brand} />
                <Row label="Type" value={card.card_type} />
                <Row label="Has chip" value={card.has_chip} />
                <Row label="Credit limit" value={formatCurrency(card.credit_limit)} />
                <Row label="Dark web" value={card.card_on_dark_web} />
              </>
            ) : (
              <div className="text-muted-foreground">No card data</div>
            )}
          </Section>

          {prediction && (
            <Section title="Model Prediction" span>
              <Row label="Predicted" value={prediction.predicted_fraud ? "Fraud" : "Legit"} />
              <Row label="Probability" value={formatPercent(prediction.probability, 2)} />
              {isTraining && (
                <Row
                  label="Ground truth"
                  value={actualFraud ? "Fraud" : "Legit"}
                  highlight={actualFraud !== prediction.predicted_fraud ? "destructive" : "success"}
                />
              )}
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children, span }: { title: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 space-y-2 rounded-md border p-3 bg-muted/30" : "space-y-2 rounded-md border p-3"}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "success" | "destructive";
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          highlight === "destructive"
            ? "font-medium text-destructive"
            : highlight === "success"
              ? "font-medium text-success"
              : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}
