import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, X, ArrowRight } from "lucide-react";

const STANDARD_FIELDS = [
  "company_name", "phone", "scraped_email", "website", "full_address",
  "city", "state", "zip", "place_id", "cid", "gmb_url", "rating",
  "reviews_count", "hours_raw", "category_keyword", "timezone", "domain",
];

const FIELD_LABELS: Record<string, string> = {
  company_name: "Company Name",
  phone: "Phone",
  scraped_email: "Scraped Email",
  website: "Website",
  full_address: "Full Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  place_id: "Place ID",
  cid: "CID",
  gmb_url: "GMB URL",
  rating: "Rating",
  reviews_count: "Reviews Count",
  hours_raw: "Hours (Raw)",
  category_keyword: "Category Keyword",
  timezone: "Timezone",
  domain: "Domain",
};

type UploadStep = "select" | "preview" | "mapping" | "importing" | "done";

export default function UploadLeadsPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<UploadStep>("select");
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pipelineType, setPipelineType] = useState<string>("vendor");
  const [result, setResult] = useState<{ imported: number; duplicatesSkipped: number; invalidSkipped: number; total: number } | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch("/api/leads/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setColumns(data.columns);
      setPreviewRows(data.rows);

      const autoMap: Record<string, string> = {};
      data.columns.forEach((col: string) => {
        const lower = col.toLowerCase().replace(/[\s_-]+/g, "_");
        const match = STANDARD_FIELDS.find((f) => {
          const fl = f.toLowerCase();
          return lower === fl || lower.includes(fl) || fl.includes(lower);
        });
        if (match) autoMap[col] = match;
      });
      setMapping(autoMap);
      setStep("preview");
    } catch (err: any) {
      toast({ title: "Failed to read file", description: err.message, variant: "destructive" });
    }
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("pipelineType", pipelineType);

      const res = await fetch("/api/leads/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
      setStep("mapping");
    },
  });

  function startImport() {
    if (!mapping || !Object.values(mapping).includes("company_name")) {
      toast({ title: "Company Name is required", description: "Map at least the company name column.", variant: "destructive" });
      return;
    }
    setStep("importing");
    importMutation.mutate();
  }

  function reset() {
    setStep("select");
    setFile(null);
    setColumns([]);
    setPreviewRows([]);
    setMapping({});
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Upload Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">Import leads from XLSX files (Google Maps scrapes)</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <StepBadge step="select" current={step} label="1. Select File" />
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <StepBadge step="preview" current={step} label="2. Preview & Map" />
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <StepBadge step="done" current={step} label="3. Import" />
      </div>

      {step === "select" && (
        <Card>
          <CardContent className="p-8">
            <div
              className="border-2 border-dashed rounded-md p-12 text-center cursor-pointer hover-elevate"
              onClick={() => fileRef.current?.click()}
              data-testid="dropzone-upload"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium">Click to select XLSX file</p>
              <p className="text-sm text-muted-foreground mt-1">Supports .xlsx and .xls files</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} data-testid="input-file-upload" />
            </div>
          </CardContent>
        </Card>
      )}

      {(step === "preview" || step === "mapping") && (
        <>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> {file?.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">{columns.length} columns, preview of first {previewRows.length} rows</p>
              </div>
              <Button variant="ghost" size="icon" onClick={reset}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full">
                <div className="min-w-[600px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {columns.map((col) => (
                          <th key={col} className="text-left p-2 font-medium text-xs text-muted-foreground">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {columns.map((col) => (
                            <td key={col} className="p-2 text-xs truncate max-w-[200px]">{row[col] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold">Field Mapping</h3>
              <p className="text-xs text-muted-foreground">Map spreadsheet columns to standard lead fields</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {columns.map((col) => (
                  <div key={col} className="flex items-center gap-3">
                    <span className="text-sm min-w-[120px] truncate font-mono bg-muted px-2 py-1 rounded-md text-xs">{col}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Select value={mapping[col] || "ignore"} onValueChange={(val) => setMapping({ ...mapping, [col]: val === "ignore" ? "" : val })}>
                      <SelectTrigger className="flex-1" data-testid={`select-map-${col}`}>
                        <SelectValue placeholder="Ignore" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">-- Ignore --</SelectItem>
                        {STANDARD_FIELDS.map((f) => (
                          <SelectItem key={f} value={f}>{FIELD_LABELS[f] || f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center gap-4 flex-wrap">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Pipeline Type</label>
                  <Select value={pipelineType} onValueChange={setPipelineType}>
                    <SelectTrigger className="w-[140px]" data-testid="select-pipeline-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="buyer">Buyer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1" />
                <Button onClick={startImport} data-testid="button-import">
                  <Upload className="h-4 w-4 mr-2" /> Import Leads
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {step === "importing" && (
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary mb-4" />
            <p className="font-medium">Importing leads...</p>
            <p className="text-sm text-muted-foreground mt-1">This may take a moment for large files.</p>
          </CardContent>
        </Card>
      )}

      {step === "done" && result && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-4" />
            <p className="text-lg font-semibold" data-testid="text-import-success">Import Complete</p>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-count">{result.total}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600" data-testid="text-imported-count">{result.imported}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600" data-testid="text-duplicates-count">{result.duplicatesSkipped}</p>
                <p className="text-xs text-muted-foreground">Duplicates Skipped</p>
              </div>
              {result.invalidSkipped > 0 && (
                <div>
                  <p className="text-2xl font-bold text-red-600" data-testid="text-invalid-count">{result.invalidSkipped}</p>
                  <p className="text-xs text-muted-foreground">Invalid (no name)</p>
                </div>
              )}
            </div>
            <Button onClick={reset} className="mt-6" data-testid="button-upload-another">
              <Upload className="h-4 w-4 mr-2" /> Upload Another
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepBadge({ step, current, label }: { step: string; current: string; label: string }) {
  const steps = ["select", "preview", "mapping", "importing", "done"];
  const ci = steps.indexOf(current);
  const si = steps.indexOf(step);
  const isActive = ci >= si;
  return (
    <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
      {label}
    </Badge>
  );
}
