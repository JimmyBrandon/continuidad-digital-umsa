"""PythonAnywhere WSGI template. Replace USERNAME with the account username."""
import sys

PROJECT_PATH = "/home/USERNAME/continuidad-digital-umsa"
if PROJECT_PATH not in sys.path:
    sys.path.insert(0, PROJECT_PATH)

from app import app as application