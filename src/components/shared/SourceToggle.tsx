import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataStore } from "@/store/dataStore";
import type { DataSource } from "@/types";

export default function SourceToggle() {
  const source = useDataStore((s) => s.source);
  const setSource = useDataStore((s) => s.setSource);
  return (
    <Select value={source} onValueChange={(v) => setSource(v as DataSource)}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="train">Training data</SelectItem>
        <SelectItem value="evaluation">Evaluation data</SelectItem>
      </SelectContent>
    </Select>
  );
}
