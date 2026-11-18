import { useState } from "react";
import Editor from "./Editor";
import Home from "./Home";
import { MapDoc } from "./types";

export default function App() {
  const [doc, setDoc] = useState<MapDoc | null>(null);
  return doc ? (
    <Editor key={doc.id} initial={doc} onBack={() => setDoc(null)} />
  ) : (
    <Home onOpen={setDoc} />
  );
}
