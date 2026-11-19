import { useEffect, useRef } from "react";
import { Sheet } from "./types";

interface Props {
  sheet: Sheet;
  selectedId: string | null;
  focusToken: number;
  onSelect(id: string): void;
  onRename(id: string, text: string): void;
  onAddSibling(id: string): void;
  onIndent(id: string): void;
  onOutdent(id: string): void;
  onDelete(id: string): void;
}

export default function Outline(props: Props) {
  const { sheet: doc, selectedId, focusToken } = props;
  const wrap = useRef<HTMLDivElement>(null);

  const rows: { id: string; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    rows.push({ id, depth });
    doc.nodes[id].children.forEach((c) => doc.nodes[c] && walk(c, depth + 1));
  };
  walk(doc.rootId, 0);

  // fokus ke baris terpilih saat diminta (mis. setelah Enter membuat saudara baru)
  useEffect(() => {
    if (!focusToken || !selectedId) return;
    const el = wrap.current?.querySelector<HTMLInputElement>(`input[data-oid="${selectedId}"]`);
    el?.focus();
    el?.select();
  }, [focusToken, selectedId]);

  return (
    <div className="outline" ref={wrap}>
      {rows.map(({ id, depth }) => {
        const n = doc.nodes[id];
        return (
          <div
            key={id + ":" + n.text}
            className={"o-row" + (id === selectedId ? " sel" : "")}
            style={{ paddingLeft: 10 + depth * 18 }}
            onClick={() => props.onSelect(id)}
          >
            <span className="o-dot" />
            <input
              data-oid={id}
              defaultValue={n.text}
              spellCheck={false}
              onFocus={() => props.onSelect(id)}
              onBlur={(e) => {
                if (e.target.value !== n.text) props.onRename(id, e.target.value);
              }}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (el.value !== n.text) props.onRename(id, el.value);
                  props.onAddSibling(id);
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  if (el.value !== n.text) props.onRename(id, el.value);
                  e.shiftKey ? props.onOutdent(id) : props.onIndent(id);
                } else if (e.key === "Backspace" && el.value === "" && id !== doc.rootId) {
                  e.preventDefault();
                  props.onDelete(id);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
