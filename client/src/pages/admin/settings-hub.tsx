import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, Loader2, RefreshCw, AlertCircle, Shield, Phone, Activity, Target, Download } from "lucide-react";
import { useState, useEffect } from "react";

interface PipelineHealth {
  totalUncontacted: number;
  untouchedAssigned: number;
  retryQueueSize: number;
  unreachableCount: number;
  activePending: number;
  clickedNotSignedUp: number;
}

interface LeadScoreWeights {
  score_weight_email: number;
  score_weight_website: number;
  score_weight_rating: number;
  score_weight_reviews: number;
  score_weight_phone: number;
  score_weight_clicked: number;
}

export default function SettingsHubPage() {
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: disclaimerData, isLoading: disclaimerLoading } = useQuery<{ disclaimer: string }>({
    queryKey: ["/api/admin/settings/call-disclaimer"],
  });

  const { data: pipelineHealth, isLoading: healthLoading } = useQuery<PipelineHealth>({
    queryKey: ["/api/admin/pipeline-health"],
  });

  const { data: scoreWeights } = useQuery<LeadScoreWeights>({
    queryKey: ["/api/admin/lead-score-weights"],
  });

  const [maxRetryAttempts, setMaxRetryAttempts] = useState("3");
  const [retryDelayDays, setRetryDelayDays] = useState("2");
  const [warningWindow, setWarningWindow] = useState("15");
  const [disclaimer, setDisclaimer] = useState("");

  const [weightEmail, setWeightEmail] = useState(20);
  const [weightWebsite, setWeightWebsite] = useState(15);
  const [weightRating, setWeightRating] = useState(25);
  const [weightReviews, setWeightReviews] = useState(15);
  const [weightPhone, setWeightPhone] = useState(15);
  const [weightClicked, setWeightClicked] = useState(10);

  useEffect(() => {
    if (settings) {
      setMaxRetryAttempts(settings["max_retry_attempts"] ?? "3");
      setRetryDelayDays(settings["retry_delay_business_days"] ?? "2");
      setWarningWindow(settings["warning_window_minutes"] ?? "15");
    }
  }, [settings]);

  useEffect(() => {
    if (disclaimerData) {
      setDisclaimer(disclaimerData.disclaimer ?? "");
    }
  }, [disclaimerData]);

  useEffect(() => {
    if (scoreWeights) {
      setWeightEmail(scoreWeights.score_weight_email);
      setWeightWebsite(scoreWeights.score_weight_website);
      setWeightRating(scoreWeights.score_weight_rating);
      setWeightReviews(scoreWeights.score_weight_reviews);
      setWeightPhone(scoreWeights.score_weight_phone);
      setWeightClicked(scoreWeights.score_weight_clicked);
    }
  }, [scoreWeights]);

  const saveSettingMutation = useMutation({
    mutationFn: async (data: { key: string; value: string }) => {
      await apiRequest("PUT", "/api/admin/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Setting saved" });
    },
    onError: () => toast({ title: "Failed to save setting", variant: "destructive" }),
  });

  const saveDisclaimerMutation = useMutation({
    mutationFn: async (data: { disclaimer: string }) => {
      await apiRequest("PUT", "/api/admin/settings/call-disclaimer", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/call-disclaimer"] });
      toast({ title: "Disclaimer saved" });
    },
    onError: () => toast({ title: "Failed to save disclaimer", variant: "destructive" }),
  });

  const saveWeightsMutation = useMutation({
    mutationFn: async (weights: LeadScoreWeights) => {
      await apiRequest("PUT", "/api/admin/lead-score-weights", { weights });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lead-score-weights"] });
      toast({ title: "Lead scoring weights saved" });
    },
    onError: () => toast({ title: "Failed to save weights", variant: "destructive" }),
  });

  const recalcScoresMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/leads/recalculate-scores");
      return res.json();
    },
    onSuccess: (data: { updated: number }) => {
      toast({ title: `Recalculated scores for ${data.updated} leads` });
    },
    onError: () => toast({ title: "Failed to recalculate scores", variant: "destructive" }),
  });

  const weightTotal = weightEmail + weightWebsite + weightRating + weightReviews + weightPhone + weightClicked;

  const isLoading = settingsLoading || disclaimerLoading;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-settings-title">
            <Settings className="h-5 w-5" /> Settings Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage operational settings for the onboarding system</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/call-disclaimer"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline-health"] });
            toast({ title: "Refreshed all settings" });
          }}
          data-testid="button-refresh-settings"
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Card data-testid="card-retry-settings">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" /> Retry Settings
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                When a call results in No Answer, Voicemail, Gatekeeper, or Call Dropped, the lead is automatically scheduled for retry. Retried leads appear in the RETRY tab (not as new leads). The delay spaces out attempts so callers are not calling the same lead back-to-back.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-retry-attempts">Max Retry Attempts</Label>
                  <p className="text-xs text-muted-foreground">How many times a lead will be retried before being marked unreachable</p>
                  <Input
                    id="max-retry-attempts"
                    type="number"
                    min="1"
                    value={maxRetryAttempts}
                    onChange={(e) => setMaxRetryAttempts(e.target.value)}
                    data-testid="input-max-retry-attempts"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retry-delay-days">Retry Delay (Business Days)</Label>
                  <p className="text-xs text-muted-foreground">Number of business days to wait between retry attempts (weekends excluded)</p>
                  <Input
                    id="retry-delay-days"
                    type="number"
                    min="1"
                    value={retryDelayDays}
                    onChange={(e) => setRetryDelayDays(e.target.value)}
                    data-testid="input-retry-delay-days"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => {
                    saveSettingMutation.mutate({ key: "max_retry_attempts", value: maxRetryAttempts });
                    saveSettingMutation.mutate({ key: "retry_delay_business_days", value: retryDelayDays });
                  }}
                  disabled={saveSettingMutation.isPending}
                  data-testid="button-save-retry-settings"
                >
                  {saveSettingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Retry Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-call-settings">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" /> Call Settings
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="warning-window">Business Hours Warning Window (Minutes)</Label>
                <p className="text-xs text-muted-foreground">Callers see a warning if the lead's local time is within this many minutes of closing time (e.g., 15 = warn if less than 15 min left)</p>
                <div className="max-w-xs">
                  <Input
                    id="warning-window"
                    type="number"
                    min="1"
                    value={warningWindow}
                    onChange={(e) => setWarningWindow(e.target.value)}
                    data-testid="input-warning-window"
                  />
                </div>
              </div>
              <Button
                onClick={() => saveSettingMutation.mutate({ key: "warning_window_minutes", value: warningWindow })}
                disabled={saveSettingMutation.isPending}
                data-testid="button-save-warning-window"
              >
                {saveSettingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save Warning Window
              </Button>

              <div className="border-t pt-4 space-y-2">
                <Label htmlFor="call-disclaimer">Call Recording Disclaimer</Label>
                <Textarea
                  id="call-disclaimer"
                  value={disclaimer}
                  onChange={(e) => setDisclaimer(e.target.value)}
                  className="min-h-[100px] resize-y"
                  data-testid="textarea-call-disclaimer"
                />
                <Button
                  onClick={() => saveDisclaimerMutation.mutate({ disclaimer })}
                  disabled={saveDisclaimerMutation.isPending}
                  data-testid="button-save-disclaimer"
                >
                  {saveDisclaimerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Disclaimer
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-webhook-status">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" /> Webhook Status
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium">SIGNUP_WEBHOOK_SECRET</p>
                  <p className="text-xs text-muted-foreground">Set via environment variables</p>
                </div>
                <Badge variant="outline" data-testid="badge-webhook-status">
                  <AlertCircle className="h-3 w-3 mr-1" /> Configured via env
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Recent Signup Events</p>
                  <p className="text-xs text-muted-foreground">Webhook events are processed automatically</p>
                </div>
                <Badge variant="secondary" data-testid="badge-signup-events">Active</Badge>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-lead-score-weights">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" /> Lead Scoring Weights
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight-email">Email Available</Label>
                  <Input
                    id="weight-email"
                    type="number"
                    min="0"
                    value={weightEmail}
                    onChange={(e) => setWeightEmail(Number(e.target.value))}
                    data-testid="input-weight-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight-website">Website Available</Label>
                  <Input
                    id="weight-website"
                    type="number"
                    min="0"
                    value={weightWebsite}
                    onChange={(e) => setWeightWebsite(Number(e.target.value))}
                    data-testid="input-weight-website"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight-rating">Google Rating</Label>
                  <Input
                    id="weight-rating"
                    type="number"
                    min="0"
                    value={weightRating}
                    onChange={(e) => setWeightRating(Number(e.target.value))}
                    data-testid="input-weight-rating"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight-reviews">Review Count</Label>
                  <Input
                    id="weight-reviews"
                    type="number"
                    min="0"
                    value={weightReviews}
                    onChange={(e) => setWeightReviews(Number(e.target.value))}
                    data-testid="input-weight-reviews"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight-phone">Phone Available</Label>
                  <Input
                    id="weight-phone"
                    type="number"
                    min="0"
                    value={weightPhone}
                    onChange={(e) => setWeightPhone(Number(e.target.value))}
                    data-testid="input-weight-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight-clicked">Clicked Link</Label>
                  <Input
                    id="weight-clicked"
                    type="number"
                    min="0"
                    value={weightClicked}
                    onChange={(e) => setWeightClicked(Number(e.target.value))}
                    data-testid="input-weight-clicked"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground" data-testid="text-weight-total">
                  Total: <span className="font-semibold">{weightTotal}</span>
                  {weightTotal !== 100 && (
                    <span className="ml-1 text-yellow-600 dark:text-yellow-400">(recommended: 100)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() =>
                    saveWeightsMutation.mutate({
                      score_weight_email: weightEmail,
                      score_weight_website: weightWebsite,
                      score_weight_rating: weightRating,
                      score_weight_reviews: weightReviews,
                      score_weight_phone: weightPhone,
                      score_weight_clicked: weightClicked,
                    })
                  }
                  disabled={saveWeightsMutation.isPending}
                  data-testid="button-save-weights"
                >
                  {saveWeightsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Weights
                </Button>
                <Button
                  variant="outline"
                  onClick={() => recalcScoresMutation.mutate()}
                  disabled={recalcScoresMutation.isPending}
                  data-testid="button-recalculate-scores"
                >
                  {recalcScoresMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Recalculate All Scores
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-data-export">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" /> Data Export
              </h3>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => window.open("/api/admin/export/leads", "_blank")}
                  data-testid="button-export-leads"
                >
                  <Download className="h-4 w-4 mr-1" /> Export Leads
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open("/api/admin/export/call-logs", "_blank")}
                  data-testid="button-export-call-logs"
                >
                  <Download className="h-4 w-4 mr-1" /> Export Call Logs
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open("/api/admin/export/email-logs", "_blank")}
                  data-testid="button-export-email-logs"
                >
                  <Download className="h-4 w-4 mr-1" /> Export Email Logs
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open("/api/admin/export/signups", "_blank")}
                  data-testid="button-export-signups"
                >
                  <Download className="h-4 w-4 mr-1" /> Export Signups
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-pipeline-health">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" /> Pipeline Health
              </h3>
            </CardHeader>
            <CardContent>
              {healthLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : pipelineHealth ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <HealthMetric
                    label="Total Uncontacted"
                    value={pipelineHealth.totalUncontacted}
                    testId="text-total-uncontacted"
                  />
                  <HealthMetric
                    label="Untouched Assigned"
                    value={pipelineHealth.untouchedAssigned}
                    testId="text-untouched-assigned"
                  />
                  <HealthMetric
                    label="Retry Queue Size"
                    value={pipelineHealth.retryQueueSize}
                    testId="text-retry-queue"
                  />
                  <HealthMetric
                    label="Unreachable Count"
                    value={pipelineHealth.unreachableCount}
                    testId="text-unreachable-count"
                  />
                  <HealthMetric
                    label="Active / Pending"
                    value={pipelineHealth.activePending}
                    testId="text-active-pending"
                  />
                  <HealthMetric
                    label="Clicked, Not Signed Up"
                    value={pipelineHealth.clickedNotSignedUp}
                    testId="text-clicked-not-signed"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-health-data">
                  Pipeline health data unavailable
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function HealthMetric({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="text-center p-3 rounded-md bg-muted/50">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold" data-testid={testId}>{value}</p>
    </div>
  );
}
