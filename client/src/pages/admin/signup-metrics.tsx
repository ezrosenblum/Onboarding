import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Users } from "lucide-react";
import { useState } from "react";

interface SignupMetrics {
  total: number;
  byCaller: { userId: number; userName: string; count: number }[];
}

export default function SignupMetricsPage() {
  const [range, setRange] = useState("today");

  const { data: metrics, isLoading } = useQuery<SignupMetrics>({
    queryKey: [`/api/admin/metrics/signups?range=${range}`],
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-signup-metrics-title">
          <BarChart3 className="h-5 w-5" /> Signup Metrics
        </h1>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-36" data-testid="select-metrics-range">
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
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Signups ({range === "today" ? "Today" : range === "week" ? "This Week" : "This Month"})</p>
                  <p className="text-3xl font-bold" data-testid="text-total-signups">{metrics?.total ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> By Caller</h3>
            </CardHeader>
            <CardContent>
              {(metrics?.byCaller ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-caller-signups">No signups in this period</p>
              ) : (
                <div className="space-y-3">
                  {metrics?.byCaller.map((caller, i) => (
                    <div key={caller.userId} className="flex items-center justify-between gap-3" data-testid={`row-caller-${caller.userId}`}>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">{i + 1}</Badge>
                        <span className="text-sm font-medium">{caller.userName}</span>
                      </div>
                      <Badge data-testid={`badge-caller-count-${caller.userId}`}>{caller.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
