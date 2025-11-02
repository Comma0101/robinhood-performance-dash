import { NextResponse } from "next/server";
import { loadAndProcessData } from "../route";

// This endpoint provides detailed verification of data processing
export async function GET() {
  try {
    const { trades, metadata, stats } = await loadAndProcessData();

    // Perform additional validation checks
    const validationChecks = {
      dataIntegrity: {
        hasTrades: trades && trades.length > 0,
        hasMetadata: metadata && metadata.length > 0,
        statsMatch: stats.processedTrades === trades.length,
      },
      completeness: {
        allFilesProcessed: metadata.every(
          (f) => f.status === "processed" || f.status === "error"
        ),
        noErrors: stats.processingErrors.length === 0,
      },
      consistency: {
        recordsMatchFiles: Object.values(stats.recordsByFile).reduce(
          (sum: number, file: any) => sum + file.total,
          0
        ) >= stats.totalRawRecords * 0.9, // Allow 10% margin for deduplication
        pnlCalculated: trades.length > 0 && stats.totalPnL !== undefined,
      },
    };

    const allChecksPass = Object.values(validationChecks).every((category) =>
      Object.values(category).every((check) => check === true)
    );

    return NextResponse.json({
      trades,
      metadata: {
        fileCount: metadata.length,
        files: metadata,
        totalRecords: trades.length,
      },
      stats,
      validation: {
        checks: validationChecks,
        overall: {
          passed: allChecksPass,
          score: Math.round(
            (Object.values(validationChecks)
              .flat()
              .filter((check) => check === true).length /
              Object.values(validationChecks).flat().length) *
              100
          ),
          warnings: stats.processingWarnings,
          errors: stats.processingErrors,
        },
      },
    });
  } catch (error: any) {
    console.error("Error verifying trade data:", error);
    return NextResponse.json(
      { message: "Error verifying trade data", error: error.message },
      { status: 500 }
    );
  }
}

