import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listCustomers, saveCustomer } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dateOnly } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import type { Customer as CustomerRow } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — SuppPOS" },
      {
        name: "description",
        content: "A simple customer list with name and optional phone number.",
      },
      { property: "og:title", content: "Customers — SuppPOS" },
      {
        property: "og:description",
        content: "A simple customer list with name and optional phone number.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Customers,
});

type Customer = CustomerRow;

function Customers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      return listCustomers();
    },
  });

  const filtered = (customers ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
  });

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null };
      await saveCustomer(editing ? editing.id : null, payload);
      toast.success(editing ? "Customer updated" : "Customer added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const startAdd = () => {
    setEditing(null);
    setName("");
    setPhone("");
    setOpen(true);
  };
  const startEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone ?? "");
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers?.length ?? 0} customers`}
        actions={
          <Button onClick={startAdd}>
            <Plus className="mr-2 size-4" /> Add customer
          </Button>
        }
      />
      <div className="space-y-3 p-4 md:p-6">
        <Input
          placeholder="Search name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Added</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.phone || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dateOnly(c.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(c)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No customers yet. They are also created automatically when you enter a phone at
                    billing.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="n">Name</Label>
              <Input id="n" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Phone (optional)</Label>
              <Input
                id="p"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
