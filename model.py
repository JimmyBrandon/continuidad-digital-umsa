"""Academic financial-allocation demo for continuity of university IT services."""

from __future__ import annotations

import csv
import math
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
VARIABLES = [
    "Redundancia de conectividad",
    "Respaldo eléctrico (UPS)",
    "Copias y recuperación",
    "Monitoreo de seguridad",
    "Soporte y continuidad",
]


def build_scenarios() -> dict[str, dict[str, Any]]:
    ideal = [
        [5.0, -0.45, 0.0, 0.0, -0.15],
        [-0.45, 4.2, -0.35, 0.0, 0.0],
        [0.0, -0.35, 4.8, -0.4, 0.0],
        [0.0, 0.0, -0.4, 4.0, -0.3],
        [-0.15, 0.0, 0.0, -0.3, 3.6],
    ]
    stress = [
        [5.8, -0.7, 0.0, 0.0, -0.2],
        [-0.7, 4.9, -0.55, 0.0, 0.0],
        [0.0, -0.55, 5.5, -0.65, 0.0],
        [0.0, 0.0, -0.65, 4.8, -0.5],
        [-0.2, 0.0, 0.0, -0.5, 4.4],
    ]

    # D^(1/2) C D^(1/2), where C has 1 on the diagonal and 0.02
    # elsewhere. This creates a badly scaled SPD example for Jacobi PCG.
    diagonal = [1.0, 25.0, 625.0, 15625.0, 390625.0]
    ill = []
    for i, di in enumerate(diagonal):
        row = []
        for j, dj in enumerate(diagonal):
            row.append(di if i == j else 0.02 * math.sqrt(di * dj))
        ill.append(row)

    targets = {
        "ideal": [28.0, 22.0, 20.0, 16.0, 14.0],
        "stress": [24.0, 19.0, 17.0, 13.0, 11.0],
        "ill": [35.0, 27.0, 22.0, 18.0, 12.0],
    }
    descriptions = {
        "ideal": "Referencia equilibrada con acoplamientos moderados.",
        "stress": "Costos e interdependencias mayores y menor meta de recursos.",
        "ill": "Escalas financieras muy distintas entre componentes; Jacobi compensa el escalamiento.",
    }
    matrices = {"ideal": ideal, "stress": stress, "ill": ill}
    labels = {"ideal": "Ideal", "stress": "Bajo estrés", "ill": "Mal condicionado"}
    result: dict[str, dict[str, Any]] = {}
    for key, matrix in matrices.items():
        b = matvec(matrix, targets[key])
        result[key] = {
            "key": key,
            "label": labels[key],
            "description": descriptions[key],
            "A": matrix,
            "b": b,
            "target": targets[key],
        }
    return result


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def norm(a: list[float]) -> float:
    return math.sqrt(max(0.0, dot(a, a)))


def matvec(a: list[list[float]], x: list[float]) -> list[float]:
    return [dot(row, x) for row in a]


def cholesky(a: list[list[float]]) -> list[list[float]]:
    n = len(a)
    lower = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            value = a[i][j] - sum(lower[i][k] * lower[j][k] for k in range(j))
            if i == j:
                if value <= 1e-13 * max(1.0, abs(a[i][i])):
                    raise ValueError("La matriz no es definida positiva.")
                lower[i][j] = math.sqrt(value)
            else:
                lower[i][j] = value / lower[j][j]
    return lower


def solve_cholesky(lower: list[list[float]], b: list[float]) -> list[float]:
    n = len(b)
    y = [0.0] * n
    for i in range(n):
        y[i] = (b[i] - sum(lower[i][j] * y[j] for j in range(i))) / lower[i][i]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (y[i] - sum(lower[j][i] * x[j] for j in range(i + 1, n))) / lower[i][i]
    return x


def eigenvalues_symmetric(a: list[list[float]]) -> list[float]:
    """Eigenvalues of a symmetric matrix using Jacobi rotations."""
    m = [row[:] for row in a]
    n = len(m)
    for _ in range(max(1, 80 * n * n)):
        p, q, largest = 0, 0, 0.0
        for i in range(n):
            for j in range(i + 1, n):
                if abs(m[i][j]) > largest:
                    p, q, largest = i, j, abs(m[i][j])
        scale = max(1.0, max(abs(m[i][i]) for i in range(n)))
        if largest <= 1e-13 * scale:
            break
        app, aqq, apq = m[p][p], m[q][q], m[p][q]
        angle = 0.5 * math.atan2(2.0 * apq, aqq - app)
        c, s = math.cos(angle), math.sin(angle)
        for k in range(n):
            if k in (p, q):
                continue
            mkp, mkq = m[k][p], m[k][q]
            m[k][p] = m[p][k] = c * mkp - s * mkq
            m[k][q] = m[q][k] = s * mkp + c * mkq
        m[p][p] = c * c * app - 2.0 * s * c * apq + s * s * aqq
        m[q][q] = s * s * app + 2.0 * s * c * apq + c * c * aqq
        m[p][q] = m[q][p] = 0.0
    return [m[i][i] for i in range(n)]


def condition_number_spd(a: list[list[float]]) -> float:
    values = eigenvalues_symmetric(a)
    low, high = min(values), max(values)
    if low <= 0.0:
        raise ValueError("No se pudo calcular el condicionamiento: A no es definida positiva.")
    return high / low


def leading_principal_minors_from_cholesky(lower: list[list[float]]) -> list[float]:
    """Leading principal minors, computed as products of squared Cholesky pivots."""
    minors: list[float] = []
    determinant = 1.0
    for i, row in enumerate(lower):
        determinant *= row[i] ** 2
        minors.append(determinant)
    return minors


def symmetric_preconditioned_matrix(a: list[list[float]], diagonal: list[float] | None) -> list[list[float]]:
    if diagonal is None:
        return [row[:] for row in a]
    scale = [1.0 / math.sqrt(value) for value in diagonal]
    return [[a[i][j] * scale[i] * scale[j] for j in range(len(a))] for i in range(len(a))]


def iterate_cg(
    a: list[list[float]],
    b: list[float],
    x0: list[float],
    tolerance: float,
    max_iterations: int,
    use_jacobi: bool,
) -> dict[str, Any]:
    n = len(b)
    x = x0[:]
    r = [b[i] - value for i, value in enumerate(matvec(a, x))]
    bnorm = norm(b)
    residual = norm(r)
    relative = residual / bnorm if bnorm else (0.0 if residual == 0.0 else None)
    history = [relative if relative is not None else residual]
    if relative is not None and relative < tolerance:
        return {"x": x, "iterations": 0, "converged": True, "relative_residual": relative, "history": history}

    diag = [a[i][i] for i in range(n)] if use_jacobi else None

    def precondition(vector: list[float]) -> list[float]:
        if diag is None:
            return vector[:]
        return [vector[i] / diag[i] for i in range(n)]

    z = precondition(r)
    p = z[:]
    rho = dot(r, z)
    converged = False
    iterations = 0
    for k in range(1, max_iterations + 1):
        ap = matvec(a, p)
        denominator = dot(p, ap)
        if denominator <= 0.0 or not math.isfinite(denominator) or rho <= 0.0:
            break
        alpha = rho / denominator
        x = [x[i] + alpha * p[i] for i in range(n)]
        r = [r[i] - alpha * ap[i] for i in range(n)]
        iterations = k
        residual = norm(r)
        relative = residual / bnorm if bnorm else (0.0 if residual == 0.0 else None)
        history.append(relative if relative is not None else residual)
        if relative is not None and relative < tolerance:
            converged = True
            break
        z = precondition(r)
        rho_new = dot(r, z)
        if rho_new <= 0.0 or not math.isfinite(rho_new):
            break
        beta = rho_new / rho
        p = [z[i] + beta * p[i] for i in range(n)]
        rho = rho_new
    actual_r = [b[i] - value for i, value in enumerate(matvec(a, x))]
    actual_norm = norm(actual_r)
    actual_relative = actual_norm / bnorm if bnorm else (0.0 if actual_norm == 0.0 else None)
    converged = actual_relative is not None and actual_relative < tolerance
    return {
        "x": x,
        "iterations": iterations,
        "converged": converged,
        "relative_residual": actual_relative,
        "history": history,
    }


def validate_model(payload: dict[str, Any]) -> tuple[list[list[float]], list[float], list[float], float, int, str, list[list[float]]]:
    a = payload.get("A")
    b = payload.get("b")
    x0 = payload.get("x0")
    if not isinstance(a, list) or not isinstance(b, list):
        raise ValueError("Envía una matriz A y un vector b en formato numérico.")
    n = len(b)
    if n < 4 or n > 20 or len(a) != n or any(not isinstance(row, list) or len(row) != n for row in a):
        raise ValueError("A debe ser cuadrada y el sistema debe tener entre 4 y 20 variables.")
    try:
        a = [[float(value) for value in row] for row in a]
        b = [float(value) for value in b]
        x0 = [float(value) for value in (x0 if x0 is not None else [0.0] * n)]
    except (TypeError, ValueError):
        raise ValueError("Todos los coeficientes deben ser números válidos.") from None
    if len(x0) != n or any(not math.isfinite(v) for row in a for v in row) or any(not math.isfinite(v) for v in b + x0):
        raise ValueError("Verifica que los vectores tengan el mismo tamaño y no contengan valores infinitos.")
    scale = max(1.0, max(abs(v) for row in a for v in row))
    for i in range(n):
        for j in range(n):
            if abs(a[i][j] - a[j][i]) > 1e-10 * scale:
                raise ValueError("La matriz A debe ser simétrica. Revisa los coeficientes reflejados.")
    lower = cholesky(a)
    try:
        tolerance = float(payload.get("tolerance", 1e-6))
        max_iterations = int(payload.get("max_iterations", 500))
    except (TypeError, ValueError):
        raise ValueError("Tolerancia y máximo de iteraciones deben ser numéricos.") from None
    if not math.isfinite(tolerance) or tolerance <= 0.0 or tolerance >= 1.0:
        raise ValueError("La tolerancia debe estar entre 0 y 1.")
    if max_iterations < 1 or max_iterations > 10000:
        raise ValueError("El máximo de iteraciones debe estar entre 1 y 10000.")
    preconditioner = payload.get("preconditioner", "jacobi")
    if preconditioner not in ("jacobi", "none"):
        raise ValueError("Elige Jacobi o sin precondicionador.")
    return a, b, x0, tolerance, max_iterations, preconditioner, lower


def solve_model(payload: dict[str, Any]) -> dict[str, Any]:
    a, b, x0, tolerance, max_iterations, preconditioner, lower = validate_model(payload)
    reference = solve_cholesky(lower, b)
    gc = iterate_cg(a, b, x0, tolerance, max_iterations, use_jacobi=False)
    gcp = iterate_cg(a, b, x0, tolerance, max_iterations, use_jacobi=(preconditioner == "jacobi"))
    errors = []
    for i, (xr, xg) in enumerate(zip(reference, gcp["x"])):
        absolute = abs(xr - xg)
        relative = absolute / abs(xr) if xr != 0 else None
        errors.append({
            "variable": VARIABLES[i] if i < len(VARIABLES) else f"Variable {i + 1}",
            "reference": xr,
            "gcp": xg,
            "absolute": absolute,
            "relative": relative,
            "percent": relative * 100.0 if relative is not None else None,
        })
    diag = [a[i][i] for i in range(len(a))] if preconditioner == "jacobi" else None
    preconditioned = symmetric_preconditioned_matrix(a, diag)
    symmetry_error = max(abs(a[i][j] - a[j][i]) for i in range(len(a)) for j in range(len(a)))
    return {
        "reference": reference,
        "gc": gc,
        "gcp": gcp,
        "errors": errors,
        "symmetry_error": symmetry_error,
        "leading_principal_minors": leading_principal_minors_from_cholesky(lower),
        "kappa_a": condition_number_spd(a),
        "kappa_preconditioned": condition_number_spd(preconditioned),
        "residual_relative": gcp["relative_residual"],
        "preconditioner": "Jacobi" if preconditioner == "jacobi" else "Ninguno",
        "dimension": len(b),
    }


def load_budget_reference() -> list[dict[str, Any]]:
    path = ROOT / "data" / "umsa_budget_reference.csv"
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return [
            {
                "year": int(row["gestion"]),
                "tgn": int(row["subvencion_ordinaria_tgn"]),
                "tax": int(row["coparticipacion_tributaria"]),
                "idh": int(row["coparticipacion_idh"]),
            }
            for row in csv.DictReader(stream)
        ]


SCENARIOS = build_scenarios()


