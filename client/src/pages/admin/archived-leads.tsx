import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Lead } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, Building2, MapPin, Search, RotateCcw, Archive } from "lucide-react";
import { useState, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function archiveReasonLabel(reason: string | null) {
  switch (reason) {
    case "SPOKE_NOT_INTERESTED": return "Not Interested";
    case "SPOKE_ALREADY_SIGNED_UP": return "Already Signed Up";
    case "WRONG_NUMBER": return "Wrong Number";
    case "MAX_RETRIES_REACHED": return "Max Retries";
    case "SIGNED_UP": return "Signed Up";
    default: return reason || "Unknown";
  }
}

function archiveReasonColor(reason: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (reason) {
    case "SIGNED_UP": return "default";
    case "SPOKE_NOT_INTERESTED": return "destructive";
    case "WRONG_NUMBER": return "destructive";
    case "MAX_RETRIES_REACHED": return "outline";
    case "SPOKE_ALREADY_SIGNED_UP": return "secondary";
    default: return "outline";
  }
}

export default function ArchivedLeadsPage() {
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads/archived"] });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/leads/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead restored to active pipeline" });
    },
    onError: () => {
      toast({ title: "Failed to restore lead", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!leads) return [];
    return leads.filter((lead) => {
      const matchesSearch =
        !search ||
        lead.companyName.toLowerCase().includes(search.toLowerCase()) ||
        (lead.contactName && lead.contactName.toLowerCase().includes(search.toLowerCase())) ||
        (lead.phone && lead.phone.includes(search)) ||
        (lead.state && lead.state.toLowerCase().includes(search.toLowerCase()));
      const matchesReason = reasonFilter === "all" || lead.archiveReason === reasonFilter;
      return matchesSearch && matchesReason;
    });
  }, [leads, search, reasonFilter]);

  const reasonCounts = useMemo(() => {
    if (!leads) return {};
    const counts: Record<string, number> = {};
    leads.forEach((lead) => {
      const reason = lead.archiveReason || "Unknown";
      counts[reason] = (counts[reason] || 0) + 1;
    });
    return counts;
  }, [leads]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-auto h-full" data-testid="archived-leads-page">
      <div className="flex items-center gap-3 flex-wrap">
        <Archive className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Archived Leads</h1>
        <Badge variant="secondary" data-testid="text-archived-count">{leads?.length || 0} total</Badge>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search archived leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-archived-search"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={reasonFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setReasonFilter("all")}
            data-testid="button-filter-all"
          >
            All
          </Button>
          {Object.entries(reasonCounts).map(([reason, count]) => (
            <Button
              key={reason}
              variant={reasonFilter === reason ? "default" : "outline"}
              size="sm"
              onClick={() => setReasonFilter(reason)}
              data-testid={`button-filter-${reason.toLowerCase()}`}
            >
              {archiveReasonLabel(reason)} ({count})
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {leads?.length === 0
              ? "No archived leads yet. Leads are automatically archived when they reach a terminal state."
              : "No archived leads match your filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => (
            <Card key={lead.id} data-testid={`card-archived-lead-${lead.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/leads/${lead.id}`}>
                        <span className="font-medium hover:underline cursor-pointer" data-testid={`link-lead-${lead.id}`}>
                          {lead.companyName}
                        </span>
                      </Link>
                      <Badge variant={archiveReasonColor(lead.archiveReason)} data-testid={`badge-reason-${lead.id}`}>
                        {archiveReasonLabel(lead.archiveReason)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {lead.contactName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {lead.contactName}
                        </span>
                      )}
                      {lead.state && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {lead.state}
                        </span>
                      )}
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </span>
                      )}
                      {(lead.confirmedEmail || lead.scrapedEmail) && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {lead.confirmedEmail || lead.scrapedEmail}
                        </span>
                      )}
                    </div>
                    {lead.archivedAt && (
                      <p className="text-xs text-muted-foreground">
                        Archived {new Date(lead.archivedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreMutation.mutate(lead.id)}
                    disabled={restoreMutation.isPending}
                    data-testid={`button-restore-${lead.id}`}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restore
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
