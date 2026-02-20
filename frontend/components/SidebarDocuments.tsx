"use client";

import { FileText, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SidebarDocumentsProps {
  documents: string[];
  selectedDocument?: string;
  indexReady: boolean;
  isIndexLoading: boolean;
  onSelect: (doc: string) => void;
  onUpload: () => void;
}

export function SidebarDocuments({
  documents,
  selectedDocument,
  indexReady,
  isIndexLoading,
  onSelect,
  onUpload,
}: SidebarDocumentsProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>Upload and manage indexed files</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="text-sm font-medium">Index Status</div>
          {isIndexLoading ? (
            <Badge variant="warning" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Building
            </Badge>
          ) : indexReady ? (
            <Badge variant="success">Ready</Badge>
          ) : (
            <Badge variant="neutral">Not Ready</Badge>
          )}
        </div>

        <Button className="w-full" onClick={onUpload}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {documents.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No documents available yet.</p>
          ) : (
            documents.map((doc) => {
              const active = selectedDocument === doc;
              return (
                <button
                  type="button"
                  key={doc}
                  onClick={() => onSelect(doc)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    active
                      ? "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="break-all">{doc}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
