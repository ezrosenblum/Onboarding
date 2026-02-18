import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Phone, Mail, MousePointerClick, Eye, UserCheck, TrendingUp, ArrowRight, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface CallerPerformance {
  userId: number;
  userName: string;
  callsMade: number;
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsBounced: number;
  signups: number;
}

interface PerformanceMetrics {
  totals: {
    calls: number;
    emails: number;
    emailsOpened: number;
    emailsClicked: number;
    emailsBounced: number;
    signups: number;
  };
  rates: {
    callToEmailPct: number;
    emailOpenPct: number;
    emailClickPct: number;
    clickToSignupPct: number;
  };
  byCaller: CallerPerformance[];
}

function StatCard({ icon: Icon, label, value, subtext, testId }: {
  icon: typeof Phone;
  label: string;
  value: string | number;
  subtext?: string;
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold" data-testid={testId}>{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RateCard({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold" data-testid={testId}>{value}%</p>
      </CardContent>
    </Card>
  );
}

export default function PerformanceDashboardPage() {
  const [range, setRange] = useState("today");
  const rangeLabel = range === "today" ? "Today" : range === "week" ? "This Week" : "This Month";

  const { data: metrics, isLoading } = useQuery<PerformanceMetrics>({
    queryKey: [`/api/admin/metrics/performance?range=${range}`],
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-dashboard-title">
          <Activity className="h-5 w-5" /> Performance Dashboard
        </h1>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-36" data-testid="select-dashboard-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard icon={Phone} label={`Calls ${rangeLabel}`} value={metrics.totals.calls} testId="text-total-calls" />
            <StatCard icon={Mail} label={`Emails Sent`} value={metrics.totals.emails} testId="text-total-emails" />
            <StatCard icon={Eye} label="Emails Opened" value={metrics.totals.emailsOpened} testId="text-total-opened" />
            <StatCard icon={MousePointerClick} label="Emails Clicked" value={metrics.totals.emailsClicked} testId="text-total-clicked" />
            <StatCard icon={AlertTriangle} label="Emails Bounced" value={metrics.totals.emailsBounced} testId="text-total-bounced" />
            <StatCard icon={UserCheck} label="Signups" value={metrics.totals.signups} testId="text-total-signups" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Conversion Funnel
              </h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <RateCard label="Call → Email" value={metrics.rates.callToEmailPct} testId="rate-call-to-email" />
                <RateCard label="Email Open %" value={metrics.rates.emailOpenPct} testId="rate-email-open" />
                <RateCard label="Email Click %" value={metrics.rates.emailClickPct} testId="rate-email-click" />
                <RateCard label="Click → Signup" value={metrics.rates.clickToSignupPct} testId="rate-click-to-signup" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" /> By Caller
              </h3>
            </CardHeader>
            <CardContent>
              {metrics.byCaller.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-caller-activity">
                  No caller activity in this period
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Caller</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Calls</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Emails</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Call→Email</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Signups</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.byCaller.map((caller) => {
                        const callerCallToEmail = caller.callsMade > 0
                          ? Math.round((caller.emailsSent / caller.callsMade) * 1000) / 10
                          : 0;
                        return (
                          <tr key={caller.userId} className="border-b last:border-b-0" data-testid={`row-perf-caller-${caller.userId}`}>
                            <td className="py-3 pr-4 font-medium">{caller.userName}</td>
                            <td className="py-3 pr-4 text-right">
                              <Badge variant="outline">{caller.callsMade}</Badge>
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <Badge variant="outline">{caller.emailsSent}</Badge>
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <span className="text-muted-foreground">{callerCallToEmail}%</span>
                            </td>
                            <td className="py-3 text-right">
                              <Badge>{caller.signups}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
