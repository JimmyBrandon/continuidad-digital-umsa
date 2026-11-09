from flask import Flask, jsonify, render_template, request

from model import SCENARIOS, VARIABLES, load_budget_reference, solve_model

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/metadata")
def metadata():
    scenarios = {
        key: {name: value for name, value in scenario.items() if name != "target"}
        for key, scenario in SCENARIOS.items()
    }
    return jsonify({"variables": VARIABLES, "scenarios": scenarios, "budget_reference": load_budget_reference()})


@app.post("/api/solve")
def solve_endpoint():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Envía los datos del sistema como un objeto JSON."}), 400
    try:
        return jsonify(solve_model(payload))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (OverflowError, ZeroDivisionError):
        return jsonify({"error": "El cálculo encontró valores fuera del rango numérico. Ajusta la escala de A y b."}), 400


if __name__ == "__main__":
    app.run(debug=True)