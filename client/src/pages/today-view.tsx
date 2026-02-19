import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Lead } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { CallModal } from "@/components/call-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Phone, Building2, MapPin, PhoneCall, RotateCcw, CheckCircle2,
  Target, Clock, Zap, Mail, Download, Loader2, TrendingUp
} from "lucide-react";

interface TodayData {
  toCallLeads: Lead[];
  calledLeads: Lead[];
  counters: {
    toCall: number;
    called: number;
    retryEligible: number;
    attemptsMadeToday: number;
    emailsSentToday: number;
  };
  weeklyStats: {
    callsThisWeek: number;
    emailsThisWeek: number;
    signupsThisWeek: number;
  };
  dailyCallTarget: number | null;
}

function outcomeLabel(status: string) {
  const map: Record<string, string> = {
    NOT_CALLED: "New",
    NO_ANSWER: "No Answer",
    VOICEMAIL: "Voicemail",
    GATEKEEPER: "Gatekeeper",
    CALL_DROPPED: "Dropped",
    SPOKE_NOT_INTERESTED: "Not Interested",
    SPOKE_SEND_INFO: "Send Info",
    SPOKE_FOLLOW_UP: "Follow Up",
    SPOKE_INTERESTED: "Interested",
  };
  return map[status] || status.replace(/_/g, " ");
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "NOT_CALLED": return "secondary";
    case "SPOKE_NOT_INTERESTED": return "destructive";
    case "SPOKE_INTERESTED": return "default";
    case "SPOKE_SEND_INFO": return "default";
    case "SPOKE_FOLLOW_UP": return "outline";
    default: return "outline";
  }
}

export default function TodayViewPage() {
  const queryClient = useQueryClient();

  const queryKey = ["/api/leads/today"];
  const { data, isLoading } = useQuery<TodayData>({
    queryKey,
    queryFn: async () => {
      const res = await fetch("/api/leads/today", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { toast } = useToast();
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [pullCount, setPullCount] = useState("10");
  const [pullState, setPullState] = useState("");
  const [pullCategory, setPullCategory] = useState("");
  const [showPullPanel, setShowPullPanel] = useState(false);

  const selfPullMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { count: parseInt(pullCount) || 10 };
      if (pullState.trim()) body.stateFilter = pullState.trim();
      if (pullCategory.trim()) body.categoryFilter = pullCategory.trim();
      const res = await apiRequest("POST", "/api/leads/self-pull", body);
      return res.json();
    },
    onSuccess: (data: { assigned: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my"] });
      toast({ title: `${data.assigned} leads pulled`, description: data.assigned === 0 ? "No unassigned leads matched your filters" : "New leads added to your queue" });
      if (data.assigned > 0) setShowPullPanel(false);
    },
    onError: (err: any) => {
      toast({ title: "Pull failed", description: err.message, variant: "destructive" });
    },
  });

  const toCallLeads = data?.toCallLeads ?? [];
  const calledLeads = data?.calledLeads ?? [];
  const counters = data?.counters;
  const weeklyStats = data?.weeklyStats;
  const target = data?.dailyCallTarget;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Today's Calls</h1>
        <p className="text-sm text-muted-foreground mt-1">Your daily calling dashboard</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : counters && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">
                  <Target className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-to-call">{counters.toCall}</p>
                  <p className="text-xs text-muted-foreground">To Call</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">
                  <RotateCcw className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-retry-eligible">{counters.retryEligible}</p>
                  <p className="text-xs text-muted-foreground">Retry Ready</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">
                  <PhoneCall className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-attempts-today">{counters.attemptsMadeToday}</p>
                  <p className="text-xs text-muted-foreground">Calls Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-called">{counters.called}</p>
                  <p className="text-xs text-muted-foreground">Called</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-emails-today">{counters.emailsSentToday}</p>
                  <p className="text-xs text-muted-foreground">Emails Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {weeklyStats && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">This Week</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-lg font-bold" data-testid="text-calls-week">{weeklyStats.callsThisWeek}</p>
                <p className="text-xs text-muted-foreground">Calls</p>
              </div>
              <div>
                <p className="text-lg font-bold" data-testid="text-emails-week">{weeklyStats.emailsThisWeek}</p>
                <p className="text-xs text-muted-foreground">Emails</p>
              </div>
              <div>
                <p className="text-lg font-bold" data-testid="text-signups-week">{weeklyStats.signupsThisWeek}</p>
                <p className="text-xs text-muted-foreground">Signups</p>
              </div>
              <div>
                <p className="text-lg font-bold" data-testid="text-conversion-week">
                  {weeklyStats.callsThisWeek > 0
                    ? ((weeklyStats.signupsThisWeek / weeklyStats.callsThisWeek) * 100).toFixed(1)
                    : "0.0"}%
                </p>
                <p className="text-xs text-muted-foreground">Conversion %</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {target && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Daily target: <span className="font-medium text-foreground">{target} calls</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!showPullPanel ? (
        <Button
          variant="outline"
          onClick={() => setShowPullPanel(true)}
          data-testid="button-show-pull-panel"
        >
          <Download className="h-4 w-4 mr-2" />
          Pull More Leads
        </Button>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Download className="h-4 w-4" /> Pull Unassigned Leads
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowPullPanel(false)} data-testid="button-close-pull">
                Close
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Count</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={pullCount}
                  onChange={(e) => setPullCount(e.target.value)}
                  data-testid="input-pull-count"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">State (optional)</Label>
                <Input
                  placeholder="e.g. CA, NY"
                  value={pullState}
                  onChange={(e) => setPullState(e.target.value)}
                  data-testid="input-pull-state"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Category (optional)</Label>
                <Input
                  placeholder="e.g. plumbing"
                  value={pullCategory}
                  onChange={(e) => setPullCategory(e.target.value)}
                  data-testid="input-pull-category"
                />
              </div>
            </div>
            <Button
              onClick={() => selfPullMutation.mutate()}
              disabled={selfPullMutation.isPending}
              data-testid="button-pull-leads"
            >
              {selfPullMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Pull {pullCount} Leads
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="to-call">
        <TabsList>
          <TabsTrigger value="to-call" data-testid="tab-to-call">
            To Call ({toCallLeads.length})
          </TabsTrigger>
          <TabsTrigger value="called" data-testid="tab-called">
            Called ({calledLeads.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="to-call" className="mt-4">
          <LeadList leads={toCallLeads} onCallClick={setCallLead} emptyMessage="No leads to call right now. Pull more leads or check back later." isLoading={isLoading} showRetryInfo />
        </TabsContent>

        <TabsContent value="called" className="mt-4">
          <LeadList leads={calledLeads} onCallClick={setCallLead} emptyMessage="No called leads yet. Start calling from the To Call tab." isLoading={isLoading} />
        </TabsContent>
      </Tabs>

      <CallModal lead={callLead} open={!!callLead} onClose={() => setCallLead(null)} />
    </div>
  );
}

interface LeadListProps {
  leads: Lead[];
  onCallClick: ((lead: Lead) => void) | null;
  emptyMessage: string;
  isLoading: boolean;
  showRetryInfo?: boolean;
}

function LeadList({ leads, onCallClick, emptyMessage, isLoading, showRetryInfo }: LeadListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {leads.map((lead) => (
        <Card key={lead.id} data-testid={`card-today-lead-${lead.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate" data-testid={`text-today-company-${lead.id}`}>{lead.companyName}</p>
                  {lead.unreachable && (
                    <Badge variant="destructive" className="text-xs">
                      Unreachable
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap mt-1">
                  {lead.city && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{lead.city}{lead.state ? `, ${lead.state}` : ""}
                    </span>
                  )}
                  {lead.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />{lead.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={statusVariant(lead.statusCall)} className="text-xs">
                  {outcomeLabel(lead.statusCall)}
                </Badge>
                {lead.attemptCount > 0 && (
                  <span className="text-xs text-muted-foreground">{lead.attemptCount} attempt{lead.attemptCount !== 1 ? "s" : ""}</span>
                )}
                {showRetryInfo && lead.retryNextEligibleAt && (
                  new Date(lead.retryNextEligibleAt) <= new Date() ? (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />Retry Now
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {new Date(lead.retryNextEligibleAt).toLocaleDateString()}
                    </Badge>
                  )
                )}
              </div>
              {onCallClick && (
                <Button size="sm" onClick={() => onCallClick(lead)} data-testid={`button-log-call-${lead.id}`}>
                  <PhoneCall className="h-4 w-4 mr-1" />
                  Log Call
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
