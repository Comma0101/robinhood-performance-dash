import { NextResponse } from "next/server";
import { parse } from "csv-parse";
import fs from "fs/promises";
import path from "path";

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

function processTrades(df: Trade[]): CompletedTrade[] {
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

async function loadAndProcessData(): Promise<CompletedTrade[]> {
  // Go up one level from the 'next-frontend' directory to find the CSV at the project root
  const filePath = path.join(process.cwd(), "..", "trades.csv");
  const fileContent = await fs.readFile(filePath, "utf-8");

  // Skip footer rows manually
  const lines = fileContent.trim().split("\n");
  const contentWithoutFooter = lines.slice(0, -2).join("\n");

  return new Promise((resolve, reject) => {
    parse(
      contentWithoutFooter,
      {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      },
      (err, records: Trade[]) => {
        if (err) {
          return reject(err);
        }
        const processedTrades = processTrades(records);
        resolve(processedTrades);
      }
    );
  });
}

export async function GET() {
  try {
    const trades = await loadAndProcessData();
    return NextResponse.json(trades);
  } catch (error) {
    console.error("Error processing trade data:", error);
    return NextResponse.json(
      { message: "Error processing trade data" },
      { status: 500 }
    );
  }
}
