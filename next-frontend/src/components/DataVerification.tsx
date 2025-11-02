"use client";

import React, { useState, useEffect } from "react";

interface VerificationData {
  stats: {
    totalRawRecords: number;
    uniqueRecords: number;
    duplicateRecords: number;
    recordsByFile: Record<string, { total: number; unique: number; duplicates: number; legitimateRepeats?: number }>;
    processedTrades: number;
    tradesByType: Record<string, number>;
    tradesByStatus: { wins: number; losses: number; breakevens: number };
    dateRange: { start: string | null; end: string | null };
    totalPnL: number;
    processingWarnings: string[];
    processingErrors: string[];
    duplicateDetails?: Array<{
      fingerprint: string;
      record: {
        date: string;
        transCode: string;
        description: string;
        instrument: string;
        quantity: number;
        price: number;
        amount: number;
      };
      occurrences: Array<{
        filename: string;
        originalName: string;
        dateRange: { start: string; end: string };
      }>;
      isDuplicate: boolean;
      reason: string;
    }>;
  };
  metadata: {
    fileCount: number;
    files: Array<{
      filename: string;
      originalName: string;
      uploadedAt: string;
      dateRange: { start: string; end: string };
      status: string;
      recordCount?: number;
    }>;
    totalRecords: number;
  };
  validation: {
    checks: {
      dataIntegrity: Record<string, boolean>;
      completeness: Record<string, boolean>;
      consistency: Record<string, boolean>;
    };
    overall: {
      passed: boolean;
      score: number;
      warnings: string[];
      errors: string[];
    };
  };
}

export default function DataVerification() {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVerification = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/trades/verify");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const verificationData = await response.json();
      setData(verificationData);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerification();
  }, []);

  if (loading) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <div className="text-text-secondary">Loading verification data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <div className="text-error mb-4">Error loading verification data</div>
          <button
            onClick={fetchVerification}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { stats, metadata, validation } = data;

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-text-primary">
            Data Processing Verification
          </h3>
          <button
            onClick={fetchVerification}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh verification"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Overall Score */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`text-2xl font-bold ${
                validation.overall.passed
                  ? "text-success"
                  : validation.overall.score >= 70
                  ? "text-warning"
                  : "text-error"
              }`}
            >
              {validation.overall.score}%
            </div>
            <div className="flex-1">
              <div className="w-full bg-bg-elevated rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    validation.overall.passed
                      ? "bg-success"
                      : validation.overall.score >= 70
                      ? "bg-warning"
                      : "bg-error"
                  }`}
                  style={{ width: `${validation.overall.score}%` }}
                />
              </div>
            </div>
            <div
              className={`px-3 py-1 rounded text-sm font-medium ${
                validation.overall.passed
                  ? "bg-success-subtle text-success-text"
                  : "bg-error-subtle text-error-text"
              }`}
            >
              {validation.overall.passed ? "✓ Passed" : "✗ Issues Found"}
            </div>
          </div>
        </div>

        {/* Validation Checks */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-2">Data Integrity</div>
            <div className="space-y-1">
              {Object.entries(validation.checks.dataIntegrity).map(([key, passed]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  {passed ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span className="text-error">✗</span>
                  )}
                  <span className="text-text-secondary capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-2">Completeness</div>
            <div className="space-y-1">
              {Object.entries(validation.checks.completeness).map(([key, passed]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  {passed ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span className="text-error">✗</span>
                  )}
                  <span className="text-text-secondary capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-2">Consistency</div>
            <div className="space-y-1">
              {Object.entries(validation.checks.consistency).map(([key, passed]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  {passed ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span className="text-error">✗</span>
                  )}
                  <span className="text-text-secondary capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Warnings and Errors */}
        {validation.overall.warnings.length > 0 && (
          <div className="mb-4 p-4 bg-warning-subtle border border-warning/20 rounded-lg">
            <div className="font-medium text-warning-text mb-2">⚠ Warnings</div>
            <ul className="list-disc list-inside space-y-1 text-sm text-warning-text">
              {validation.overall.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {validation.overall.errors.length > 0 && (
          <div className="mb-4 p-4 bg-error-subtle border border-error/20 rounded-lg">
            <div className="font-medium text-error-text mb-2">✗ Errors</div>
            <ul className="list-disc list-inside space-y-1 text-sm text-error-text">
              {validation.overall.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Processing Statistics */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-text-primary">
          Processing Statistics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-1">Total Records</div>
            <div className="text-lg font-bold text-text-primary">
              {stats.totalRawRecords.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-1">Unique Records</div>
            <div className="text-lg font-bold text-success">
              {stats.uniqueRecords.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-1">Duplicates</div>
            <div className="text-lg font-bold text-warning">
              {stats.duplicateRecords.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-1">Processed Trades</div>
            <div className="text-lg font-bold text-text-primary">
              {stats.processedTrades.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Trades Breakdown */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-text-primary">
          Trades Breakdown
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="p-3 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-1">By Status</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Wins:</span>
                <span className="text-success font-medium">{stats.tradesByStatus.wins}</span>
              </div>
              <div className="flex justify-between">
                <span>Losses:</span>
                <span className="text-error font-medium">{stats.tradesByStatus.losses}</span>
              </div>
              <div className="flex justify-between">
                <span>Breakeven:</span>
                <span className="text-text-secondary font-medium">
                  {stats.tradesByStatus.breakevens}
                </span>
              </div>
            </div>
          </div>
          <div className="p-3 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-1">By Type</div>
            <div className="space-y-1 text-sm">
              {Object.entries(stats.tradesByType).map(([type, count]) => (
                <div key={type} className="flex justify-between">
                  <span>{type}:</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 bg-bg-elevated rounded-lg">
            <div className="text-sm text-text-secondary mb-1">Date Range</div>
            <div className="text-sm text-text-primary">
              {stats.dateRange.start && stats.dateRange.end
                ? `${new Date(stats.dateRange.start).toLocaleDateString()} - ${new Date(stats.dateRange.end).toLocaleDateString()}`
                : "N/A"}
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate Details */}
      {stats.duplicateDetails && stats.duplicateDetails.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-text-primary">
            Duplicate Records Analysis
          </h3>
          <div className="mb-4 text-sm text-text-secondary">
            Showing {stats.duplicateDetails.filter(d => d.isDuplicate).length} true duplicates
            {" "}
            and {stats.duplicateDetails.filter(d => !d.isDuplicate && d.occurrences.length > 1).length} repeated patterns
          </div>
          
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {stats.duplicateDetails.map((detail, idx) => (
              <div
                key={detail.fingerprint}
                className={`p-4 rounded-lg border ${
                  detail.isDuplicate
                    ? "bg-error-subtle border-error/20"
                    : "bg-warning-subtle border-warning/20"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {detail.isDuplicate ? (
                        <span className="text-error font-medium">⚠️ DUPLICATE</span>
                      ) : (
                        <span className="text-warning font-medium">ℹ️ REPEAT PATTERN</span>
                      )}
                      <span className="text-xs text-text-tertiary px-2 py-1 bg-bg-surface rounded">
                        {detail.occurrences.length} occurrence{detail.occurrences.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <div className="text-text-secondary">Date</div>
                        <div className="font-medium text-text-primary">
                          {new Date(detail.record.date).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-text-secondary">Type</div>
                        <div className="font-medium text-text-primary">
                          {detail.record.transCode}
                        </div>
                      </div>
                      <div>
                        <div className="text-text-secondary">Symbol</div>
                        <div className="font-medium text-text-primary">
                          {detail.record.instrument || detail.record.description.split(" ")[0] || "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-text-secondary">Qty × Price</div>
                        <div className="font-medium text-text-primary">
                          {detail.record.quantity} × ${detail.record.price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-text-secondary">
                      <strong>Description:</strong> {detail.record.description}
                    </div>
                    <div className="mt-2 text-xs text-text-secondary">
                      <strong>Amount:</strong> ${Math.abs(detail.record.amount).toFixed(2)}
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-border-default">
                  <div className="text-xs font-medium text-text-secondary mb-1">
                    Found in files:
                  </div>
                  <div className="space-y-1">
                    {detail.occurrences.map((occ, occIdx) => (
                      <div
                        key={occIdx}
                        className="text-xs bg-bg-elevated p-2 rounded flex items-center justify-between"
                      >
                        <span className="font-medium text-text-primary truncate flex-1">
                          {occ.originalName}
                        </span>
                        <span className="text-text-tertiary ml-2">
                          {new Date(occ.dateRange.start).toLocaleDateString()} -{" "}
                          {new Date(occ.dateRange.end).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-text-tertiary italic">
                    Reason: {detail.reason === "duplicate_overlapping_dates" 
                      ? "Same transaction in overlapping date ranges (duplicate - removed)"
                      : detail.reason === "legitimate_repeat_same_file"
                      ? "Repeat pattern in same file (legitimate - kept)"
                      : detail.reason === "legitimate_separate_trade"
                      ? "Same pattern but different date ranges (separate trade - kept)"
                      : "Unknown"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File-by-File Breakdown */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-text-primary">
          File Processing Details
        </h3>
        <div className="space-y-2">
          {Object.entries(stats.recordsByFile).map(([filename, fileStats]) => {
            const fileMeta = metadata.files.find((f) => f.filename === filename);
            return (
              <div
                key={filename}
                className="p-4 bg-bg-elevated rounded-lg hover:bg-bg-surface transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text-primary truncate">
                      {fileMeta?.originalName || filename}
                    </div>
                    <div className="text-sm text-text-secondary mt-1">
                      {fileMeta?.dateRange
                        ? `${new Date(fileMeta.dateRange.start).toLocaleDateString()} - ${new Date(fileMeta.dateRange.end).toLocaleDateString()}`
                        : "No date range"}
                    </div>
                  </div>
                  <div
                    className={`px-2 py-1 text-xs rounded ${
                      fileMeta?.status === "processed"
                        ? "bg-success-subtle text-success-text"
                        : fileMeta?.status === "error"
                        ? "bg-error-subtle text-error-text"
                        : "bg-warning-subtle text-warning-text"
                    }`}
                  >
                    {fileMeta?.status || "unknown"}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                  <div>
                    <div className="text-text-secondary">Total Records</div>
                    <div className="font-medium text-text-primary">{fileStats.total}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">Unique</div>
                    <div className="font-medium text-success">{fileStats.unique}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">Duplicates</div>
                    <div className="font-medium text-warning">{fileStats.duplicates}</div>
                  </div>
                </div>
                {fileStats.duplicates > 0 && (
                  <div className="mt-2 text-xs text-warning-text">
                    Duplicate rate:{" "}
                    {((fileStats.duplicates / fileStats.total) * 100).toFixed(1)}% (from overlapping date ranges with other files)
                  </div>
                )}
                {fileStats.legitimateRepeats !== undefined && fileStats.legitimateRepeats > 0 && (
                  <div className="mt-2 text-xs text-text-tertiary">
                    Legitimate repeats: {fileStats.legitimateRepeats} (same trade pattern but separate transactions - included in processing)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

