import { LayoutResult, computeLayout } from "./layout";
import { Nodes, branchColor } from "./model";
import { Theme } from "./themes";
import { MapDoc, SlideStyle } from "./types";

export interface SlideItem {
  text: string;
  level: number; // 0 = anak langsung, 1, 2
}

export interface Slide {
  id: string; // "cover" atau id node
  kind: "cover" | "topic";
  nodeId: string;
  title: string;
  kicker?: string;
  subtitle?: string;
  items: SlideItem[];
  color: string;
  style: SlideStyle;
  note?: string;
  excluded: boolean;
  nodes: Nodes;
  layoutCache?: LayoutResult;
}

const MAX_LEVELS = 3;

function collectItems(nodes: Nodes, id: string): SlideItem[] {
  const out: SlideItem[] = [];
  const walk = (nid: string, level: number) => {
    for (const c of nodes[nid].children) {
      if (!nodes[c]) continue;
      out.push({ text: nodes[c].text, level });
      if (level + 1 < MAX_LEVELS) walk(c, level + 1);
    }
  };
  walk(id, 0);
  return out;
}

export function buildSlides(doc: MapDoc, theme: Theme): Slide[] {
  const { nodes, rootId, pitch } = doc;
  const root = nodes[rootId];
  const slides: Slide[] = [];
  const base = { nodes, excluded: false };

  if (pitch.cover) {
    const n = root.children.length;
    slides.push({
      ...base,
      id: "cover",
      kind: "cover",
      nodeId: rootId,
      title: root.text,
      subtitle: root.note || (n ? `${n} topik utama` : ""),
      items: [],
      color: theme.accent,
      style: "bullets",
      note: root.note,
    });
  }

  const styleOf = (id: string): SlideStyle => pitch.styleOverrides[id] ?? pitch.style;
  const excl = new Set(pitch.excluded);

  for (const bid of root.children) {
    const b = nodes[bid];
    if (!b) continue;
    const color = branchColor(nodes, rootId, bid, theme.palette);
    const bExcluded = excl.has(bid);
    if (pitch.depth === 2 && b.children.length) {
      for (const cid of b.children) {
        const c = nodes[cid];
        if (!c) continue;
        slides.push({
          ...base,
          id: cid,
          kind: "topic",
          nodeId: cid,
          title: c.text,
          kicker: b.text,
          items: collectItems(nodes, cid),
          color,
          style: styleOf(cid),
          note: c.note,
          excluded: bExcluded || excl.has(cid),
        });
      }
    } else {
      slides.push({
        ...base,
        id: bid,
        kind: "topic",
        nodeId: bid,
        title: b.text,
        items: collectItems(nodes, bid),
        color,
        style: styleOf(bid),
        note: b.note,
        excluded: bExcluded,
      });
    }
  }
  return slides;
}

export function getLayout(s: Slide): LayoutResult {
  // tata letak ke kanan (bagan logika) lebih terbaca di slide 16:9 dan cocok untuk tampil bertahap
  if (!s.layoutCache) s.layoutCache = computeLayout(s.nodes, s.nodeId, "right", { ignoreCollapsed: true });
  return s.layoutCache;
}

/** Kelompokkan item: setiap grup diawali item level 0. */
export function groupItems(items: SlideItem[]): SlideItem[][] {
  const groups: SlideItem[][] = [];
  for (const it of items) {
    if (it.level === 0 || !groups.length) groups.push([it]);
    else groups[groups.length - 1].push(it);
  }
  return groups;
}

/** Jumlah langkah tampil bertahap pada slide. */
export function stepsOf(s: Slide): number {
  if (s.kind === "cover") return 0;
  if (s.style === "cards") return groupItems(s.items).length;
  if (s.style === "map") return Math.max(0, Object.keys(getLayout(s).nodes).length - 1);
  return s.items.length;
}
