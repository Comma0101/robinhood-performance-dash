"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";

interface UploadedFile {
  filename: string;
  originalName: string;
  size: number;
  uploadedAt: string;
  modifiedAt: string;
  dateRange?: { start: string; end: string };
  recordCount?: number;
  status?: "pending" | "processed" | "error";
  checksum?: string;
}

interface CsvUploaderProps {
  onUploadSuccess?: () => void;
}

export default function CsvUploader({ onUploadSuccess }: CsvUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error" | "warning" | null;
    message: string;
    warnings?: string[];
  }>({ type: null, message: "" });
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load list of uploaded files
  const loadFiles = useCallback(async () => {
    try {
      setIsLoadingFiles(true);
      const response = await fetch("/api/trades/upload");
      if (response.ok) {
        const data = await response.json();
        setUploadedFiles(data.files || []);
      } else {
        console.error("Failed to load files");
      }
    } catch (error) {
      console.error("Error loading files:", error);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadStatus({
        type: "error",
        message: "Please select a CSV file",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus({ type: null, message: "" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      const response = await fetch("/api/trades/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();

      if (response.ok) {
        setUploadStatus({
          type: result.warnings && result.warnings.length > 0 ? "warning" : "success",
          message: result.warnings && result.warnings.length > 0 
            ? result.warnings.join(" ")
            : result.message || "File uploaded successfully!",
          warnings: result.warnings,
        });

        // Refresh file list
        await loadFiles();

        // Notify parent to refresh data
        if (onUploadSuccess) {
          setTimeout(() => {
            onUploadSuccess();
          }, 500);
        }

        // Clear status after 5 seconds (or 10 if warnings)
        setTimeout(() => {
          setUploadStatus({ type: null, message: "" });
        }, result.warnings && result.warnings.length > 0 ? 10000 : 5000);
      } else {
        setUploadStatus({
          type: "error",
          message: result.error || result.message || "Upload failed",
        });
      }
    } catch (error: any) {
      setUploadStatus({
        type: "error",
        message: error.message || "Upload failed",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDeleteFile = async (filename: string) => {
    if (
      !confirm(
        `Are you sure you want to delete ${filename}? This will remove it from the dashboard.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/trades/upload?filename=${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        await loadFiles();
        if (onUploadSuccess) {
          setTimeout(() => {
            onUploadSuccess();
          }, 500);
        }
      } else {
        const result = await response.json();
        alert(result.error || "Failed to delete file");
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("Failed to delete file");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDateRange = (dateRange?: { start: string; end: string }) => {
    if (!dateRange) return "N/A";
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${
            isDragging
              ? "border-primary bg-primary-subtle/10"
              : "border-border-default bg-bg-surface hover:border-border-strong"
          }
          ${isUploading ? "opacity-50 pointer-events-none" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />

        {isUploading ? (
          <div className="space-y-2">
            <div className="text-lg font-medium text-text-primary">
              Uploading...
            </div>
            <div className="w-full bg-bg-elevated rounded-full h-2 max-w-md mx-auto">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="text-sm text-text-secondary">{uploadProgress}%</div>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-4">📤</div>
            <div className="text-lg font-medium text-text-primary mb-2">
              Drop your CSV file here
            </div>
            <div className="text-sm text-text-secondary mb-4">
              or click to browse
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
            >
              Select File
            </button>
            <div className="text-xs text-text-tertiary mt-2">
              Maximum file size: 10MB
            </div>
          </>
        )}
      </div>

      {/* Status Message */}
      {uploadStatus.type && (
        <div
          className={`p-4 rounded-lg ${
            uploadStatus.type === "success"
              ? "bg-success-subtle text-success-text border border-success/20"
              : uploadStatus.type === "warning"
              ? "bg-warning-subtle text-warning-text border border-warning/20"
              : "bg-error-subtle text-error-text border border-error/20"
          }`}
        >
          <div className="font-medium mb-1">
            {uploadStatus.type === "success"
              ? "✓ Success"
              : uploadStatus.type === "warning"
              ? "⚠ Warning"
              : "✗ Error"}
          </div>
          <div className="text-sm">{uploadStatus.message}</div>
          {uploadStatus.warnings && uploadStatus.warnings.length > 0 && (
            <div className="mt-2 text-sm">
              <strong>Note:</strong> Duplicate transactions will be automatically
              deduplicated.
            </div>
          )}
        </div>
      )}

      {/* Uploaded Files List */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Uploaded CSV Files
          </h3>
          <button
            onClick={loadFiles}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh file list"
          >
            ↻ Refresh
          </button>
        </div>
        {isLoadingFiles ? (
          <div className="text-text-secondary text-sm">Loading files...</div>
        ) : uploadedFiles.length === 0 ? (
          <div className="text-text-secondary text-sm text-center py-4">
            No CSV files uploaded yet
          </div>
        ) : (
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.filename}
                className="flex items-start justify-between p-3 bg-bg-elevated rounded-lg hover:bg-bg-surface transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-text-primary truncate">
                    {file.originalName}
                  </div>
                  <div className="text-sm text-text-secondary space-y-1 mt-1">
                    <div>
                      {formatFileSize(file.size)} • Uploaded{" "}
                      {new Date(file.uploadedAt || file.modifiedAt).toLocaleDateString()}
                    </div>
                    {file.dateRange && (
                      <div>
                        Date Range: {formatDateRange(file.dateRange)}
                      </div>
                    )}
                    {file.recordCount !== undefined && (
                      <div>Records: {file.recordCount.toLocaleString()}</div>
                    )}
                    {file.status && (
                      <div className="inline-block">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            file.status === "processed"
                              ? "bg-success-subtle text-success-text"
                              : file.status === "error"
                              ? "bg-error-subtle text-error-text"
                              : "bg-warning-subtle text-warning-text"
                          }`}
                        >
                          {file.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteFile(file.filename)}
                  className="ml-4 px-3 py-1 text-sm text-error hover:bg-error-subtle rounded transition-colors flex-shrink-0"
                  title="Delete file"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

