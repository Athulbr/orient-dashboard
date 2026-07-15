import os
from dotenv import load_dotenv

load_dotenv()

RECONCILIATION_API = os.getenv("RECONCILIATION_API")
TRANSACTIONS_DIR = os.getenv("TRANSACTIONS_DIR", "Transactions")

