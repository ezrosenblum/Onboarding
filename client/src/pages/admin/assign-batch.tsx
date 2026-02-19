import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, Lead } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Search, UserCheck, Loader2, Users, CalendarDays, Phone, PhoneOff, Mail, CheckCircle2, Clock, RefreshCw } from "lucide-react";

const CALL_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  NOT_CALLED: { label: "Not Called", variant: "outline" },
  NO_ANSWER: { label: "No Answer", variant: "secondary" },
  SPOKE_INTERESTED: { label: "Interested", variant: "default" },
  SPOKE_SEND_INFO: { label: "Send Info", variant: "default" },
  SPOKE_NOT_INTERESTED: { label: "Not Interested", variant: "destructive" },
  SPOKE_ALREADY_SIGNED_UP: { label: "Already Signed", variant: "secondary" },
  WRONG_NUMBER: { label: "Wrong Number", variant: "destructive" },
  VOICEMAIL: { label: "Voicemail", variant: "secondary" },
};

export default function AssignBatchPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("assign");

  const [stateFilter, setStateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minRating, setMinRating] = useState("");
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [loadLimit, setLoadLimit] = useState("100");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const { data: assignedTodayLeads, isLoading: loadingAssignedToday, refetch: refetchAssignedToday } = useQuery<Lead[]>({
    queryKey: ["/api/leads/assigned-today"],
    enabled: activeTab === "assigned-today",
  });

  const handleSearch = async () => {
    setSearching(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      if (stateFilter) params.set("state", stateFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (minRating) params.set("minRating", minRating);
      if (hasPhone) params.set("hasPhone", "true");
      if (hasEmail) params.set("hasEmail", "true");
      if (unassignedOnly) params.set("unassigned", "true");
      if (loadLimit) params.set("limit", loadLimit);
      const res = await fetch(`/api/leads/filtered?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leads");
      const data = await res.json();
      setLeads(data);
      setSearched(true);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      const userId = parseInt(selectedUserId);
      if (isNaN(userId)) throw new Error("Please select a user to assign");
      if (selectedIds.size === 0) throw new Error("No leads selected");
      const promises = Array.from(selectedIds).map((leadId) =>
        apiRequest("PATCH", `/api/leads/${leadId}`, { assignedToUserId: userId })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      toast({ title: "Assignment complete", description: `${selectedIds.size} lead(s) assigned successfully.` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/assigned-today"] });
      handleSearch();
    },
    onError: (err: any) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  const allUsers = users ?? [];
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;

  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  const groupedByUser = (assignedTodayLeads ?? []).reduce<Record<number, { user: User | undefined; leads: Lead[] }>>((acc, lead) => {
    const uid = lead.assignedToUserId!;
    if (!acc[uid]) acc[uid] = { user: userMap.get(uid), leads: [] };
    acc[uid].leads.push(lead);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Assign Batch</h1>
        <p className="text-sm text-muted-foreground mt-1">Filter leads, assign them, and track today's assignments</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-assign-batch">
          <TabsTrigger value="assign" data-testid="tab-assign">
            <UserCheck className="h-4 w-4 mr-2" />
            Assign
          </TabsTrigger>
          <TabsTrigger value="assigned-today" data-testid="tab-assigned-today">
            <CalendarDays className="h-4 w-4 mr-2" />
            Assigned Today
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assign" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2"><Search className="h-4 w-4" /> Filter Leads</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">State</Label>
                  <Input
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    placeholder="e.g., CA"
                    data-testid="input-state-filter"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
                  <Input
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    placeholder="e.g., plumber"
                    data-testid="input-category-filter"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Min Rating</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                    placeholder="e.g., 4.0"
                    data-testid="input-min-rating"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="has-phone"
                    checked={hasPhone}
                    onCheckedChange={(c) => setHasPhone(c === true)}
                    data-testid="checkbox-has-phone"
                  />
                  <Label htmlFor="has-phone" className="text-sm cursor-pointer">Has Phone</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="has-email"
                    checked={hasEmail}
                    onCheckedChange={(c) => setHasEmail(c === true)}
                    data-testid="checkbox-has-email"
                  />
                  <Label htmlFor="has-email" className="text-sm cursor-pointer">Has Email</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="unassigned-only"
                    checked={unassignedOnly}
                    onCheckedChange={(c) => setUnassignedOnly(c === true)}
                    data-testid="checkbox-unassigned-only"
                  />
                  <Label htmlFor="unassigned-only" className="text-sm cursor-pointer">Unassigned Only</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="load-limit" className="text-sm text-muted-foreground whitespace-nowrap">Load up to</Label>
                  <Input
                    id="load-limit"
                    type="number"
                    min={1}
                    max={5000}
                    value={loadLimit}
                    onChange={(e) => setLoadLimit(e.target.value)}
                    className="w-24"
                    data-testid="input-load-limit"
                  />
                  <Label className="text-sm text-muted-foreground">leads</Label>
                </div>
              </div>

              <Button onClick={handleSearch} disabled={searching} data-testid="button-search">
                {searching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </CardContent>
          </Card>

          {searched && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h3 className="font-semibold flex items-center gap-2">
                    Results
                    <Badge variant="secondary" data-testid="badge-result-count">{leads.length} lead(s)</Badge>
                  </h3>
                  {selectedIds.size > 0 && (
                    <Badge variant="outline" data-testid="badge-selected-count">{selectedIds.size} selected</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {leads.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-results">No leads match the current filters.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <Label className="text-xs text-muted-foreground mb-1 block">Assign To</Label>
                        {allUsers.length === 0 ? (
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Users className="h-4 w-4" /> No users found.
                          </div>
                        ) : (
                          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger data-testid="select-user">
                              <SelectValue placeholder="Select a user" />
                            </SelectTrigger>
                            <SelectContent>
                              {allUsers.map((u) => (
                                <SelectItem key={u.id} value={String(u.id)} data-testid={`select-user-option-${u.id}`}>
                                  {u.name} ({u.role})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="pt-4">
                        <Button
                          onClick={() => assignMutation.mutate()}
                          disabled={selectedIds.size === 0 || !selectedUserId || assignMutation.isPending}
                          data-testid="button-assign-selected"
                        >
                          {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                          Assign Selected ({selectedIds.size})
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-md overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-3 text-left w-10">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={toggleSelectAll}
                                data-testid="checkbox-select-all"
                              />
                            </th>
                            <th className="p-3 text-left font-medium">Company</th>
                            <th className="p-3 text-left font-medium">State</th>
                            <th className="p-3 text-left font-medium">Category</th>
                            <th className="p-3 text-left font-medium">Rating</th>
                            <th className="p-3 text-left font-medium">Phone</th>
                            <th className="p-3 text-left font-medium">Email</th>
                            <th className="p-3 text-left font-medium">Assigned To</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leads.map((lead) => (
                            <tr key={lead.id} className="border-b last:border-b-0" data-testid={`row-lead-${lead.id}`}>
                              <td className="p-3">
                                <Checkbox
                                  checked={selectedIds.has(lead.id)}
                                  onCheckedChange={() => toggleSelect(lead.id)}
                                  data-testid={`checkbox-lead-${lead.id}`}
                                />
                              </td>
                              <td className="p-3 font-medium" data-testid={`text-company-${lead.id}`}>{lead.companyName}</td>
                              <td className="p-3" data-testid={`text-state-${lead.id}`}>{lead.state || "-"}</td>
                              <td className="p-3" data-testid={`text-category-${lead.id}`}>{lead.categoryKeyword || "-"}</td>
                              <td className="p-3" data-testid={`text-rating-${lead.id}`}>{lead.rating || "-"}</td>
                              <td className="p-3" data-testid={`text-phone-${lead.id}`}>{lead.phone ? "Yes" : "No"}</td>
                              <td className="p-3" data-testid={`text-email-${lead.id}`}>{lead.scrapedEmail || lead.confirmedEmail ? "Yes" : "No"}</td>
                              <td className="p-3" data-testid={`text-assigned-${lead.id}`}>
                                {lead.assignedToUserId ? (
                                  <Badge variant="secondary">{userMap.get(lead.assignedToUserId)?.name ?? `User #${lead.assignedToUserId}`}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">Unassigned</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assigned-today" className="space-y-6 mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-assigned-today-heading">
                <CalendarDays className="h-5 w-5" />
                Today's Assignments
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Leads assigned today, grouped by caller with call progress
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchAssignedToday()} data-testid="button-refresh-assigned">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {loadingAssignedToday ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (assignedTodayLeads ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground" data-testid="text-no-assignments">No leads have been assigned today.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="secondary" data-testid="badge-total-assigned-today">
                  {(assignedTodayLeads ?? []).length} total assigned today
                </Badge>
                <Badge variant="outline" data-testid="badge-callers-count">
                  {Object.keys(groupedByUser).length} caller(s)
                </Badge>
                <Badge variant="outline" data-testid="badge-called-count">
                  {(assignedTodayLeads ?? []).filter(l => l.statusCall !== "NOT_CALLED").length} called
                </Badge>
                <Badge variant="outline" data-testid="badge-uncalled-count">
                  {(assignedTodayLeads ?? []).filter(l => l.statusCall === "NOT_CALLED").length} not yet called
                </Badge>
              </div>

              {Object.entries(groupedByUser).map(([userId, { user, leads: userLeads }]) => {
                const called = userLeads.filter(l => l.statusCall !== "NOT_CALLED").length;
                const total = userLeads.length;
                const progressPct = total > 0 ? Math.round((called / total) * 100) : 0;

                return (
                  <Card key={userId} data-testid={`card-user-assignments-${userId}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold" data-testid={`text-user-name-${userId}`}>
                              {user?.name ?? `User #${userId}`}
                            </h3>
                            <p className="text-xs text-muted-foreground">{user?.role ?? "unknown"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium" data-testid={`text-progress-${userId}`}>{called}/{total} called</p>
                            <p className="text-xs text-muted-foreground">{progressPct}% complete</p>
                          </div>
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${progressPct}%` }}
                              data-testid={`progress-bar-${userId}`}
                            />
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-md overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="p-3 text-left font-medium">Company</th>
                              <th className="p-3 text-left font-medium">Location</th>
                              <th className="p-3 text-left font-medium">Phone</th>
                              <th className="p-3 text-left font-medium">Call Status</th>
                              <th className="p-3 text-left font-medium">Email Status</th>
                              <th className="p-3 text-left font-medium">Attempts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userLeads.map((lead) => {
                              const callConfig = CALL_STATUS_CONFIG[lead.statusCall] || { label: lead.statusCall, variant: "outline" as const };
                              return (
                                <tr key={lead.id} className="border-b last:border-b-0" data-testid={`row-assigned-lead-${lead.id}`}>
                                  <td className="p-3 font-medium" data-testid={`text-assigned-company-${lead.id}`}>{lead.companyName}</td>
                                  <td className="p-3 text-muted-foreground">
                                    {[lead.city, lead.state].filter(Boolean).join(", ") || "-"}
                                  </td>
                                  <td className="p-3">
                                    {lead.phone ? (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Phone className="h-3 w-3" /> {lead.phone}
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <PhoneOff className="h-3 w-3" /> None
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3" data-testid={`badge-call-status-${lead.id}`}>
                                    <Badge variant={callConfig.variant}>
                                      {lead.statusCall === "NOT_CALLED" ? (
                                        <Clock className="h-3 w-3 mr-1" />
                                      ) : (
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                      )}
                                      {callConfig.label}
                                    </Badge>
                                  </td>
                                  <td className="p-3">
                                    <Badge variant="outline">
                                      <Mail className="h-3 w-3 mr-1" />
                                      {lead.statusEmail === "SENT" ? "Sent" : lead.statusEmail === "NOT_SENT" ? "Not Sent" : lead.statusEmail}
                                    </Badge>
                                  </td>
                                  <td className="p-3 text-center" data-testid={`text-attempts-${lead.id}`}>{lead.attemptCount}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
