import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PALETTE } from "@/utils/color";
import SmartCropImg from "@/components/SmartCropImg";
import DetectionsOverlay from "@/components/DetectionsOverlay";
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

// Debug types
type YolosBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type YolosPred = { label: string; score: number; box: YolosBox };

type RawDet = { box?: unknown; score?: unknown; label?: unknown };

function resultToDetections(result: unknown[]): YolosPred[] {
  if (!Array.isArray(result)) return [];

  return (result as RawDet[])
    .filter(
      (p): p is { box: unknown; score: number; label: unknown } =>
        typeof p.score === "number" &&
        p.box !== undefined &&
        p.label !== undefined,
    )
    .map((p) => {
      let box: YolosBox;
      if (Array.isArray(p.box) && p.box.length === 4) {
        const [x1, y1, x2, y2] = p.box as number[];
        box = { xmin: x1, ymin: y1, xmax: x2, ymax: y2 };
      } else {
        box = p.box as YolosBox;
      }
      return {
        label: String(p.label),
        score: p.score,
        box,
      };
    });
}

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
  the rest continues with functions etc etc.
