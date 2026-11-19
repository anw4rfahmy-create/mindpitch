import { useState } from "react";
import Editor from "./Editor";
import Home from "./Home";
import { Workbook } from "./types";

export default function App() {
  const [doc, setDoc] = useState<Workbook | null>(null);
  return doc ? (
    <Editor key={doc.id} initial={doc} onBack={() => setDoc(null)} />
  ) : (
    <Home onOpen={setDoc} />
  );
}
