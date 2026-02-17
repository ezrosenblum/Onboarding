import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Lead } from "@shared/schema";
import { callStatusEnum } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, Building2, MapPin, ExternalLink, Search, Filter } from "lucide-react";
import { useState, useMemo } from "react";

function statusColor(status: string) {
  switch (status) {
    case "NOT_CALLED": return "secondary";
    case "SPOKE_INTERESTED": return "default";
    case "SPOKE_SEND_INFO": return "default";
    case "SPOKE_NOT_INTERESTED": return "destructive";
    default: return "outline";
  }
}

export default function AllLeadsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignFilter, setAssignFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });

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

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">All Vendor Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "Loading..." : `${filtered.length} of ${(leads ?? []).length} leads`}
        </p>
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
          {filtered.map((lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-lead-${lead.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
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
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />{lead.confirmedEmail || lead.scrapedEmail}
                          </span>
                        )}
                      </div>
                    </div>
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
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
