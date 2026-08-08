"use client";

import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { json as jsonLang, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";

const baseTheme = EditorView.theme({
  "&": { fontSize: "12.5px", backgroundColor: "transparent" },
  ".cm-content": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none" },
});

type EditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
  readOnly?: boolean;
};

export function JsonEditor({ value, onChange, height = "150px", placeholder, readOnly }: EditorProps) {
  return (
    <CodeMirror
      value={value}
      height={height}
      theme="dark"
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={onChange}
      extensions={[jsonLang(), lintGutter(), linter(jsonParseLinter()), baseTheme]}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
      className="overflow-hidden rounded-md border border-slate-700 focus-within:border-indigo-500"
    />
  );
}

export function jsonValidity(text: string): { valid: true } | { valid: false; message: string } {
  if (!text.trim()) return { valid: true };
  try {
    JSON.parse(text);
    return { valid: true };
  } catch (e) {
    return { valid: false, message: e instanceof Error ? e.message : "invalid JSON" };
  }
}

import { sql as sqlLang } from "@codemirror/lang-sql";

export function SqlEditor({ value, onChange, height = "100px", placeholder, readOnly }: EditorProps) {
  return (
    <CodeMirror
      value={value}
      height={height}
      theme="dark"
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={onChange}
      extensions={[sqlLang(), baseTheme]}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
      className="overflow-hidden rounded-xl border border-slate-800 focus-within:border-sky-500 bg-slate-950"
    />
  );
}

