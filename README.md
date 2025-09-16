# Robinhood Performance Dashboard

This project is a full-stack application designed to analyze and visualize personal trading history from a Robinhood CSV export. It features a FastAPI backend for data processing and a React frontend with D3.js for interactive visualizations.

## Features

-   **Accurate P/L Calculation**: Sophisticated backend logic correctly pairs opening and closing transactions for both stocks (using FIFO) and options to determine the true profit or loss for each trade.
-   **Interactive Frontend**: A clean, user-friendly dashboard built with React to visualize your trading data.
-   **Data Visualization**: Includes a bar chart for P/L per trade and a cumulative P/L line chart to track performance over time, both built with D3.js.
-   **Dynamic Sorting & Filtering**: The detailed trades table can be sorted by any column and filtered by symbol or trade type, with all summary metrics and charts updating in real-time.
-   **Handles Complex Scenarios**: The logic is designed to handle day trades, scaling in and out of positions, and different option contracts for the same underlying asset.

## Tech Stack

-   **Backend**: Python, FastAPI, Pandas
-   **Frontend**: React, D3.js
-   **Package Manager**: npm
-   **Python Environment**: uv (or any other virtual environment manager like venv)

## Setup and Installation

### Prerequisites

-   Python 3.8+
-   Node.js and npm
-   `uv` (or another Python virtual environment tool)

### 1. Clone the Repository

```bash
git clone https://github.com/Comma0101/robinhood-performance-dash.git
cd robinhood-performance-dash
```

### 2. Backend Setup

a. **Create and activate a virtual environment:**

```bash
# Using uv
uv venv
source .venv/bin/activate

# Or using venv
python3 -m venv .venv
source .venv/bin/activate
```

b. **Install Python dependencies:**

```bash
# Using uv
uv pip install -r requirements.txt

# Or using pip
pip install -r requirements.txt
```
*(Note: A `requirements.txt` file will need to be created. I can do this in the next step.)*

c. **Add your data:**
Place your Robinhood CSV export in the root of the project directory and rename it to `Feb 22, 2017 – Mar 25, 2025.csv`, or update the filename in `app.py`.

### 3. Frontend Setup

a. **Navigate to the frontend directory:**

```bash
cd frontend
```

b. **Install Node.js dependencies:**

```bash
npm install
```

## How to Run the Application

You will need to run the backend and frontend servers in two separate terminals.

1.  **Start the FastAPI Backend**:
    From the project's root directory, run:
    ```bash
    uvicorn app:app --reload --reload-dir .
    ```

2.  **Start the React Frontend**:
    From the `frontend` directory, run:
    ```bash
    npm start
    ```

Once both servers are running, you can view the dashboard in your browser at `http://localhost:3000`.
