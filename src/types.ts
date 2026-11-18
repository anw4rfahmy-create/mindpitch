export type NodeShape = "rounded" | "pill" | "box" | "line";
export type LayoutKind = "map" | "right" | "down";

export interface MNode {
  id: string;
  parentId: string | null;
  text: string;
  children: string[];
  collapsed?: boolean;
  color?: string; // warna isi node
  shape?: NodeShape;
  note?: string;
}

export type SlideStyle = "bullets" | "cards" | "map";
export type Transition = "fade" | "slide" | "none";

export interface PitchSettings {
  theme: string;
  depth: 1 | 2; // 1 = satu slide per cabang utama, 2 = juga per sub-cabang
  style: SlideStyle;
  transition: Transition;
  reveal: boolean; // tampil bertahap
  secondsPerSlide: number; // untuk ekspor video / auto-play
  cover: boolean;
  excluded: string[]; // id node yang tidak dijadikan slide
  styleOverrides: Record<string, SlideStyle>;
}

export interface MapDoc {
  id: string;
  title: string;
  rootId: string;
  nodes: Record<string, MNode>;
  layout: LayoutKind;
  pitch: PitchSettings;
  createdAt: number;
  updatedAt: number;
}

export const defaultPitch = (): PitchSettings => ({
  theme: "terang",
  depth: 1,
  style: "bullets",
  transition: "fade",
  reveal: true,
  secondsPerSlide: 6,
  cover: true,
  excluded: [],
  styleOverrides: {},
});
