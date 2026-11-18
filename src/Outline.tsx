import { useEffect, useRef } from "react";
import { Nodes, addChild, addSibling, indent, outdent, removeNode, reorder, updateNode, visibleOrder } from "./model";
import { MapDoc } from "./types";

interface Props {
  doc: MapDoc;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (nodes: Nodes) => void;
}

export default function Outline({ doc, selected, onSelect, onChange }: Props) {
  const { nodes, rootId } = doc;
  const order = visibleOrder(nodes, rootId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected || !ref.current) return;
    const el = ref.current.querySelector(`[data-id="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      onChange(indent(nodes, id));
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      onChange(outdent(nodes, id));
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const r = addSibling(nodes, id) || addChild(nodes, id);
      if (r) {
        onChange(r.nodes);
        onSelect(r.id);
      }
    } else if (e.key === "Backspace" && (e.target as HTMLInputElement).value === "" && nodes[id].parentId) {
      e.preventDefault();
      const parent = nodes[id].parentId!;
      onChange(removeNode(nodes, id));
      onSelect(parent);
    } else if (e.key === "ArrowUp" && e.altKey) {
      e.preventDefault();
      onChange(reorder(nodes, id, -1));
    } else if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      onChange(reorder(nodes, id, 1));
    }
  };

  return (
    <div className="outline" ref={ref}>
      {order.map((id) => {
        const n = nodes[id];
        const depth = (() => {
          let d = 0;
          let c = n.parentId;
          while (c) {
            d++;
            c = nodes[c]?.parentId ?? null;
          }
          return d;
        })();
        return (
          <div
            key={id}
            data-id={id}
            className={`outline-row${selected === id ? " sel" : ""}`}
            style={{ paddingLeft: 12 + depth * 18 }}
            onClick={() => onSelect(id)}
          >
            <input
              value={n.text}
              onChange={(e) => onChange(updateNode(nodes, id, { text: e.target.value }))}
              onKeyDown={(e) => onKey(e, id)}
              onFocus={() => onSelect(id)}
            />
          </div>
        );
      })}
    </div>
  );
}
