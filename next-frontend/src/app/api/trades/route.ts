import { NextResponse } from "next/server";
import { parse } from "csv-parse";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// --- Type Definitions ---
interface Trade {
  "Activity Date": string;
  "Trans Code": string;
  Description: string;
  Quantity: number;
  Price: number;
  Amount: number;
  Instrument: string;
}

interface CompletedTrade {
  symbol: string | null;
  open_date: Date;
  close_date: Date;
  strike_price: number | null;
  expiration_date: string | null;
  quantity: number;
  buy_price: number;
  sell_price: number;
  holding_period: number;
  type: string;
  pnl: number;
  status: "Win" | "Loss" | "Breakeven";
  sourceFile?: string; // Track which file contributed this trade
}

interface FileMetadata {
  filename: string;
  originalName: string;
  uploadedAt: string;
  checksum: string;
  dateRange: { start: string; end: string };
  status: "pending" | "processed" | "error";
  tradeCount?: number;
  recordCount?: number;
  lastProcessed?: string;
  errorMessage?: string;
}

// --- Data Cleaning and Processing Functions ---

function cleanAmount(amount: string | number): number {
  if (typeof amount === "number") return amount;
  if (typeof amount === "string") {
    const cleaned = amount
      .replace(/\$/, "")
      .replace(/\(/, "-")
      .replace(/\)/, "")
      .replace(/,/g, "");
    return parseFloat(cleaned) || 0.0;
  }
  return 0.0;
}

function parseOptionDescription(
  description: string
): [string | null, string | null, string | null, number | null] {
  if (typeof description !== "string") {
    return [null, null, null, null];
  }
  const match = description.match(
    /([\w\.]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(Call|Put)\s+\$([\d\.]+)/
  );
  if (match) {
    const [, ticker, expirationDate, optionType, strikePrice] = match;
    return [ticker, expirationDate, optionType, parseFloat(strikePrice)];
  }
  return [null, null, null, null];
}

// Create unique fingerprint for a trade record to detect duplicates
// We need to be careful: what looks like a duplicate might be a separate trade
// Strategy: Only mark as duplicate if it's from overlapping date ranges in different files
function createTradeFingerprint(
  row: Trade,
  filename?: string,
  rowIndex?: number
): string {
  // Include more identifying information to reduce false positives:
  // - Instrument (stock symbol) - distinguishes different stocks with same price
  // - All fields - exact match is required
  // - File source (optional) - helps track origin
  // - Row index (optional) - helps identify exact same row
  
  // Create a comprehensive key with all identifying characteristics
  const key = [
    row["Activity Date"],
    row["Trans Code"],
    row.Description || "",
    row.Instrument || "",
    String(row.Quantity),
    String(row.Price),
    String(row.Amount),
    filename || "", // Include source file if available
    rowIndex !== undefined ? String(rowIndex) : "",
  ].join("|");
  
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Better duplicate detection: Only mark as duplicate if:
// 1. Exact same record from different files with overlapping dates
// 2. OR same file checksum (already handled at file level)
interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason: "exact_match" | "overlapping_files" | "same_file" | "legitimate_trade";
  matchedFile?: string;
}

function processTrades(df: Trade[], sourceFile?: string): CompletedTrade[] {
  // --- Initial Data Cleaning ---
  df.forEach((row) => {
    row.Amount = cleanAmount(row.Amount);
    row.Price = cleanAmount(row.Price);
    row.Quantity = Number(row.Quantity) || 0;
  });

  const tradeRelatedCodes = ["BTO", "STC", "Buy", "Sell", "OEXP"];
  df = df.filter((row) => tradeRelatedCodes.includes(row["Trans Code"]));

  // --- Options Processing ---
  const optionsDf = df.filter((row) =>
    ["BTO", "STC", "OEXP"].includes(row["Trans Code"])
  );
  const completedOptions: CompletedTrade[] = [];
  const openOptions: { [key: string]: any[] } = {};

  const transCodeOrder = { BTO: 1, STC: 2, OEXP: 3 };
  optionsDf.sort((a, b) => {
    const dateA = new Date(a["Activity Date"]).getTime();
    const dateB = new Date(b["Activity Date"]).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return (
      (transCodeOrder[a["Trans Code"] as keyof typeof transCodeOrder] || 99) -
      (transCodeOrder[b["Trans Code"] as keyof typeof transCodeOrder] || 99)
    );
  });

  optionsDf.forEach((row) => {
    const [optionTicker, , optionType] = parseOptionDescription(
      row.Description
    );
    const key = row.Description;

    if (row["Trans Code"] === "BTO") {
      if (!openOptions[key]) {
        openOptions[key] = [];
      }
      openOptions[key].push({
        quantity: row.Quantity,
        price: row.Price,
        amount: row.Amount,
        date: new Date(row["Activity Date"]),
        ticker: optionTicker,
        type: optionType,
      });
    } else if (row["Trans Code"] === "STC" || row["Trans Code"] === "OEXP") {
      let sellQtyRemaining = row.Quantity;
      const sellAmount = row.Amount;
      const sellPrice = row.Price;
      const sellDate = new Date(row["Activity Date"]);

      while (
        sellQtyRemaining > 0 &&
        openOptions[key] &&
        openOptions[key].length > 0
      ) {
        const openPos = openOptions[key][0];
        const qtyToSell = Math.min(sellQtyRemaining, openPos.quantity);

        const costBasisPerContract =
          openPos.quantity !== 0 ? openPos.amount / openPos.quantity : 0;
        const costBasisForLot = costBasisPerContract * qtyToSell;

        const proceedsPerContract =
          row.Quantity !== 0 ? sellAmount / row.Quantity : 0;
        const proceedsForLot = proceedsPerContract * qtyToSell;

        const pnlForThisLot = proceedsForLot + costBasisForLot;

        let status: "Win" | "Loss" | "Breakeven" = "Breakeven";
        if (pnlForThisLot > 0) status = "Win";
        else if (pnlForThisLot < 0) status = "Loss";

        const [, expirationDate, , strikePrice] = parseOptionDescription(
          row.Description
        );

        completedOptions.push({
          symbol: openPos.ticker,
          open_date: openPos.date,
          close_date: sellDate,
          strike_price: strikePrice,
          expiration_date: expirationDate,
          quantity: qtyToSell,
          buy_price: openPos.price,
          sell_price: row["Trans Code"] === "STC" ? sellPrice : 0,
          holding_period: Math.round(
            (sellDate.getTime() - openPos.date.getTime()) /
              (1000 * 60 * 60 * 24)
          ),
          type: `${openPos.type} Option`,
          pnl: pnlForThisLot,
          status: status,
          sourceFile: sourceFile,
        });

        openPos.quantity -= qtyToSell;
        openPos.amount -= costBasisForLot;
        sellQtyRemaining -= qtyToSell;

        if (openPos.quantity < 1e-9) {
          openOptions[key].shift();
        }
      }
    }
  });

  // --- Stock Processing (FIFO) ---
  const stocksDf = df.filter((row) =>
    ["Buy", "Sell"].includes(row["Trans Code"])
  );
  const completedStocks: CompletedTrade[] = [];
  const openStocks: { [key: string]: any[] } = {};

  const stockTransCodeOrder = { Buy: 1, Sell: 2 };
  stocksDf.sort((a, b) => {
    const dateA = new Date(a["Activity Date"]).getTime();
    const dateB = new Date(b["Activity Date"]).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return (
      (stockTransCodeOrder[
        a["Trans Code"] as keyof typeof stockTransCodeOrder
      ] || 99) -
      (stockTransCodeOrder[
        b["Trans Code"] as keyof typeof stockTransCodeOrder
      ] || 99)
    );
  });

  stocksDf.forEach((row) => {
    const symbol = row.Instrument;
    if (row["Trans Code"] === "Buy") {
      if (!openStocks[symbol]) {
        openStocks[symbol] = [];
      }
      openStocks[symbol].push({
        quantity: row.Quantity,
        price: row.Price,
        amount: row.Amount,
        date: new Date(row["Activity Date"]),
      });
    } else if (row["Trans Code"] === "Sell") {
      let sellQtyRemaining = row.Quantity;
      const sellAmount = row.Amount;
      const sellPrice = row.Price;
      const sellDate = new Date(row["Activity Date"]);

      while (
        sellQtyRemaining > 0 &&
        openStocks[symbol] &&
        openStocks[symbol].length > 0
      ) {
        const buyPos = openStocks[symbol][0];
        const qtyToSell = Math.min(sellQtyRemaining, buyPos.quantity);

        const costBasisPerShare = buyPos.amount / buyPos.quantity;
        const costBasisForLot = costBasisPerShare * qtyToSell;

        const proceedsPerShare = sellAmount / row.Quantity;
        const proceedsForLot = proceedsPerShare * qtyToSell;

        const pnlForThisLot = proceedsForLot + costBasisForLot;

        let status: "Win" | "Loss" | "Breakeven" = "Breakeven";
        if (pnlForThisLot > 0) status = "Win";
        else if (pnlForThisLot < 0) status = "Loss";

        completedStocks.push({
          symbol: symbol,
          open_date: buyPos.date,
          close_date: sellDate,
          strike_price: null,
          expiration_date: null,
          quantity: qtyToSell,
          buy_price: buyPos.price,
          sell_price: sellPrice,
          holding_period: Math.round(
            (sellDate.getTime() - buyPos.date.getTime()) / (1000 * 60 * 60 * 24)
          ),
          type: "Stock",
          pnl: pnlForThisLot,
          status: status,
          sourceFile: sourceFile,
        });

        buyPos.quantity -= qtyToSell;
        buyPos.amount -= costBasisForLot;
        sellQtyRemaining -= qtyToSell;

        if (buyPos.quantity < 1e-9) {
          openStocks[symbol].shift();
        }
      }
    }
  });

  return [...completedOptions, ...completedStocks];
}

async function loadMetadata(): Promise<Record<string, FileMetadata>> {
  const metadataPath = path.join(process.cwd(), "trades_data", ".metadata.json");
  try {
    const content = await fs.readFile(metadataPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveMetadata(metadata: Record<string, FileMetadata>): Promise<void> {
  const metadataPath = path.join(process.cwd(), "trades_data", ".metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}

interface DuplicateDetail {
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
}

interface ProcessingStats {
  totalRawRecords: number;
  uniqueRecords: number;
  duplicateRecords: number;
  recordsByFile: Record<string, { total: number; unique: number; duplicates: number; legitimateRepeats: number }>;
  processedTrades: number;
  tradesByType: Record<string, number>;
  tradesByStatus: { wins: number; losses: number; breakevens: number };
  dateRange: { start: string | null; end: string | null };
  totalPnL: number;
  processingWarnings: string[];
  processingErrors: string[];
  duplicateDetails: DuplicateDetail[]; // Detailed duplicate information
}

export async function loadAndProcessData(): Promise<{
  trades: CompletedTrade[];
  metadata: FileMetadata[];
  stats: ProcessingStats;
}> {
  const dirPath = path.join(process.cwd(), "trades_data");
  
  // Ensure directory exists
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }

  const files = await fs.readdir(dirPath);
  const csvFiles = files.filter((file) => 
    path.extname(file) === ".csv" && !file.startsWith(".")
  );

  // Load metadata
  let fileMetadata = await loadMetadata();
  
  // Enhanced deduplication tracking
  // Track fingerprints with their source files and date ranges
  const fingerprintTracker: Map<
    string,
    {
      filename: string;
      originalName: string;
      dateRange: { start: string; end: string };
      count: number;
      record: Trade;
      occurrences: Array<{
        filename: string;
        originalName: string;
        dateRange: { start: string; end: string };
      }>;
      isDuplicate: boolean;
      reason: string;
    }
  > = new Map();
  
  const allRecords: Trade[] = [];
  const updatedMetadata: Record<string, FileMetadata> = {};
  const recordsByFile: Record<string, { total: number; unique: number; duplicates: number; legitimateRepeats: number }> = {};
  const processingWarnings: string[] = [];
  const processingErrors: string[] = [];
  
  // Track date ranges for each file for overlap detection
  const fileDateRanges: Record<string, { start: string; end: string }> = {};

  // Sort files by modification date (newest first) - newer files override older ones
  const filesWithStats = await Promise.all(
    csvFiles.map(async (filename) => {
      const filePath = path.join(dirPath, filename);
      const stats = await fs.stat(filePath);
      return { filename, mtime: stats.mtime };
    })
  );

  filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // Process each file
  for (const { filename } of filesWithStats) {
    const filePath = path.join(dirPath, filename);
    
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      
      // Calculate file checksum
      const fileChecksum = crypto
        .createHash("sha256")
        .update(fileContent)
        .digest("hex");

      // Check if file was already processed and hasn't changed
      const existingMetadata = fileMetadata[filename];
      if (existingMetadata?.checksum === fileChecksum && existingMetadata?.status === "processed") {
        // File unchanged, use cached data or skip if we need to reprocess
        // For now, we'll reprocess to get deduplication working correctly
        // In production, you might want to cache processed trades
      }

      const lines = fileContent.trim().split("\n");
      const contentWithoutFooter = lines.slice(0, -2).join("\n");

      const records: Trade[] = await new Promise((resolve, reject) => {
        parse(
          contentWithoutFooter,
          {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          },
          (err, records: Trade[]) => {
            if (err) return reject(err);
            resolve(records);
          }
        );
      });

      // Calculate date range for this file (for overlap detection)
      const dateValues = records
        .map((r) => {
          const date = new Date(r["Activity Date"]);
          return isNaN(date.getTime()) ? null : date.getTime();
        })
        .filter((d): d is number => d !== null);

      if (dateValues.length > 0) {
        const fileDateRange = {
          start: new Date(Math.min(...dateValues)).toISOString(),
          end: new Date(Math.max(...dateValues)).toISOString(),
        };
        fileDateRanges[filename] = fileDateRange;
      }

      // Enhanced deduplication: Track by fingerprint AND file context
      let newRecordsCount = 0;
      let duplicateCount = 0;
      let legitimateRepeats = 0; // Same trade pattern but from same file (legitimate)

      records.forEach((record, rowIndex) => {
        // Create fingerprint without file info first (for cross-file comparison)
        const baseFingerprint = createTradeFingerprint(record);
        // Create fingerprint with file info (for tracking)
        const fileFingerprint = createTradeFingerprint(record, filename, rowIndex);
        
        // Check if we've seen this exact fingerprint before
        const existing = fingerprintTracker.get(baseFingerprint);
        
        const currentDateRange = fileDateRanges[filename] || { start: "", end: "" };
        const currentFileMeta = updatedMetadata[filename] || {
          filename,
          originalName: filename,
          uploadedAt: new Date().toISOString(),
          checksum: "",
          dateRange: currentDateRange,
          status: "processed" as const,
        };

        if (!existing) {
          // First time seeing this fingerprint
          fingerprintTracker.set(baseFingerprint, {
            filename,
            originalName: currentFileMeta.originalName || filename,
            dateRange: currentDateRange,
            count: 1,
            record,
            occurrences: [{
              filename,
              originalName: currentFileMeta.originalName || filename,
              dateRange: currentDateRange,
            }],
            isDuplicate: false,
            reason: "unique",
          });
          allRecords.push(record);
          newRecordsCount++;
        } else {
          // We've seen this fingerprint before - track the occurrence
          existing.occurrences.push({
            filename,
            originalName: currentFileMeta.originalName || filename,
            dateRange: currentDateRange,
          });
          existing.count++;

          // We've seen this fingerprint before - is it a duplicate or legitimate?
          const existingDateRange = existing.dateRange;
          
          // Check if date ranges overlap (indicates same transaction in multiple exports)
          const datesOverlap =
            existingDateRange.start <= currentDateRange.end &&
            existingDateRange.end >= currentDateRange.start;

          // Check if it's from the same file (could be legitimate repeat in same export)
          const isSameFile = existing.filename === filename;

          if (isSameFile) {
            // Same file - could be legitimate repeat (e.g., buying same stock multiple times same day)
            // But if it's the EXACT same row, it's likely a CSV parsing issue
            // For now, we'll include it but track as "legitimate repeat"
            legitimateRepeats++;
            existing.isDuplicate = false;
            existing.reason = "legitimate_repeat_same_file";
            allRecords.push(record);
            newRecordsCount++; // Include it
          } else if (datesOverlap) {
            // Different files with overlapping dates - likely same transaction exported twice
            // This is a TRUE duplicate
            duplicateCount++;
            existing.isDuplicate = true;
            existing.reason = "duplicate_overlapping_dates";
            // Don't add to allRecords - it's a duplicate
          } else {
            // Different files, non-overlapping dates - likely legitimate separate trades
            // (e.g., bought same stock at same price on different days)
            // Include it - it's a legitimate trade
            legitimateRepeats++;
            existing.isDuplicate = false;
            existing.reason = "legitimate_separate_trade";
            allRecords.push(record);
            newRecordsCount++;
          }
        }
      });

      // Track records per file
      recordsByFile[filename] = {
        total: records.length,
        unique: newRecordsCount,
        duplicates: duplicateCount,
        legitimateRepeats: legitimateRepeats,
      };

      // Warn about high duplicate rate (cross-file duplicates)
      if (duplicateCount > 0 && records.length > 10) {
        const duplicateRate = (duplicateCount / records.length) * 100;
        if (duplicateRate > 20) {
          processingWarnings.push(
            `File "${filename}" has ${duplicateRate.toFixed(1)}% duplicate records (${duplicateCount} duplicates) from overlapping date ranges with other files. This is normal if you uploaded overlapping export periods.`
          );
        }
      }

      // Inform about legitimate repeats (same pattern, different context)
      if (legitimateRepeats > 0 && records.length > 10) {
        // This is informational, not a warning
        console.log(
          `File "${filename}" has ${legitimateRepeats} legitimate repeat trade patterns (same stock/price on same day - these are separate trades)`
        );
      }

      // Date range already calculated above
      if (fileDateRanges[filename]) {
        updatedMetadata[filename] = {
          filename,
          originalName: existingMetadata?.originalName || filename,
          uploadedAt: existingMetadata?.uploadedAt || new Date().toISOString(),
          checksum: fileChecksum,
          dateRange: fileDateRanges[filename],
          status: "processed",
          recordCount: records.length,
          lastProcessed: new Date().toISOString(),
        };
      } else if (dateValues.length === 0) {
        const errorMsg = "No valid dates found in file";
        processingErrors.push(`File "${filename}": ${errorMsg}`);
        updatedMetadata[filename] = {
          ...existingMetadata,
          filename,
          status: "error",
          errorMessage: errorMsg,
          lastProcessed: new Date().toISOString(),
        };
      }
    } catch (error: any) {
      console.error(`Error processing file ${filename}:`, error);
      const errorMsg = error.message || "Unknown error";
      processingErrors.push(`File "${filename}": ${errorMsg}`);
      updatedMetadata[filename] = {
        ...fileMetadata[filename],
        filename,
        status: "error",
        errorMessage: errorMsg,
        lastProcessed: new Date().toISOString(),
      };
    }
  }

  // Save updated metadata
  await saveMetadata(updatedMetadata);

  // Process all records together (FIFO logic needs all records)
  const processedTrades = processTrades(allRecords);
  
  // Calculate statistics
  const tradesByType: Record<string, number> = {};
  const tradesByStatus = { wins: 0, losses: 0, breakevens: 0 };
  let totalPnL = 0;
  const tradeDates: number[] = [];

  processedTrades.forEach((trade) => {
    // Count by type
    tradesByType[trade.type] = (tradesByType[trade.type] || 0) + 1;
    
    // Count by status
    if (trade.status === "Win") tradesByStatus.wins++;
    else if (trade.status === "Loss") tradesByStatus.losses++;
    else tradesByStatus.breakevens++;

    totalPnL += trade.pnl;
    
    // Collect dates for range
    const closeDate = new Date(trade.close_date).getTime();
    if (!isNaN(closeDate)) tradeDates.push(closeDate);
  });

  // Validation checks
  const totalUniqueRecords = fingerprintTracker.size;
  const totalDuplicateRecords = Object.values(recordsByFile).reduce(
    (sum, file) => sum + file.duplicates,
    0
  );

  // Build detailed duplicate information
  const duplicateDetails: DuplicateDetail[] = Array.from(fingerprintTracker.entries())
    .filter(([_, info]) => info.isDuplicate || info.count > 1)
    .map(([fingerprint, info]) => ({
      fingerprint,
      record: {
        date: info.record["Activity Date"],
        transCode: info.record["Trans Code"],
        description: info.record.Description || "",
        instrument: info.record.Instrument || "",
        quantity: info.record.Quantity,
        price: info.record.Price,
        amount: info.record.Amount,
      },
      occurrences: info.occurrences,
      isDuplicate: info.isDuplicate,
      reason: info.reason,
    }))
    .sort((a, b) => {
      // Sort duplicates first, then by count
      if (a.isDuplicate !== b.isDuplicate) {
        return a.isDuplicate ? -1 : 1;
      }
      return b.occurrences.length - a.occurrences.length;
    });

  // Check for data integrity issues
  if (processedTrades.length === 0 && allRecords.length > 0) {
    processingWarnings.push(
      "No completed trades found. Check if buy/sell pairs are properly matched."
    );
  }

  // Check for orphaned positions (buys without sells)
  // This would require tracking open positions, but we can estimate
  const buyRecords = allRecords.filter((r) => r["Trans Code"] === "Buy" || r["Trans Code"] === "BTO").length;
  const sellRecords = allRecords.filter((r) => r["Trans Code"] === "Sell" || r["Trans Code"] === "STC" || r["Trans Code"] === "OEXP").length;
  
  if (Math.abs(buyRecords - sellRecords) > buyRecords * 0.1 && buyRecords > 10) {
    processingWarnings.push(
      `Significant imbalance between buy records (${buyRecords}) and sell records (${sellRecords}). Some positions may be open.`
    );
  }

  return {
    trades: processedTrades,
    metadata: Object.values(updatedMetadata),
    stats: {
      totalRawRecords: allRecords.length + totalDuplicateRecords,
      uniqueRecords: totalUniqueRecords,
      duplicateRecords: totalDuplicateRecords,
      recordsByFile,
      processedTrades: processedTrades.length,
      tradesByType,
      tradesByStatus,
      dateRange: tradeDates.length > 0 ? {
        start: new Date(Math.min(...tradeDates)).toISOString(),
        end: new Date(Math.max(...tradeDates)).toISOString(),
      } : { start: null, end: null },
      totalPnL,
      processingWarnings,
      processingErrors,
      duplicateDetails, // Include detailed duplicate information
    },
  };
}

export async function GET() {
  try {
    const { trades, metadata, stats } = await loadAndProcessData();
    
    // Return trades with metadata and statistics
    return NextResponse.json({
      trades,
      metadata: {
        fileCount: metadata.length,
        files: metadata,
        totalRecords: trades.length,
      },
      stats,
    });
  } catch (error) {
    console.error("Error processing trade data:", error);
    return NextResponse.json(
      { message: "Error processing trade data", error: String(error) },
      { status: 500 }
    );
  }
}
