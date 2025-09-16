from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import re
from collections import deque

app = FastAPI()

# CORS Middleware
origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Cleaning and Processing Functions ---

def clean_amount(amount):
    if isinstance(amount, str):
        amount = amount.replace('$', '').replace('(', '-').replace(')', '').replace(',', '')
    try:
        return float(amount)
    except (ValueError, TypeError):
        return 0.0

def parse_option_description(description):
    if not isinstance(description, str):
        return None, None, None, None
    match = re.search(r'([\w\.]+)\s+(\d{1,2}/\d{1,2}/\d{4})\s+(Call|Put)\s+\$([\d\.]+)', description)
    if match:
        ticker, expiration_date, option_type, strike_price = match.groups()
        return ticker, expiration_date, option_type, float(strike_price)
    return None, None, None, None

def process_trades(df):
    # --- Initial Data Cleaning ---
    df.columns = df.columns.str.strip()
    df['Amount'] = df['Amount'].apply(clean_amount)
    df['Price'] = df['Price'].apply(clean_amount)
    df['Activity Date'] = pd.to_datetime(df['Activity Date'], errors='coerce')
    df['Quantity'] = pd.to_numeric(df['Quantity'], errors='coerce').fillna(0)
    
    # Filter out non-trade activities
    trade_related_codes = ['BTO', 'STC', 'Buy', 'Sell', 'OEXP']
    df = df[df['Trans Code'].isin(trade_related_codes)].copy()

    # --- Options Processing ---
    options_df = df[df['Trans Code'].isin(['BTO', 'STC', 'OEXP'])].copy()
    
    parsed_options = []
    for index, row in options_df.iterrows():
        parsed_data = parse_option_description(row['Description'])
        if parsed_data[0] is None:
            print(f"Warning: Could not parse option description: {row['Description']}")
        parsed_options.append(parsed_data)

    options_df[['Option Ticker', 'Expiration Date', 'Option Type', 'Strike Price']] = pd.DataFrame(parsed_options, index=options_df.index)
    
    completed_options = []
    open_options = {}

    # Sort by date, then by transaction type to handle same-day trades correctly
    options_df['Trans Code'] = pd.Categorical(options_df['Trans Code'], categories=['BTO', 'STC', 'OEXP'], ordered=True)
    for _, row in options_df.sort_values(by=['Activity Date', 'Trans Code']).iterrows():
        key = row['Description']
        if row['Trans Code'] == 'BTO':
            if key not in open_options:
                open_options[key] = deque()
            open_options[key].append({
                'quantity': row['Quantity'],
                'price': row['Price'],
                'amount': row['Amount'],
                'date': row['Activity Date'],
                'ticker': row['Option Ticker'],
                'type': row['Option Type'],
                'strike_price': row['Strike Price']
            })
        elif row['Trans Code'] in ['STC', 'OEXP']:
            sell_qty_remaining = row['Quantity']
            sell_amount = row['Amount']
            sell_price = row['Price']
            sell_date = row['Activity Date']

            while sell_qty_remaining > 0 and key in open_options and open_options[key]:
                open_pos = open_options[key][0]
                
                qty_to_sell = min(sell_qty_remaining, open_pos['quantity'])

                cost_basis_per_contract = open_pos['amount'] / open_pos['quantity'] if open_pos['quantity'] != 0 else 0
                cost_basis_for_lot = cost_basis_per_contract * qty_to_sell

                proceeds_per_contract = sell_amount / row['Quantity'] if row['Quantity'] != 0 else 0
                proceeds_for_lot = proceeds_per_contract * qty_to_sell

                pnl_for_this_lot = proceeds_for_lot + cost_basis_for_lot

                status = 'Breakeven'
                if pnl_for_this_lot > 0:
                    status = 'Win'
                elif pnl_for_this_lot < 0:
                    status = 'Loss'

                completed_options.append({
                    'symbol': open_pos['ticker'],
                    'open_date': open_pos['date'],
                    'close_date': sell_date,
                    'strike_price': open_pos['strike_price'],
                    'quantity': qty_to_sell,
                    'buy_price': open_pos['price'],
                    'sell_price': sell_price if row['Trans Code'] == 'STC' else 0,
                    'holding_period': (sell_date - open_pos['date']).days,
                    'type': f"{open_pos['type']} Option",
                    'pnl': pnl_for_this_lot,
                    'status': status
                })

                open_pos['quantity'] -= qty_to_sell
                open_pos['amount'] -= cost_basis_for_lot
                sell_qty_remaining -= qty_to_sell

                if open_pos['quantity'] < 1e-9:
                    open_options[key].popleft()

    # --- Stock Processing (FIFO) ---
    stocks_df = df[df['Trans Code'].isin(['Buy', 'Sell'])].copy()
    completed_stocks = []
    open_stocks = {}

    # Sort by date, then by transaction type to handle same-day trades correctly
    stocks_df['Trans Code'] = pd.Categorical(stocks_df['Trans Code'], categories=['Buy', 'Sell'], ordered=True)
    for _, row in stocks_df.sort_values(by=['Activity Date', 'Trans Code']).iterrows():
        symbol = row['Instrument']
        if row['Trans Code'] == 'Buy':
            if symbol not in open_stocks:
                open_stocks[symbol] = deque()
            open_stocks[symbol].append({'quantity': row['Quantity'], 'price': row['Price'], 'amount': row['Amount'], 'date': row['Activity Date']})
        elif row['Trans Code'] == 'Sell':
            sell_qty_remaining = row['Quantity']
            sell_price = row['Price']
            sell_amount = row['Amount']
            sell_date = row['Activity Date']
            
            while sell_qty_remaining > 0 and symbol in open_stocks and open_stocks[symbol]:
                buy_pos = open_stocks[symbol][0]
                
                qty_to_sell = min(sell_qty_remaining, buy_pos['quantity'])
                
                # Calculate cost basis for the sold portion
                cost_basis_per_share = buy_pos['amount'] / buy_pos['quantity']
                cost_basis_for_lot = cost_basis_per_share * qty_to_sell

                # Calculate proceeds for the sold portion
                proceeds_per_share = sell_amount / row['Quantity']
                proceeds_for_lot = proceeds_per_share * qty_to_sell

                pnl_for_this_lot = proceeds_for_lot + cost_basis_for_lot
                
                status = 'Breakeven'
                if pnl_for_this_lot > 0:
                    status = 'Win'
                elif pnl_for_this_lot < 0:
                    status = 'Loss'

                completed_stocks.append({
                    'symbol': symbol,
                    'open_date': buy_pos['date'],
                    'close_date': sell_date,
                    'strike_price': None,
                    'quantity': qty_to_sell,
                    'buy_price': buy_pos['price'],
                    'sell_price': sell_price,
                    'holding_period': (sell_date - buy_pos['date']).days,
                    'type': 'Stock',
                    'pnl': pnl_for_this_lot,
                    'status': status
                })

                buy_pos['quantity'] -= qty_to_sell
                buy_pos['amount'] -= cost_basis_for_lot # Adjust remaining amount
                sell_qty_remaining -= qty_to_sell

                if buy_pos['quantity'] < 1e-9: # Use a small threshold for float comparison
                    open_stocks[symbol].popleft()

    return completed_options + completed_stocks

def load_and_process_data():
    df = pd.read_csv('Feb 22, 2017 – Mar 25, 2025.csv', skipfooter=2, engine='python')
    # df = pd.read_csv('test_trades.csv') # Using test data for verification
    return process_trades(df)

# --- API Endpoints ---

@app.get("/api/detailed_trades")
def get_detailed_trades():
    trades = load_and_process_data()
    # Convert Timestamps to strings for JSON serialization
    for trade in trades:
        trade['open_date'] = trade['open_date'].isoformat()
        trade['close_date'] = trade['close_date'].isoformat()
    return trades

@app.get("/api/summary")
def get_summary():
    trades = load_and_process_data()
    
    if not trades:
        return {'total_pl': 0, 'total_trades': 0, 'wins': 0, 'losses': 0, 'win_rate': 'N/A', 'avg_win': 0, 'avg_loss': 0}

    total_pl = sum(t['pnl'] for t in trades)
    wins = sum(1 for t in trades if t['status'] == 'Win')
    losses = sum(1 for t in trades if t['status'] == 'Loss')
    total_win_loss_trades = wins + losses
    win_rate = (wins / total_win_loss_trades * 100) if total_win_loss_trades > 0 else 0
    
    winning_trades = [t['pnl'] for t in trades if t['status'] == 'Win']
    losing_trades = [t['pnl'] for t in trades if t['status'] == 'Loss']
    
    avg_win = sum(winning_trades) / len(winning_trades) if winning_trades else 0
    avg_loss = sum(losing_trades) / len(losing_trades) if losing_trades else 0

    summary = {
        'total_pl': total_pl,
        'total_trades': len(trades),
        'wins': wins,
        'losses': losses,
        'win_rate': f"{win_rate:.2f}%",
        'avg_win': avg_win,
        'avg_loss': avg_loss
    }
    
    return summary
