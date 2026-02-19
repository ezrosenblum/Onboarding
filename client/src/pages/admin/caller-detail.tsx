import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Phone, Mail, CheckCircle2, TrendingUp, AlertTriangle, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CallerDetailData {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    dailyCallTarget: number;
  };
  metrics: {
    totalCalls: number;
    totalEmails: number;
    totalSignups: number;
    callToEmailPct: number;
    clickToSignupPct: number;
    unreachableRate: number;
    outcomeDistribution: { outcome: string; count: number }[];
  };
  dailyTrend: { date: string; calls: number; emails: number; signups: number }[];
}

export default function CallerDetailPage() {
  const [, params] = useRoute("/admin/caller/:userId");
  const userId = params?.userId;
  const [range, setRange] = useState("month");
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<CallerDetailData>({
    queryKey: [`/api/admin/caller/${userId}/detail?range=${range}`],
    enabled: !!userId,
  });

  if (isError) {
    toast({ title: "Error", description: "Failed to load caller details", variant: "destructive" });
  }

  const totalOutcomes = data?.metrics.outcomeDistribution.reduce((sum, o) => sum + o.count, 0) ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/admin/dashboard">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        {isLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : data ? (
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold" data-testid="text-caller-name">{data.user.name}</h1>
            <Badge variant="secondary" data-testid="badge-caller-role">{data.user.role}</Badge>
            <span className="text-sm text-muted-foreground" data-testid="text-daily-target">
              Daily target: {data.user.dailyCallTarget} calls
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {(["today", "week", "month"] as const).map((r) => (
          <Button
            key={r}
            variant={range === r ? "default" : "outline"}
            size="sm"
            onClick={() => setRange(r)}
            data-testid={`button-range-${r}`}
            className="toggle-elevate"
          >
            {r === "today" ? "Today" : r === "week" ? "Week" : "Month"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Calls</p>
                    <p className="text-2xl font-bold" data-testid="text-total-calls">{data.metrics.totalCalls}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Emails</p>
                    <p className="text-2xl font-bold" data-testid="text-total-emails">{data.metrics.totalEmails}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Signups</p>
                    <p className="text-2xl font-bold" data-testid="text-total-signups">{data.metrics.totalSignups}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Call→Email %</p>
                    <p className="text-2xl font-bold" data-testid="text-call-to-email">{data.metrics.callToEmailPct}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Click→Signup %</p>
                    <p className="text-2xl font-bold" data-testid="text-click-to-signup">{data.metrics.clickToSignupPct}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Unreachable Rate</p>
                    <p className="text-2xl font-bold" data-testid="text-unreachable-rate">{data.metrics.unreachableRate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Outcome Distribution
              </h3>
            </CardHeader>
            <CardContent>
              {data.metrics.outcomeDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-outcomes">
                  No outcomes recorded
                </p>
              ) : (
                <div className="space-y-3">
                  {data.metrics.outcomeDistribution.map((item) => {
                    const pct = totalOutcomes > 0 ? (item.count / totalOutcomes) * 100 : 0;
                    return (
                      <div key={item.outcome} className="flex items-center gap-3" data-testid={`row-outcome-${item.outcome}`}>
                        <Badge variant="outline" className="min-w-[120px] justify-center shrink-0">
                          {item.outcome}
                        </Badge>
                        <span className="text-sm font-medium w-10 text-right shrink-0">{item.count}</span>
                        <div className="flex-1 h-4 rounded-md bg-muted overflow-visible">
                          <div
                            className="h-full rounded-md bg-primary"
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Daily Trend
              </h3>
            </CardHeader>
            <CardContent>
              {data.dailyTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-trend">
                  No daily data available
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Date</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Calls</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Emails</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Signups</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.dailyTrend].reverse().map((day) => (
                        <tr key={day.date} className="border-b last:border-b-0" data-testid={`row-trend-${day.date}`}>
                          <td className="py-2 pr-3 font-medium">{day.date}</td>
                          <td className="py-2 pr-3 text-right">
                            <Badge variant="outline">{day.calls}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Badge variant="outline">{day.emails}</Badge>
                          </td>
                          <td className="py-2 text-right">
                            <Badge variant="outline">{day.signups}</Badge>
                          </td>
                        </tr>
                      ))}
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
