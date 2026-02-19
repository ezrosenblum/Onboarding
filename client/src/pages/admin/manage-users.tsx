import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertUserSchema, type InsertUser, type User, userRoleEnum } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Loader2, Pencil, Trash2 } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  vendor_caller: "Vendor Caller",
  buyer_caller: "Buyer Caller",
};

const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.enum(userRoleEnum),
  password: z.string().optional().refine((val) => !val || val.length >= 6, {
    message: "Password must be at least 6 characters",
  }),
});
type EditUserInput = z.infer<typeof editUserSchema>;

export default function ManageUsersPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const createForm = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: { name: "", email: "", password: "", role: "vendor_caller" },
  });

  const editForm = useForm<EditUserInput>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: "", email: "", role: "vendor_caller", password: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      await apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setCreateOpen(false);
      createForm.reset();
      toast({ title: "User created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: EditUserInput & { id: number }) => {
      const { id, ...body } = data;
      const payload: Record<string, string> = {
        name: body.name,
        email: body.email,
        role: body.role,
      };
      if (body.password && body.password.length > 0) {
        payload.password = body.password;
      }
      await apiRequest("PATCH", `/api/users/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditOpen(false);
      setEditingUser(null);
      editForm.reset();
      toast({ title: "User updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update user", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete user", description: err.message, variant: "destructive" });
    },
  });

  function openEditDialog(user: User) {
    setEditingUser(user);
    editForm.reset({
      name: user.name,
      email: user.email,
      role: user.role,
      password: "",
    });
    setEditOpen(true);
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Manage Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading..." : `${(users ?? []).length} user${(users ?? []).length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-user">
              <Plus className="h-4 w-4 mr-2" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input placeholder="Jane Doe" data-testid="input-create-user-name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={createForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="jane@company.com" data-testid="input-create-user-email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={createForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl><Input type="password" placeholder="Min 6 characters" data-testid="input-create-user-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={createForm.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-create-user-role">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {userRoleEnum.map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-user">
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create User
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((d) => editingUser && editMutation.mutate({ ...d, id: editingUser.id }))} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input placeholder="Jane Doe" data-testid="input-edit-user-name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="jane@company.com" data-testid="input-edit-user-email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl><Input type="password" placeholder="Leave blank to keep current" data-testid="input-edit-user-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-user-role">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {userRoleEnum.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={editMutation.isPending} data-testid="button-save-user">
                {editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (users ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No users yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(users ?? []).map((u) => {
            const initials = u.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const isSelf = currentUser?.id === u.id;
            return (
              <Card key={u.id} data-testid={`card-user-${u.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm" data-testid={`text-user-name-${u.id}`}>{u.name}</p>
                      <p className="text-xs text-muted-foreground" data-testid={`text-user-email-${u.id}`}>{u.email}</p>
                    </div>
                    <Badge variant="outline" className="text-xs" data-testid={`badge-user-role-${u.id}`}>{ROLE_LABELS[u.role] || u.role}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      data-testid={`button-edit-user-${u.id}`}
                      onClick={() => openEditDialog(u)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!isSelf && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-delete-user-${u.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {u.name}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel data-testid={`button-cancel-delete-${u.id}`}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              data-testid={`button-confirm-delete-${u.id}`}
                              onClick={() => deleteMutation.mutate(u.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
