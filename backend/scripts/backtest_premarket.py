#!/usr/bin/env python
"""Baseline backtest for ICT pre-market trade plans."""
import asyncio
import io
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Dict, List, Optional, Tuple

import httpx
import pandas as pd
import pytz

from app.core.database import AsyncSessionLocal
from app.services.ict.pre_market_routine import PreMarketRoutineService
from app.utils.data_fetcher import fetch_ohlcv

NY_TZ = pytz.timezone('America/New_York')


@dataclass
class TradeResult:
    trade_date: date
    pass_name: str
    direction: str
    outcome: str
    r_multiple: Optional[float]
    entry_time: Optional[datetime]
    exit_time: Optional[datetime]
    entry_price: Optional[float]
    exit_price: Optional[float]
    entry_zone_low: Optional[float]
    entry_zone_high: Optional[float]
    stop_loss: Optional[float]
    targets: List[float]
    target_hit: Optional[float]
    day_type: str


async def load_intraday(symbol: str, trade_date: date, timeframe: str = "1m") -> Optional[pd.DataFrame]:
    df = await fetch_ohlcv(symbol, timeframe=timeframe, limit=800)
    prepared = prepare_intraday_df(df, trade_date)
    if prepared is not None:
        return prepared
    df_ext = await fetch_intraday_extended(symbol, timeframe, trade_date)
    if df_ext is None:
        return None
    return prepare_intraday_df(df_ext, trade_date)


def prepare_intraday_df(df: Optional[pd.DataFrame], trade_date: date) -> Optional[pd.DataFrame]:
    if df is None or df.empty:
        return None
    df = df.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    if df['timestamp'].dt.tz is None:
        df['timestamp'] = df['timestamp'].dt.tz_localize('America/New_York')
    else:
        df['timestamp'] = df['timestamp'].dt.tz_convert(NY_TZ)
    df = df[df['timestamp'].dt.date == trade_date]
    return df if not df.empty else None


def get_slice_for_date(trade_date: date) -> Optional[str]:
    today = datetime.now(NY_TZ).date().replace(day=1)
    trade_month = trade_date.replace(day=1)
    diff_months = (today.year - trade_month.year) * 12 + (today.month - trade_month.month)
    if diff_months < 0 or diff_months >= 24:
        return None
    if diff_months < 12:
        return f"year1month{diff_months + 1}"
    return f"year2month{diff_months - 12 + 1}"


async def fetch_intraday_extended(symbol: str, timeframe: str, trade_date: date) -> Optional[pd.DataFrame]:
    api_key = os.environ.get('ALPHA_VANTAGE_API_KEY')
    if not api_key:
        print('  ⚠️ Missing ALPHA_VANTAGE_API_KEY for extended data')
        return None
    slice_name = get_slice_for_date(trade_date)
    if not slice_name:
        print(f'  ⚠️ Trade date {trade_date} outside Alpha Vantage extended window')
        return None
    interval_map = {'1m': '1min', '5m': '5min', '15m': '15min'}
    interval = interval_map.get(timeframe)
    if not interval:
        print(f'  ⚠️ Unsupported timeframe {timeframe} for extended data')
        return None
    params = {
        'function': 'TIME_SERIES_INTRADAY_EXTENDED',
        'symbol': symbol,
        'interval': interval,
        'slice': slice_name,
        'adjusted': 'false',
        'apikey': api_key,
        'datatype': 'csv'
    }
    url = 'https://www.alphavantage.co/query'
    print(f'  ↪ Fetching extended data slice {slice_name} for {trade_date}')
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
        text = resp.text
        if text.strip().startswith('{') and 'error' in text.lower():
            print(f'  ⚠️ Extended API error: {text[:120]}')
            return None
        df = pd.read_csv(io.StringIO(text))
        if 'time' not in df.columns:
            print(f'  ⚠️ Unexpected CSV columns: {df.columns.tolist()}')
            return None
        df.rename(columns={'time': 'timestamp'}, inplace=True)
        return df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
    except Exception as exc:
        print(f'  ⚠️ Failed to fetch extended data: {exc}')
        return None


def parse_time_window(window: str, trade_date: date) -> Tuple[datetime, datetime]:
    window = window.replace(' NY', '')
    start_str, end_str = window.split('-')
    start_time = datetime.combine(trade_date, datetime.strptime(start_str, "%H:%M").time())
    end_time = datetime.combine(trade_date, datetime.strptime(end_str, "%H:%M").time())
    return NY_TZ.localize(start_time), NY_TZ.localize(end_time)


def outcome_result(
    trade_date: date,
    direction: str,
    outcome: str,
    r_multiple: Optional[float],
    entry_time: Optional[datetime],
    exit_time: Optional[datetime],
    entry_price: Optional[float],
    exit_price: Optional[float],
    entry_zone_low: Optional[float],
    entry_zone_high: Optional[float],
    stop_loss: Optional[float],
    targets: List[float],
    target_hit: Optional[float]
) -> TradeResult:
    return TradeResult(
        trade_date=trade_date,
        pass_name='',
        direction=direction,
        outcome=outcome,
        r_multiple=r_multiple,
        entry_time=entry_time,
        exit_time=exit_time,
        entry_price=entry_price,
        exit_price=exit_price,
        entry_zone_low=entry_zone_low,
        entry_zone_high=entry_zone_high,
        stop_loss=stop_loss,
        targets=targets,
        target_hit=target_hit,
        day_type=''
    )


def simulate_scenario(
    df: pd.DataFrame,
    scenario: Dict[str, any],
    direction: str,
    trade_date: date
) -> TradeResult:
    window = scenario.get('valid_time_window', '08:30-11:00 NY')
    start_dt, end_dt = parse_time_window(window, trade_date)
    window_df = df[(df['timestamp'] >= start_dt) & (df['timestamp'] <= end_dt)]
    outcome = 'no_entry'
    entry_time = None
    exit_time = None
    r_multiple: Optional[float] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    target_hit: Optional[float] = None

    if window_df.empty:
        return outcome_result(trade_date, direction, outcome, r_multiple, entry_time, exit_time,
                               entry_price, exit_price, entry_low, entry_high, stop_loss, targets, target_hit)

    entry_zone = scenario['entry_zone']
    entry_low = float(entry_zone['low'])
    entry_high = float(entry_zone['high'])
    stop_loss = float(scenario['stop_loss'])
    targets = [float(t) for t in scenario.get('targets', [])]
    entry_price = entry_low if direction == 'long' else entry_high
    risk = abs(entry_price - stop_loss)
    if risk == 0:
        return outcome_result(trade_date, direction, 'invalid', None, None, None,
                               entry_price, exit_price, entry_low, entry_high, stop_loss, targets, target_hit)

    for _, row in window_df.iterrows():
        high = row['high']
        low = row['low']
        if direction == 'long':
            hit_zone = low <= entry_high and high >= entry_low
        else:
            hit_zone = high >= entry_low and low <= entry_high
        if not hit_zone:
            continue
        entry_time = row['timestamp']

        triggered_df = window_df[window_df['timestamp'] >= entry_time]
        for _, trg in triggered_df.iterrows():
            c_high = trg['high']
            c_low = trg['low']
            ts = trg['timestamp']
            if direction == 'long' and c_low <= stop_loss:
                outcome = 'stopped'
                exit_time = ts
                r_multiple = -1.0
                exit_price = stop_loss
                return outcome_result(trade_date, direction, outcome, r_multiple, entry_time, exit_time,
                                       entry_price, exit_price, entry_low, entry_high, stop_loss, targets, target_hit)
            if direction == 'short' and c_high >= stop_loss:
                outcome = 'stopped'
                exit_time = ts
                r_multiple = -1.0
                exit_price = stop_loss
                return outcome_result(trade_date, direction, outcome, r_multiple, entry_time, exit_time,
                                       entry_price, exit_price, entry_low, entry_high, stop_loss, targets, target_hit)

            target_hit = None
            if direction == 'long':
                for target in targets:
                    if c_high >= target:
                        target_hit = target
                        break
            else:
                for target in targets:
                    if c_low <= target:
                        target_hit = target
                        break
            if target_hit is not None:
                outcome = 'target'
                exit_time = ts
                gain = (target_hit - entry_price) if direction == 'long' else (entry_price - target_hit)
                r_multiple = gain / risk
                exit_price = target_hit
                return outcome_result(trade_date, direction, outcome, r_multiple, entry_time, exit_time,
                                       entry_price, exit_price, entry_low, entry_high, stop_loss, targets, target_hit)
        break

    return outcome_result(trade_date, direction, outcome, r_multiple, entry_time, exit_time,
                           entry_price, exit_price, entry_low, entry_high, stop_loss, targets, target_hit)


def annotate_result(result: TradeResult, pass_name: str, day_type: str) -> TradeResult:
    result.pass_name = pass_name
    result.day_type = day_type
    return result


async def backtest(symbol: str, start: date, end: date) -> List[TradeResult]:
    results: List[TradeResult] = []
    async with AsyncSessionLocal() as db:
        service = PreMarketRoutineService(db)
        current = start
        while current <= end:
            if current.weekday() >= 5:
                current += timedelta(days=1)
                continue
            price_df = await load_intraday(symbol, current)
            if price_df is None:
                print(f"{current}: skipping (no intraday data)")
                current += timedelta(days=1)
                continue
            print(f"Processing {current} ...")
            for pass_name, cutoff in [("prelim", time(6, 30)), ("final", time(8, 15))]:
                cutoff_dt = NY_TZ.localize(datetime.combine(current, cutoff))
                try:
                    report = await service.run_routine(
                        symbol=symbol,
                        target_date=current,
                        cutoff_ny=cutoff_dt,
                        persist=False
                    )
                except Exception as exc:
                    print(f"  {pass_name}: failed to generate report ({exc})")
                    continue
                day_type = report.get('day_type', 'unknown')
                for direction, key in [('long', 'long_scenario'), ('short', 'short_scenario')]:
                    scenario = report.get(key)
                    if not scenario:
                        continue
                    trade_result = simulate_scenario(price_df, scenario, direction, current)
                    trade_result = annotate_result(trade_result, pass_name, day_type)
                    results.append(trade_result)
            current += timedelta(days=1)
    return results


def summarize(results: List[TradeResult]) -> None:
    filled = [r for r in results if r.outcome in {'target', 'stopped'}]
    if not filled:
        print("No filled trades")
        return
    total = len(filled)
    wins = [r for r in filled if r.outcome == 'target']
    avg_r = sum(r.r_multiple for r in wins if r.r_multiple is not None) / len(wins) if wins else 0.0
    print(f"Total trades: {total}")
    print(f"Win rate: {len(wins)/total:.1%}")
    print(f"Average R on winners: {avg_r:.2f}")
    by_pass: Dict[str, List[TradeResult]] = {}
    for r in filled:
        by_pass.setdefault(r.pass_name, []).append(r)
    for pass_name, group in by_pass.items():
        wins = [r for r in group if r.outcome == 'target']
        win_rate = len(wins)/len(group) if group else 0
        print(f"  {pass_name}: {len(group)} trades, win {win_rate:.1%}")

    print("\nDetailed trades:")
    for r in filled:
        entry_time = r.entry_time.strftime('%H:%M:%S') if r.entry_time else '-'
        exit_time = r.exit_time.strftime('%H:%M:%S') if r.exit_time else '-'
        entry_zone = (
            f"{r.entry_zone_low:.2f}-{r.entry_zone_high:.2f}"
            if r.entry_zone_low is not None and r.entry_zone_high is not None
            else '-'
        )
        entry_price = f"{r.entry_price:.2f}" if r.entry_price is not None else '-'
        exit_price = f"{r.exit_price:.2f}" if r.exit_price is not None else '-'
        stop_loss = f"{r.stop_loss:.2f}" if r.stop_loss is not None else '-'
        targets = ','.join(f"{t:.2f}" for t in r.targets) if r.targets else '-'
        r_mult = f"{r.r_multiple:.2f}" if r.r_multiple is not None else '-'
        print(
            f"{r.trade_date} [{r.pass_name}] {r.direction.upper()} {r.outcome.upper()} | "
            f"entry {entry_time} @ {entry_price} zone {entry_zone} stop {stop_loss} | "
            f"exit {exit_time} @ {exit_price} | targets {targets} | R={r_mult} | day={r.day_type}"
        )


def parse_args():
    import argparse
    parser = argparse.ArgumentParser(description="Backtest ICT pre-market plan")
    parser.add_argument('--symbol', default='QQQ')
    parser.add_argument('--start', required=True, help='YYYY-MM-DD')
    parser.add_argument('--end', required=True, help='YYYY-MM-DD')
    return parser.parse_args()


async def main_async():
    args = parse_args()
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    results = await backtest(args.symbol, start, end)
    summarize(results)


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
