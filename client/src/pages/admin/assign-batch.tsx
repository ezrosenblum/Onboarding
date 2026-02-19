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
import { useToast } from "@/hooks/use-toast";
import { Search, UserCheck, UserMinus, Loader2, Users, AlertTriangle } from "lucide-react";

interface CallerQueue {
  userId: number;
  userName: string;
  uncalledCount: number;
  totalAssigned: number;
}

export default function AssignBatchPage() {
  const { toast } = useToast();

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
  const { data: callerQueues } = useQuery<CallerQueue[]>({ queryKey: ["/api/admin/caller-queues"] });

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/caller-queues"] });
      handleSearch();
    },
    onError: (err: any) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      if (selectedIds.size === 0) throw new Error("No leads selected");
      const promises = Array.from(selectedIds).map((leadId) =>
        apiRequest("PATCH", `/api/leads/${leadId}`, { assignedToUserId: null })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      toast({ title: "Unassignment complete", description: `${selectedIds.size} lead(s) unassigned successfully.` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/caller-queues"] });
      handleSearch();
    },
    onError: (err: any) => {
      toast({ title: "Unassignment failed", description: err.message, variant: "destructive" });
    },
  });

  const allUsers = users ?? [];
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  const selectedCallerQueue = selectedUserId
    ? (callerQueues ?? []).find((q) => q.userId === parseInt(selectedUserId))
    : null;

  const queuesWithUncalled = (callerQueues ?? []).filter((q) => q.uncalledCount > 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Assign Batch</h1>
        <p className="text-sm text-muted-foreground mt-1">Filter leads, select them, and assign to a user</p>
      </div>

      {queuesWithUncalled.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20" data-testid="card-queue-alerts">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">Callers with uncalled leads in their queue</p>
                <div className="space-y-1">
                  {queuesWithUncalled.map((q) => (
                    <p key={q.userId} className="text-sm text-yellow-700 dark:text-yellow-500" data-testid={`text-queue-alert-${q.userId}`}>
                      {q.userName} has {q.uncalledCount} uncalled lead{q.uncalledCount !== 1 ? "s" : ""} remaining (out of {q.totalAssigned} assigned)
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                  <div className="pt-4 flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={() => assignMutation.mutate()}
                      disabled={selectedIds.size === 0 || !selectedUserId || assignMutation.isPending}
                      data-testid="button-assign-selected"
                    >
                      {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                      Assign Selected ({selectedIds.size})
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => unassignMutation.mutate()}
                      disabled={selectedIds.size === 0 || unassignMutation.isPending}
                      data-testid="button-unassign-selected"
                    >
                      {unassignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserMinus className="h-4 w-4 mr-2" />}
                      Unassign Selected ({selectedIds.size})
                    </Button>
                  </div>
                </div>

                {selectedCallerQueue && selectedCallerQueue.uncalledCount > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-50/80 dark:bg-yellow-950/30 border border-yellow-500/30" data-testid="alert-selected-caller-queue">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-400">
                      {selectedCallerQueue.userName} still has {selectedCallerQueue.uncalledCount} uncalled lead{selectedCallerQueue.uncalledCount !== 1 ? "s" : ""} in their queue
                    </p>
                  </div>
                )}

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
    </div>
  );
}
