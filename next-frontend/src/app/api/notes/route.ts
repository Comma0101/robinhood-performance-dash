import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// --- Enhanced Type Definitions for Professional Trading Journal ---
interface TradeNote {
  id: string;
  symbol: string;
  setup: string; // e.g., "Bull Flag", "Support Bounce"
  entry: number;
  exit: number;
  stopLoss?: number;
  takeProfit?: number;
  position: number;
  pnl: number;
  riskRewardRatio?: number;
  executionQuality: "excellent" | "good" | "fair" | "poor"; // How well did I execute?
  notes?: string;
}

interface DayNote {
  dateISO: string;

  // Pre-market preparation
  preMarketPlan?: string;
  marketConditions?: string; // "Trending", "Choppy", "Range-bound"
  keyLevels?: string; // Support/resistance levels to watch
  newsEvents?: string; // Economic data, earnings, etc.

  // Trading performance
  postDaySummary?: string;
  trades?: TradeNote[]; // Individual trade notes

  // Self-assessment
  emotionalState?:
    | "disciplined"
    | "confident"
    | "anxious"
    | "revenge-trading"
    | "fomo"
    | "calm";
  adherenceToRules?: number; // 1-10 scale
  mistakesMade?: string;
  lessonsLearned?: string;

  // Goals and accountability
  dailyGoals?: string;
  goalsAchieved?: boolean;

  // Market analysis
  bestTrade?: string;
  worstTrade?: string;
  whatWorked?: string;
  whatDidntWork?: string;

  // Risk management
  maxDrawdown?: number;
  riskManagement?: string;

  // Metadata
  tags?: string[];
  rating?: number; // 1-5 stars for the day
  lastUpdated: string;
}

interface NotesData {
  [dateISO: string]: DayNote;
}

const NOTES_FILE_PATH = path.join(process.cwd(), "trade_notes", "notes.json");

// --- Helper Functions ---
async function loadNotes(): Promise<NotesData> {
  try {
    const fileContent = await fs.readFile(NOTES_FILE_PATH, "utf-8");
    return JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveNotes(notes: NotesData): Promise<void> {
  await fs.writeFile(NOTES_FILE_PATH, JSON.stringify(notes, null, 2), "utf-8");
}

// --- API Handlers ---

// GET: Fetch all notes or a specific date's note
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    const notes = await loadNotes();

    if (date) {
      const note = notes[date] || null;
      return NextResponse.json(note);
    }

    return NextResponse.json(notes);
  } catch (error) {
    console.error("Error loading notes:", error);
    return NextResponse.json(
      { message: "Error loading notes" },
      { status: 500 }
    );
  }
}

// POST: Create or update a note
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dateISO, ...noteData } = body;

    if (!dateISO) {
      return NextResponse.json(
        { message: "dateISO is required" },
        { status: 400 }
      );
    }

    const notes = await loadNotes();

    // Merge with existing note if it exists
    const existingNote = notes[dateISO] || {};

    notes[dateISO] = {
      ...existingNote,
      dateISO,
      ...noteData,
      lastUpdated: new Date().toISOString(),
    };

    await saveNotes(notes);

    return NextResponse.json({
      message: "Note saved successfully",
      note: notes[dateISO],
    });
  } catch (error) {
    console.error("Error saving note:", error);
    return NextResponse.json({ message: "Error saving note" }, { status: 500 });
  }
}

// DELETE: Delete a note
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { message: "date parameter is required" },
        { status: 400 }
      );
    }

    const notes = await loadNotes();

    if (notes[date]) {
      delete notes[date];
      await saveNotes(notes);
      return NextResponse.json({ message: "Note deleted successfully" });
    }

    return NextResponse.json({ message: "Note not found" }, { status: 404 });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { message: "Error deleting note" },
      { status: 500 }
    );
  }
}
