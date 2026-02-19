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
import { Settings, Save, Loader2, RefreshCw, AlertCircle, Shield, Phone, Activity } from "lucide-react";
import { useState, useEffect } from "react";

interface PipelineHealth {
  totalUncontacted: number;
  untouchedAssigned: number;
  retryQueueSize: number;
  unreachableCount: number;
  activePending: number;
  clickedNotSignedUp: number;
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

  const [maxRetryAttempts, setMaxRetryAttempts] = useState("3");
  const [retryDelayDays, setRetryDelayDays] = useState("2");
  const [warningWindow, setWarningWindow] = useState("15");
  const [disclaimer, setDisclaimer] = useState("");

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
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-retry-attempts">Max Retry Attempts</Label>
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
