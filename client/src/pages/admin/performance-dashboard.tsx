import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Phone, Mail, Reply, MousePointerClick, Eye, UserCheck, TrendingUp, ArrowRight, AlertTriangle, Clock, MapPin, Tag, Info, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

interface AlertItem {
  type: string;
  callerId: number;
  callerName: string;
  message: string;
  severity: 'warning' | 'info';
}

interface LeakLead {
  id: number;
  companyName: string;
  state: string;
  assignedToUserId: number | null;
  attemptCount: number;
}

interface LeakReport {
  clickedNotSignedUp: LeakLead[];
  spokeNoEmail: LeakLead[];
  retriedNeverMoved: LeakLead[];
  assignedUntouched: LeakLead[];
}

interface CategoryStateAnalysis {
  byState: { state: string; calls: number; emails: number; signups: number; conversionPct: number }[];
  byCategory: { category: string; calls: number; emails: number; signups: number; conversionPct: number }[];
  byRatingBand: { band: string; calls: number; signups: number; conversionPct: number }[];
  bySourceFile: { sourceFile: string; totalLeads: number; calls: number; signups: number; conversionPct: number }[];
}

interface CallerPerformance {
  userId: number;
  userName: string;
  callsMade: number;
  emailsSent: number;
  repliesSent: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsBounced: number;
  signups: number;
  unreachableCount: number;
  avgAttemptsPerLead: number;
  callToEmailPct: number;
  clickToSignupPct: number;
}

interface PerformanceMetrics {
  totals: {
    calls: number;
    emails: number;
    repliesSent: number;
    emailsOpened: number;
    emailsClicked: number;
    emailsBounced: number;
    signups: number;
  };
  rates: {
    callToEmailPct: number;
    emailOpenPct: number;
    emailClickPct: number;
    replyRatePct: number;
    clickToSignupPct: number;
    callToSignupPct: number;
  };
  byCaller: CallerPerformance[];
  signupsByState: { state: string; count: number }[];
  signupsByCategory: { category: string; count: number }[];
  callTimingAnalysis: {
    badTimingCalls: number;
    totalCalls: number;
    badTimingNoAnswerRate: number;
    bestHours: { hour: number; calls: number; connectRate: number }[];
  };
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

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export default function PerformanceDashboardPage() {
  const [range, setRange] = useState("today");
  const rangeLabel = range === "today" ? "Today" : range === "week" ? "This Week" : "This Month";

  const { data: metrics, isLoading } = useQuery<PerformanceMetrics>({
    queryKey: [`/api/admin/metrics/performance?range=${range}`],
  });

  const { data: alerts } = useQuery<AlertItem[]>({
    queryKey: ["/api/admin/alerts"],
  });

  const { data: leakReport } = useQuery<LeakReport>({
    queryKey: ["/api/admin/leak-report"],
  });

  const { data: categoryState } = useQuery<CategoryStateAnalysis>({
    queryKey: ["/api/admin/analytics/category-state", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/category-state?range=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const [expandedLeakSections, setExpandedLeakSections] = useState<Record<string, boolean>>({});

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Phone} label={`Calls ${rangeLabel}`} value={metrics.totals.calls} testId="text-total-calls" />
            <StatCard icon={Mail} label="Emails Sent" value={metrics.totals.emails} testId="text-total-emails" />
            <StatCard icon={Reply} label="Replies Sent" value={metrics.totals.repliesSent} subtext={`${metrics.rates.replyRatePct}% of emails`} testId="text-total-replies" />
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
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <FunnelStep label="Calls" value={metrics.totals.calls} />
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <FunnelStep label="Call→Email" value={`${metrics.rates.callToEmailPct}%`} />
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <FunnelStep label="Email→Open" value={`${metrics.rates.emailOpenPct}%`} />
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <FunnelStep label="Open→Click" value={`${metrics.rates.emailClickPct}%`} />
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <FunnelStep label="Click→Signup" value={`${metrics.rates.clickToSignupPct}%`} />
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <FunnelStep label="Call→Signup" value={`${metrics.rates.callToSignupPct}%`} highlight />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" /> Performance by Caller
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
                        <th className="pb-2 pr-3 font-medium text-muted-foreground">Caller</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Calls</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Emails</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Replies</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Call→Email</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Signups</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Click→Signup</th>
                        <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Unreachable</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Avg Attempts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.byCaller.map((caller) => (
                        <tr key={caller.userId} className="border-b last:border-b-0" data-testid={`row-perf-caller-${caller.userId}`}>
                          <td className="py-3 pr-3 font-medium">{caller.userName}</td>
                          <td className="py-3 pr-3 text-right">
                            <Badge variant="outline">{caller.callsMade}</Badge>
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <Badge variant="outline">{caller.emailsSent}</Badge>
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <Badge variant="outline">{caller.repliesSent}</Badge>
                          </td>
                          <td className="py-3 pr-3 text-right text-muted-foreground">{caller.callToEmailPct}%</td>
                          <td className="py-3 pr-3 text-right">
                            <Badge>{caller.signups}</Badge>
                          </td>
                          <td className="py-3 pr-3 text-right text-muted-foreground">{caller.clickToSignupPct}%</td>
                          <td className="py-3 pr-3 text-right text-muted-foreground">{caller.unreachableCount}</td>
                          <td className="py-3 text-right text-muted-foreground">{caller.avgAttemptsPerLead}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Signups by State
                </h3>
              </CardHeader>
              <CardContent>
                {metrics.signupsByState.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-state-signups">No signups in this period</p>
                ) : (
                  <div className="space-y-2">
                    {metrics.signupsByState.map((item) => (
                      <div key={item.state} className="flex items-center justify-between gap-2" data-testid={`row-signup-state-${item.state}`}>
                        <span className="text-sm font-medium">{item.state}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Tag className="h-4 w-4" /> Signups by Category
                </h3>
              </CardHeader>
              <CardContent>
                {metrics.signupsByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-category-signups">No signups in this period</p>
                ) : (
                  <div className="space-y-2">
                    {metrics.signupsByCategory.map((item) => (
                      <div key={item.category} className="flex items-center justify-between gap-2" data-testid={`row-signup-category-${item.category}`}>
                        <span className="text-sm font-medium">{item.category}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" /> Call Timing Analysis
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Bad Timing Calls</p>
                  <p className="text-xl font-bold" data-testid="text-bad-timing-calls">
                    {metrics.callTimingAnalysis.badTimingCalls}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      / {metrics.callTimingAnalysis.totalCalls}
                    </span>
                  </p>
                </div>
                <div className="text-center p-3 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Bad Timing No-Answer Rate</p>
                  <p className="text-xl font-bold" data-testid="text-bad-timing-no-answer">{metrics.callTimingAnalysis.badTimingNoAnswerRate}%</p>
                </div>
                <div className="text-center p-3 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Bad Timing % of All Calls</p>
                  <p className="text-xl font-bold" data-testid="text-bad-timing-pct">
                    {metrics.callTimingAnalysis.totalCalls > 0
                      ? ((metrics.callTimingAnalysis.badTimingCalls / metrics.callTimingAnalysis.totalCalls) * 100).toFixed(1)
                      : "0.0"}%
                  </p>
                </div>
              </div>

              {metrics.callTimingAnalysis.bestHours.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Best Performing Call Hours (by connect rate)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 pr-3 font-medium text-muted-foreground">Hour</th>
                          <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Calls</th>
                          <th className="pb-2 font-medium text-muted-foreground text-right">Connect Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.callTimingAnalysis.bestHours.slice(0, 10).map((h) => (
                          <tr key={h.hour} className="border-b last:border-b-0" data-testid={`row-hour-${h.hour}`}>
                            <td className="py-2 pr-3 font-medium">{formatHour(h.hour)}</td>
                            <td className="py-2 pr-3 text-right">
                              <Badge variant="outline">{h.calls}</Badge>
                            </td>
                            <td className="py-2 text-right text-muted-foreground">{h.connectRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-alerts">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Alerts
              </h3>
            </CardHeader>
            <CardContent>
              {!alerts || alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-alerts">No alerts</p>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert, idx) => (
                    <div
                      key={`${alert.type}-${alert.callerId}-${idx}`}
                      className={`flex items-center gap-3 p-3 rounded-md ${
                        alert.severity === "warning"
                          ? "bg-yellow-500/10 dark:bg-yellow-500/10"
                          : "bg-blue-500/10 dark:bg-blue-500/10"
                      }`}
                      data-testid={`row-alert-${idx}`}
                    >
                      {alert.severity === "warning" ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                      ) : (
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                      <Badge variant="outline" data-testid={`badge-alert-caller-${idx}`}>{alert.callerName}</Badge>
                      <span className="text-sm" data-testid={`text-alert-message-${idx}`}>{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-leak-report">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Funnel Leak Report
              </h3>
            </CardHeader>
            <CardContent className="space-y-2">
              {leakReport ? (
                <>
                  <LeakSection
                    title="Clicked but Not Signed Up"
                    sectionKey="clickedNotSignedUp"
                    leads={leakReport.clickedNotSignedUp}
                    expanded={expandedLeakSections}
                    toggle={setExpandedLeakSections}
                  />
                  <LeakSection
                    title="Spoke but No Email Sent"
                    sectionKey="spokeNoEmail"
                    leads={leakReport.spokeNoEmail}
                    expanded={expandedLeakSections}
                    toggle={setExpandedLeakSections}
                  />
                  <LeakSection
                    title="Retried 3+ Times, Never Moved"
                    sectionKey="retriedNeverMoved"
                    leads={leakReport.retriedNeverMoved}
                    expanded={expandedLeakSections}
                    toggle={setExpandedLeakSections}
                  />
                  <LeakSection
                    title="Assigned but Untouched (3+ Days)"
                    sectionKey="assignedUntouched"
                    leads={leakReport.assignedUntouched}
                    expanded={expandedLeakSections}
                    toggle={setExpandedLeakSections}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-leak-data">No leak data available</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-conversion-analysis">
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Conversion Analysis
              </h3>
            </CardHeader>
            <CardContent>
              {categoryState ? (
                <Tabs defaultValue="byState">
                  <TabsList className="mb-4 flex-wrap">
                    <TabsTrigger value="byState" data-testid="tab-by-state">By State</TabsTrigger>
                    <TabsTrigger value="byCategory" data-testid="tab-by-category">By Category</TabsTrigger>
                    <TabsTrigger value="byRatingBand" data-testid="tab-by-rating">By Rating Band</TabsTrigger>
                    <TabsTrigger value="bySourceFile" data-testid="tab-by-source">By Source File</TabsTrigger>
                  </TabsList>

                  <TabsContent value="byState">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 pr-3 font-medium text-muted-foreground">State</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Calls</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Emails</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Signups</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Conversion %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...categoryState.byState]
                            .sort((a, b) => b.conversionPct - a.conversionPct)
                            .slice(0, 15)
                            .map((row) => (
                              <tr key={row.state} className="border-b last:border-b-0" data-testid={`row-state-${row.state}`}>
                                <td className="py-2 pr-3 font-medium">{row.state}</td>
                                <td className="py-2 pr-3 text-right">{row.calls}</td>
                                <td className="py-2 pr-3 text-right">{row.emails}</td>
                                <td className="py-2 pr-3 text-right">{row.signups}</td>
                                <td className="py-2 text-right">{row.conversionPct}%</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  <TabsContent value="byCategory">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 pr-3 font-medium text-muted-foreground">Category</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Calls</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Emails</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Signups</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Conversion %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...categoryState.byCategory]
                            .sort((a, b) => b.conversionPct - a.conversionPct)
                            .slice(0, 15)
                            .map((row) => (
                              <tr key={row.category} className="border-b last:border-b-0" data-testid={`row-category-${row.category}`}>
                                <td className="py-2 pr-3 font-medium">{row.category}</td>
                                <td className="py-2 pr-3 text-right">{row.calls}</td>
                                <td className="py-2 pr-3 text-right">{row.emails}</td>
                                <td className="py-2 pr-3 text-right">{row.signups}</td>
                                <td className="py-2 text-right">{row.conversionPct}%</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  <TabsContent value="byRatingBand">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 pr-3 font-medium text-muted-foreground">Band</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Calls</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Signups</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Conversion %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...categoryState.byRatingBand]
                            .sort((a, b) => b.conversionPct - a.conversionPct)
                            .slice(0, 15)
                            .map((row) => (
                              <tr key={row.band} className="border-b last:border-b-0" data-testid={`row-band-${row.band}`}>
                                <td className="py-2 pr-3 font-medium">{row.band}</td>
                                <td className="py-2 pr-3 text-right">{row.calls}</td>
                                <td className="py-2 pr-3 text-right">{row.signups}</td>
                                <td className="py-2 text-right">{row.conversionPct}%</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  <TabsContent value="bySourceFile">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 pr-3 font-medium text-muted-foreground">Source File</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Total Leads</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Calls</th>
                            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Signups</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Conversion %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...categoryState.bySourceFile]
                            .sort((a, b) => b.conversionPct - a.conversionPct)
                            .slice(0, 15)
                            .map((row) => (
                              <tr key={row.sourceFile} className="border-b last:border-b-0" data-testid={`row-source-${row.sourceFile}`}>
                                <td className="py-2 pr-3 font-medium">{row.sourceFile}</td>
                                <td className="py-2 pr-3 text-right">{row.totalLeads}</td>
                                <td className="py-2 pr-3 text-right">{row.calls}</td>
                                <td className="py-2 pr-3 text-right">{row.signups}</td>
                                <td className="py-2 text-right">{row.conversionPct}%</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-analysis-data">No analysis data available</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function LeakSection({
  title,
  sectionKey,
  leads,
  expanded,
  toggle,
}: {
  title: string;
  sectionKey: string;
  leads: LeakLead[];
  expanded: Record<string, boolean>;
  toggle: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const isOpen = expanded[sectionKey] ?? false;
  return (
    <div className="border rounded-md" data-testid={`leak-section-${sectionKey}`}>
      <button
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
        onClick={() => toggle((prev) => ({ ...prev, [sectionKey]: !isOpen }))}
        data-testid={`button-toggle-leak-${sectionKey}`}
      >
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{leads.length}</Badge>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {isOpen && leads.length > 0 && (
        <div className="border-t px-3 pb-3">
          <div className="space-y-1 pt-2">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate text-sm"
                data-testid={`link-leak-lead-${lead.id}`}
              >
                <span className="font-medium">{lead.companyName}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {lead.state && <Badge variant="outline">{lead.state}</Badge>}
                  {lead.assignedToUserId && (
                    <span className="text-xs text-muted-foreground">Caller #{lead.assignedToUserId}</span>
                  )}
                  <span className="text-xs text-muted-foreground">Attempts: {lead.attemptCount}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {isOpen && leads.length === 0 && (
        <div className="border-t px-3 py-3">
          <p className="text-sm text-muted-foreground text-center">None</p>
        </div>
      )}
    </div>
  );
}

function FunnelStep({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`text-center p-2 rounded-md min-w-[80px] ${highlight ? "bg-primary/10" : "bg-muted/50"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
