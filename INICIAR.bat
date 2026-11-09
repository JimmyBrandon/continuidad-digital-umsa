@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv
  if errorlevel 1 goto error
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto error
".venv\Scripts\python.exe" app.py
if errorlevel 1 goto error
exit /b 0
:error
echo No se pudo iniciar la aplicacion. Revisa que Python este instalado y que haya conexion a internet.
pause
exit /b 1