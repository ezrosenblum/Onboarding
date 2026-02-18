import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, Loader2, CheckCircle2, Users } from "lucide-react";

export default function AssignBatchPage() {
  const { toast } = useToast();
  const [callerId, setCallerId] = useState("");
  const [count, setCount] = useState("10");
  const [stateFilter, setStateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minRating, setMinRating] = useState("");
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [result, setResult] = useState<{ assigned: number } | null>(null);

  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const callers = (users ?? []).filter((u) => u.role === "vendor_caller");

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/leads/assign", {
        callerId: parseInt(callerId),
        count: parseInt(count),
        stateFilter: stateFilter || undefined,
        categoryFilter: categoryFilter || undefined,
        minRating: minRating ? parseFloat(minRating) : undefined,
        hasPhone: hasPhone || undefined,
        hasEmail: hasEmail || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (err: any) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Assign Batch</h1>
        <p className="text-sm text-muted-foreground mt-1">Assign uncontacted leads to a vendor caller</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold flex items-center gap-2"><UserCheck className="h-4 w-4" /> Assignment Settings</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Vendor Caller</label>
            {callers.length === 0 ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> No vendor callers found. Create one in Manage Users.
              </div>
            ) : (
              <Select value={callerId} onValueChange={setCallerId}>
                <SelectTrigger data-testid="select-caller">
                  <SelectValue placeholder="Select a caller" />
                </SelectTrigger>
                <SelectContent>
                  {callers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Number of Leads</label>
            <Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} data-testid="input-lead-count" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">State (optional)</label>
              <Input value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} placeholder="e.g., CA" data-testid="input-state-filter" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category (optional)</label>
              <Input value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} placeholder="e.g., plumber" data-testid="input-category-filter" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Min Rating (optional)</label>
              <Input type="number" min={0} max={5} step={0.5} value={minRating} onChange={(e) => setMinRating(e.target.value)} placeholder="e.g., 4.0" data-testid="input-min-rating" />
            </div>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox id="has-phone" checked={hasPhone} onCheckedChange={(c) => setHasPhone(c === true)} data-testid="checkbox-has-phone" />
              <Label htmlFor="has-phone" className="text-sm cursor-pointer">Has Phone</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="has-email" checked={hasEmail} onCheckedChange={(c) => setHasEmail(c === true)} data-testid="checkbox-has-email" />
              <Label htmlFor="has-email" className="text-sm cursor-pointer">Has Email</Label>
            </div>
          </div>

          <Button
            onClick={() => assignMutation.mutate()}
            disabled={!callerId || !count || assignMutation.isPending}
            className="w-full"
            data-testid="button-assign"
          >
            {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
            Assign Leads
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-3" />
            <p className="font-semibold text-lg" data-testid="text-assign-result">
              {result.assigned} lead{result.assigned !== 1 ? "s" : ""} assigned
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              The caller can now view these leads in their workspace.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
