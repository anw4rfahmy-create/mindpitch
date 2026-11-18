export type NodeId = string

export interface Node {
  id: NodeId
  text: string
  children: NodeId[]
  parent?: NodeId
  collapsed?: boolean
  color?: string
  shape?: 'rounded' | 'rect' | 'ellipse'
  note?: string
}

export interface Doc {
  id: string
  title: string
  rootId: NodeId
  nodes: Record<NodeId, Node>
  layout: 'mindmap' | 'logic' | 'org'
  theme?: string
  updatedAt: number
}

export type LayoutMode = Doc['layout']
