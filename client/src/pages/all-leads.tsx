import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Lead } from "@shared/schema";
import { callStatusEnum } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Phone, Mail, Building2, MapPin, ExternalLink, Search, Filter, Pencil, Trash2, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function statusColor(status: string) {
  switch (status) {
    case "NOT_CALLED": return "secondary";
    case "SPOKE_INTERESTED": return "default";
    case "SPOKE_SEND_INFO": return "default";
    case "SPOKE_NOT_INTERESTED": return "destructive";
    default: return "outline";
  }
}

interface EditFormData {
  businessName: string;
  contactName: string;
  phone: string;
  scrapedEmail: string;
  confirmedEmail: string;
  state: string;
  categoryKeyword: string;
  website: string;
  rating: string;
}

export default function AllLeadsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignFilter, setAssignFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({
    businessName: "",
    contactName: "",
    phone: "",
    scrapedEmail: "",
    confirmedEmail: "",
    state: "",
    categoryKeyword: "",
    website: "",
    rating: "",
  });
  const [deleteLeadId, setDeleteLeadId] = useState<number | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const { toast } = useToast();

  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<EditFormData> }) => {
      await apiRequest("PATCH", `/api/leads/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setEditLead(null);
      toast({ title: "Lead updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update lead", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setDeleteLeadId(null);
      toast({ title: "Lead deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete lead", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/leads/bulk-delete", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      toast({ title: "Selected leads deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete leads", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let result = leads ?? [];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.companyName.toLowerCase().includes(s) ||
          l.phone?.toLowerCase().includes(s) ||
          l.city?.toLowerCase().includes(s) ||
          l.state?.toLowerCase().includes(s)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((l) => l.statusCall === statusFilter);
    }
    if (assignFilter === "assigned") {
      result = result.filter((l) => l.assignedToUserId != null);
    } else if (assignFilter === "unassigned") {
      result = result.filter((l) => l.assignedToUserId == null);
    }
    if (sortBy === "name") {
      result = [...result].sort((a, b) => a.companyName.localeCompare(b.companyName));
    } else {
      result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return result;
  }, [leads, search, statusFilter, assignFilter, sortBy]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openEditDialog(lead: Lead) {
    setEditLead(lead);
    setEditForm({
      businessName: lead.companyName ?? "",
      contactName: lead.contactName ?? "",
      phone: lead.phone ?? "",
      scrapedEmail: lead.scrapedEmail ?? "",
      confirmedEmail: lead.confirmedEmail ?? "",
      state: lead.state ?? "",
      categoryKeyword: lead.categoryKeyword ?? "",
      website: lead.website ?? "",
      rating: lead.rating ?? "",
    });
  }

  function handleEditSave() {
    if (!editLead) return;
    updateMutation.mutate({ id: editLead.id, data: editForm });
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">All Vendor Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading..." : `${filtered.length} of ${(leads ?? []).length} leads`}
          </p>
        </div>
        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            onClick={() => setShowBulkDeleteConfirm(true)}
            data-testid="button-delete-selected"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected ({selectedIds.size})
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, phone, city, state..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-leads"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Call Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {callStatusEnum.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignFilter} onValueChange={setAssignFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-assign-filter">
            <SelectValue placeholder="Assignment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]" data-testid="select-sort">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="name">Company Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No leads found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== "all" ? "Try adjusting your filters." : "Upload leads to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 px-4">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={toggleSelectAll}
              data-testid="checkbox-select-all"
            />
            <span className="text-sm text-muted-foreground">Select all</span>
          </div>
          {filtered.map((lead) => (
            <Card key={lead.id} className="hover-elevate" data-testid={`card-lead-${lead.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <Checkbox
                    checked={selectedIds.has(lead.id)}
                    onCheckedChange={() => toggleSelect(lead.id)}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`checkbox-lead-${lead.id}`}
                  />
                  <Link href={`/leads/${lead.id}`} className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" data-testid={`text-company-${lead.id}`}>{lead.companyName}</p>
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
                        {(lead.scrapedEmail || lead.confirmedEmail) && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-email-${lead.id}`}>
                            <Mail className="h-3 w-3" />{lead.confirmedEmail || lead.scrapedEmail}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={statusColor(lead.statusCall)} className="text-xs">
                      {lead.statusCall.replace(/_/g, " ")}
                    </Badge>
                    {lead.assignedToUserId ? (
                      <Badge variant="outline" className="text-xs">Assigned</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Unassigned</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openEditDialog(lead);
                      }}
                      data-testid={`button-edit-lead-${lead.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteLeadId(lead.id);
                      }}
                      data-testid={`button-delete-lead-${lead.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Link href={`/leads/${lead.id}`}>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editLead !== null} onOpenChange={(open) => { if (!open) setEditLead(null); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-edit-lead">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-businessName">Business Name</Label>
              <Input
                id="edit-businessName"
                value={editForm.businessName}
                onChange={(e) => setEditForm((f) => ({ ...f, businessName: e.target.value }))}
                data-testid="input-edit-businessName"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-contactName">Contact Name</Label>
              <Input
                id="edit-contactName"
                value={editForm.contactName}
                onChange={(e) => setEditForm((f) => ({ ...f, contactName: e.target.value }))}
                data-testid="input-edit-contactName"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                data-testid="input-edit-phone"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-scrapedEmail">Scraped Email</Label>
                <Input
                  id="edit-scrapedEmail"
                  value={editForm.scrapedEmail}
                  onChange={(e) => setEditForm((f) => ({ ...f, scrapedEmail: e.target.value }))}
                  data-testid="input-edit-scrapedEmail"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-confirmedEmail">Confirmed Email</Label>
                <Input
                  id="edit-confirmedEmail"
                  value={editForm.confirmedEmail}
                  onChange={(e) => setEditForm((f) => ({ ...f, confirmedEmail: e.target.value }))}
                  data-testid="input-edit-confirmedEmail"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-state">State</Label>
                <Input
                  id="edit-state"
                  value={editForm.state}
                  onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                  data-testid="input-edit-state"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-categoryKeyword">Category Keyword</Label>
                <Input
                  id="edit-categoryKeyword"
                  value={editForm.categoryKeyword}
                  onChange={(e) => setEditForm((f) => ({ ...f, categoryKeyword: e.target.value }))}
                  data-testid="input-edit-categoryKeyword"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-website">Website</Label>
                <Input
                  id="edit-website"
                  value={editForm.website}
                  onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                  data-testid="input-edit-website"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-rating">Rating</Label>
                <Input
                  id="edit-rating"
                  value={editForm.rating}
                  onChange={(e) => setEditForm((f) => ({ ...f, rating: e.target.value }))}
                  data-testid="input-edit-rating"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLead(null)} data-testid="button-edit-cancel">
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending} data-testid="button-edit-save">
              <Check className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteLeadId !== null} onOpenChange={(open) => { if (!open) setDeleteLeadId(null); }}>
        <AlertDialogContent data-testid="dialog-delete-lead">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lead? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteLeadId !== null) deleteMutation.mutate(deleteLeadId); }}
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent data-testid="dialog-bulk-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Leads</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected lead{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              data-testid="button-bulk-delete-confirm"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
