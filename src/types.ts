export type NodeShape = "rounded" | "pill" | "box" | "line" | "none" | "ellipse";

export type StructureId =
  | "mind-both"
  | "mind-right"
  | "mind-left"
  | "logic-right"
  | "logic-left"
  | "logic-both"
  | "brace-right"
  | "brace-left"
  | "org-down"
  | "org-up"
  | "tree-right"
  | "tree-left"
  | "timeline"
  | "fishbone";

export type LineStyle = "auto" | "curve" | "elbow" | "round" | "straight";
export type TopicStyle = "auto" | "box" | "pill" | "line" | "none";
export type PatternId = "none" | "diag" | "diag2" | "cross" | "dots" | "horiz" | "vert";
export type ImgSize = "S" | "M" | "L";

export interface Attachment {
  id: string; // id berkas di IndexedDB
  name: string;
  mime: string;
  size: number;
}

export interface NodeImage {
  fileId: string;
  ar: number; // lebar / tinggi
  size: ImgSize;
}

export interface MNode {
  id: string;
  parentId: string | null;
  text: string;
  children: string[];
  collapsed?: boolean;
  color?: string; // warna isi/garis topik
  shape?: NodeShape;
  note?: string;
  font?: string; // id font khusus topik
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  pattern?: PatternId;
  /** Bila ada: topik ini adalah Ringkasan (kurung) yang merangkum saudara dari `from` sampai `to`. */
  summary?: { from: string; to: string };
  image?: NodeImage;
  attachments?: Attachment[];
}

export interface FloatImage {
  id: string;
  fileId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapBg {
  color: string;
  imageId?: string;
  fit: "cover" | "contain" | "tile";
}

export type SlideTransition = "fade" | "slide" | "none";

export interface PitchSettings {
  theme: string;
  bgImageId?: string;
  bgDim: number; // 0..0.8 lapisan gelap di atas gambar latar
  focus: boolean; // judul di tengah sebelum pindah ke kiri
  credit: boolean; // tulisan "Dibuat dengan MindPitch" pada sampul
  transition: SlideTransition;
  secondsPerStep: number; // untuk putar otomatis & video
  textScale: number; // 0.8 .. 1.4
  excluded: string[]; // id topik yang tidak ikut Pitch
}

export interface CellStyle {
  bg?: string;
  color?: string;
  bold?: boolean;
  align?: "l" | "c" | "r";
  size?: number;
}

/** Lembar bertipe tabel (mis. tashrif). Sel diindeks [baris][kolom] secara logis; bila `rtl`, kolom 0 tampil di kanan. */
export interface TableData {
  rows: number;
  cols: number;
  cells: string[][];
  style: Record<string, CellStyle>; // kunci "r,c"
  colW: number[]; // 0 = otomatis
  headRows: number;
  headCols: number;
  rtl: boolean;
  font: string; // untuk teks Latin
  arFont: string; // untuk teks Arab
  fontSize: number;
  headBg: string;
  stripe: boolean;
  border: string;
}

export interface Sheet {
  table?: TableData;
  id: string;
  title: string;
  rootId: string;
  nodes: Record<string, MNode>;
  structure: StructureId;
  theme: string; // tema warna cabang
  colored: boolean;
  lineStyle: LineStyle;
  lineWidth: number; // 0 = otomatis
  topicStyle: TopicStyle;
  pattern?: PatternId; // arsir bawaan semua topik
  font: string; // id font global
  bg: MapBg;
  floats: FloatImage[];
  pitch: PitchSettings;
}

export interface Workbook {
  id: string;
  title: string;
  sheets: Sheet[];
  activeId: string;
  createdAt: number;
  updatedAt: number;
}

export const defaultPitch = (): PitchSettings => ({
  theme: "biru",
  bgDim: 0.35,
  focus: true,
  credit: false,
  transition: "fade",
  secondsPerStep: 3,
  textScale: 1,
  excluded: [],
});

export const defaultBg = (): MapBg => ({ color: "#fbfcff", fit: "cover" });
