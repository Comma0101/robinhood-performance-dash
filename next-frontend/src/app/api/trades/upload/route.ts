import { NextResponse } from "next/server";
import { writeFile, readFile, readdir, stat, unlink, mkdir, access } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import { parse } from "csv-parse";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["text/csv", "application/csv", "text/plain"];

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

const METADATA_FILE = join(process.cwd(), "trades_data", ".metadata.json");
const TRADES_DATA_DIR = join(process.cwd(), "trades_data");

async function loadMetadata(): Promise<Record<string, FileMetadata>> {
  try {
    await access(METADATA_FILE);
    const content = await readFile(METADATA_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveMetadata(metadata: Record<string, FileMetadata>) {
  // Ensure directory exists
  try {
    await mkdir(TRADES_DATA_DIR, { recursive: true });
  } catch {}
  
  await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2), "utf-8");
}

// Helper to parse CSV and extract date range
async function parseCSVAndGetDates(content: string): Promise<{
  records: any[];
  dateRange: { start: string; end: string } | null;
}> {
  const lines = content.trim().split("\n");
  if (lines.length < 2) {
    return { records: [], dateRange: null };
  }

  const contentWithoutFooter = lines.slice(0, -2).join("\n");

  const records: any[] = await new Promise((resolve, reject) => {
    parse(
      contentWithoutFooter,
      {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      },
      (err, records) => {
        if (err) return reject(err);
        resolve(records);
      }
    );
  });

  // Extract dates
  const dateValues = records
    .map((r) => {
      const date = new Date(r["Activity Date"]);
      return isNaN(date.getTime()) ? null : date.getTime();
    })
    .filter((d): d is number => d !== null);

  if (dateValues.length === 0) {
    return { records, dateRange: null };
  }

  return {
    records,
    dateRange: {
      start: new Date(Math.min(...dateValues)).toISOString(),
      end: new Date(Math.max(...dateValues)).toISOString(),
    },
  };
}


// POST: Upload a CSV file
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      !ALLOWED_MIME_TYPES.includes(file.type) &&
      !file.name.endsWith(".csv")
    ) {
      return NextResponse.json(
        { error: "Invalid file type. Only CSV files are allowed." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      );
    }

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = buffer.toString("utf-8");

    // Basic CSV validation - check for Robinhood headers
    const lines = content.trim().split("\n");
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "File appears to be empty or invalid" },
        { status: 400 }
      );
    }

    const headers = lines[0]?.toLowerCase();
    const requiredHeaders = ["activity date", "trans code", "description"];

    if (!requiredHeaders.every((header) => headers?.includes(header))) {
      return NextResponse.json(
        {
          error:
            "Invalid CSV format. File does not appear to be a Robinhood export.",
        },
        { status: 400 }
      );
    }

    // Calculate checksum for duplicate detection
    const checksum = crypto.createHash("sha256").update(content).digest("hex");

    // Check for duplicate content
    const metadata = await loadMetadata();
    const existingFile = Object.values(metadata).find(
      (m) => m.checksum === checksum
    );

    if (existingFile) {
      return NextResponse.json(
        {
          error: "Duplicate file detected",
          message: `This file appears to be identical to "${existingFile.originalName}" uploaded on ${new Date(existingFile.uploadedAt).toLocaleDateString()}`,
        },
        { status: 409 }
      );
    }

    // Parse and validate date range
    let records: any[];
    let dateRange: { start: string; end: string } | null;

    try {
      const parsed = await parseCSVAndGetDates(content);
      records = parsed.records;
      dateRange = parsed.dateRange;
    } catch (error: any) {
      return NextResponse.json(
        { error: "Failed to parse CSV file", details: error.message },
        { status: 400 }
      );
    }

    if (!dateRange) {
      return NextResponse.json(
        { error: "No valid dates found in file" },
        { status: 400 }
      );
    }

    // Check for date range overlap (optional warning)
    const overlappingFiles = Object.values(metadata)
      .filter(
        (m) =>
          m.status === "processed" &&
          m.dateRange &&
          m.dateRange.start <= dateRange.end &&
          m.dateRange.end >= dateRange.start
      )
      .map((m) => m.originalName);

    // Generate safe filename
    const sanitizedFilename = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_");

    const timestamp = Date.now();
    const filename = `${timestamp}_${sanitizedFilename}`;

    // Ensure directory exists
    try {
      await mkdir(TRADES_DATA_DIR, { recursive: true });
    } catch {}

    // Save file
    const filePath = join(TRADES_DATA_DIR, filename);
    await writeFile(filePath, content, "utf-8");

    // Save metadata
    const fileMetadata: FileMetadata = {
      filename,
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
      checksum,
      dateRange,
      status: "pending",
      recordCount: records.length,
    };

    metadata[filename] = fileMetadata;
    await saveMetadata(metadata);

    return NextResponse.json({
      success: true,
      file: fileMetadata,
      warnings:
        overlappingFiles.length > 0
          ? [
              `This file overlaps with ${overlappingFiles.length} existing file(s): ${overlappingFiles.join(", ")}. Duplicate transactions will be automatically deduplicated.`,
            ]
          : [],
    });
  } catch (error: any) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file", details: error.message },
      { status: 500 }
    );
  }
}

// GET: List all uploaded CSV files
export async function GET() {
  try {
    // Ensure directory exists
    try {
      await mkdir(TRADES_DATA_DIR, { recursive: true });
    } catch {}

    const files = await readdir(TRADES_DATA_DIR);
    const csvFiles = files.filter(
      (file) => file.endsWith(".csv") && !file.startsWith(".")
    );

    const metadata = await loadMetadata();

    const fileList = await Promise.all(
      csvFiles.map(async (filename) => {
        const filePath = join(TRADES_DATA_DIR, filename);
        const stats = await stat(filePath);
        const fileMeta = metadata[filename] || {
          filename,
          originalName: filename,
          uploadedAt: stats.birthtime.toISOString(),
          checksum: "",
          dateRange: { start: "", end: "" },
          status: "pending" as const,
        };

        return {
          ...fileMeta,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
    );

    return NextResponse.json({
      files: fileList.sort(
        (a, b) =>
          new Date(b.uploadedAt || b.modifiedAt).getTime() -
          new Date(a.uploadedAt || a.modifiedAt).getTime()
      ),
    });
  } catch (error: any) {
    console.error("Error listing files:", error);
    return NextResponse.json(
      { error: "Failed to list files", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Remove a file
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return NextResponse.json(
        { error: "Filename parameter is required" },
        { status: 400 }
      );
    }

    // Security: ensure filename doesn't contain path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const filePath = join(TRADES_DATA_DIR, filename);

    // Check if file exists
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete file
    await unlink(filePath);

    // Remove from metadata
    const metadata = await loadMetadata();
    if (metadata[filename]) {
      delete metadata[filename];
      await saveMetadata(metadata);
    }

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      { error: "Failed to delete file", details: error.message },
      { status: 500 }
    );
  }
}

