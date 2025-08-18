import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PALETTE } from "@/utils/color";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft } from "lucide-react";

type ItemRow = {
  id: string;
  owner: string;
  title: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  color_name: string | null;
  color_hex: string | null;
  image_path: string;
  bbox?:
    | { xmin: number; ymin: number; xmax: number; ymax: number }
    | number[]
    | null;
  yolos_result?: unknown[] | null;
  yolos_top_labels?: string[] | null;
};


const CATEGORY_OPTIONS = [
  "accessory",
  "bag",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "top",
] as const;

const SUBCATS: Record<(typeof CATEGORY_OPTIONS)[number], string[]> = {
  accessory: [
    "belt",
    "hat",
    "cap",
    "beanie",
    "scarf",
    "sunglasses",
    "wallet",
    "jewelry",
  ],
  bag: ["handbag", "tote bag", "shoulder bag", "crossbody bag", "backpack"],
  bottom: ["jeans", "trousers", "pants", "skirt", "shorts"],
  dress: ["dress"],
  outerwear: ["jacket", "blazer", "coat", "cardigan", "hoodie"],
  shoes: ["sneakers", "boots", "heels", "loafers", "sandals"],
  top: [
    "t-shirt",
    "shirt",
    "blouse",
    "sweater",
    "tank top",
    "polo",
    "bodysuit",
    "vest",
  ],
};

export default function ItemDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();

  const [item, setItem] = useState<ItemRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [colorName, setColorName] = useState<string | null>(null);
  const [colorHex, setColorHex] = useState<string | null>(null);

  const subcatOptions = useMemo(() => {
    const key = (category ?? "") as keyof typeof SUBCATS;
    return SUBCATS[key] ?? [];
  }, [category]);


  useEffect(() => {
    (async () => {
      // load item
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        nav("/");
        return;
      }

      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("id", id)
        .eq("owner", user.id)
        .single();

      if (error || !data) {
        toast({
          variant: "destructive",
          title: "Not found",
          description: error?.message ?? "Item missing",
        });
        nav("/");
        return;
      }
      setItem(data as ItemRow);
      setTitle(data.title ?? "");
      setBrand(data.brand ?? "");
      setCategory(data.category ?? null);
      setSubcategory(data.subcategory ?? null);
      setColorName(data.color_name ?? null);
      setColorHex(data.color_hex ?? null);

      // signed image
      const { data: signed } = await supabase.storage
        .from("sila")
        .createSignedUrl(data.image_path, 60 * 10);
      if (signed?.signedUrl) setImageUrl(signed.signedUrl);
    })();
  }, [id]);


  // if user picks a color swatch
  function pickColor(name: string, hex: string) {
    setColorName(name);
    setColorHex(hex);
  }

  async function onSave() {
    if (!item) return;
    setSaving(true);
    try {
      const patch: Partial<ItemRow> = {
        title: title.trim() || null,
        brand: brand.trim() || null,
        category,
        subcategory,
        color_name: colorName,
        color_hex: colorHex,
      };
      const { error } = await supabase
        .from("items")
        .update(patch)
        .eq("id", item.id)
        .eq("owner", item.owner);
      if (error) throw error;
      toast({ title: "Saved", description: "Item updated." });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e?.message ?? String(e),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!item) return;
    try {
      // delete DB row first (RLS ensures owner)
      const { error } = await supabase
        .from("items")
        .delete()
        .eq("id", item.id)
        .eq("owner", item.owner);
      if (error) throw error;
      // optional: also remove derived files if you store them
      // await supabase.storage.from("sila").remove([item.image_path, item.mask_path, item.crop_path].filter(Boolean) as string[]);
      toast({
        title: "Deleted",
        description: "Item removed from your closet.",
      });
      nav("/"); // back to closet
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: e?.message ?? String(e),
      });
    }
  }

  if (!item)
    return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => nav("/")}
            className="hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold">Item</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Trash
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div
          className="rounded-xl overflow-hidden bg-muted flex items-center justify-center"
          style={{ aspectRatio: "4/3" }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title || "item"}
              className="w-full h-full object-cover rounded-2xl"
            />
          ) : (
            <div className="text-sm text-muted-foreground">No image</div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Name</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Contour Squareneck Bodysuit"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Brand</label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Type the brand's name"
              className="placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Category</label>
            <Select
              value={category || ""}
              onValueChange={(v) => {
                setCategory(v || null);
                setSubcategory(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select clothing item category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">
              Sub-Category
            </label>
            <Select
              value={subcategory || ""}
              onValueChange={(v) => setSubcategory(v || null)}
              disabled={!category}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    category ? "Select sub-category" : "Pick a category first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subcatOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Color</label>
            <div className="grid grid-cols-8 gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => pickColor(c.name, c.hex)}
                  className={`h-9 w-9 rounded-full border ${
                    colorName === c.name
                      ? "ring-2 ring-offset-2 ring-black"
                      : "opacity-90"
                  }`}
                  title={c.name}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
            {colorName && (
              <div className="text-xs text-muted-foreground">
                Selected: <span className="font-medium">{colorName}</span>{" "}
                <span className="font-mono">{colorHex}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the item from your closet. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}