# Continuidad Digital UMSA

Simulador académico para el trabajo de Métodos Numéricos sobre la asignación financiera de recursos para sostener servicios tecnológicos universitarios. La aplicación compara Cholesky, Gradientes Conjugados (GC) y Gradientes Conjugados Precondicionados (GCP).

## Arquitectura del proyecto

```text
continuidad-digital-umsa/
├── app.py                         # Aplicación Flask y rutas web/API
├── model.py                       # Escenarios, validación y métodos numéricos
├── wsgi.py                        # Punto de entrada WSGI
├── INICIAR.bat                    # Inicio local sencillo en Windows
├── requirements.txt               # Dependencias Python
├── data/
│   └── umsa_budget_reference.csv  # Serie presupuestaria pública de referencia
├── deploy/
│   └── pythonanywhere_wsgi.py     # Plantilla WSGI de despliegue
├── static/
│   ├── app.js                     # Interacción, tablas y gráficos
│   └── style.css                  # Diseño responsive
├── templates/
│   └── index.html                 # Interfaz principal
└── README.md
```

`app.py` sirve la página y expone `/api/metadata` y `/api/solve`. `model.py` valida que la matriz sea simétrica y definida positiva, calcula la referencia por Cholesky, ejecuta GC y GCP, y obtiene errores, residuos y números de condición. El navegador envía las entradas al servidor local y actualiza las tablas y gráficos. La aplicación no usa base de datos ni guarda los valores editados.

## Requisitos

- Python 3.10 o superior.
- Conexión a internet durante la instalación para descargar Flask.

## Instalación local

1. Descomprime `Continuidad_Digital_UMSA.zip`.
2. Abre una terminal dentro de la carpeta `continuidad-digital-umsa`, donde están `app.py` y `requirements.txt`.
3. Crea un entorno virtual e instala las dependencias.

### Windows (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Si PowerShell impide activar el entorno, ejecuta primero:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

También puedes hacer doble clic en `INICIAR.bat`. Este crea el entorno virtual, instala Flask y lanza la aplicación.

### macOS o Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

## Ejecución local

Con el entorno virtual activado, inicia el servidor:

```bash
python app.py
```

En macOS o Linux también puedes usar `python3 app.py`. Abre en el navegador:

```text
http://127.0.0.1:5000
```

La dirección funciona en la computadora donde se ejecuta el servidor. Para detenerlo, vuelve a la terminal y presiona `Ctrl+C`.

## Referencia financiera incluida

El archivo CSV contiene los techos presupuestarios indicativos publicados en el Cuadro 21 del Plan Estratégico Institucional UMSA 2021–2025, para 2018–2024. Son cifras institucionales de contexto, no ejecución presupuestaria ni un desglose del gasto del DTIC. Las matrices y metas de los escenarios son supuestos académicos editables.
