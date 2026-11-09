const state = {
  metadata: null,
  scenarioKey: "ideal",
  A: [],
  b: [],
  x0: [],
  lastResult: null,
  comparisons: {},
  timer: null,
  solving: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const numberText = (value, digits = 5) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n !== 0 && (Math.abs(n) >= 1e7 || Math.abs(n) < 1e-4)) return n.toExponential(2);
  return new Intl.NumberFormat("es-BO", { maximumSignificantDigits: digits }).format(n);
};
const moneyText = (value) => new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 }).format(value);

async function requestSolve(payload) {
  const response = await fetch("/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo resolver el sistema.");
  return data;
}

function currentPayload(overrides = {}) {
  return {
    A: state.A.map((row) => row.slice()),
    b: state.b.slice(),
    x0: state.x0.slice(),
    tolerance: Number($("#tolerance").value),
    max_iterations: Number($("#maxIterations").value),
    preconditioner: $("#preconditioner").value,
    ...overrides,
  };
}

function renderMatrix() {
  const body = $("#matrixTable tbody");
  body.innerHTML = "";
  const n = state.A.length;
  for (let i = 0; i < n; i += 1) {
    const row = document.createElement("tr");
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = String(i + 1).padStart(2, "0");
    row.append(label);
    for (let j = 0; j < n; j += 1) {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      input.className = "matrix-input";
      input.type = "number";
      input.step = "any";
      input.value = state.A[i][j];
      input.setAttribute("aria-label", `Coeficiente a${i + 1}${j + 1}`);
      input.dataset.row = i;
      input.dataset.col = j;
      input.addEventListener("input", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        state.A[i][j] = value;
        if (i !== j) {
          state.A[j][i] = value;
          const mirrored = $(`.matrix-input[data-row="${j}"][data-col="${i}"]`);
          if (mirrored) mirrored.value = value;
        }
        scheduleSolve();
      });
      cell.append(input);
      row.append(cell);
    }
    body.append(row);
  }
}

function renderVectorInputs() {
  const bHost = $("#bInputs");
  const xHost = $("#x0Inputs");
  bHost.innerHTML = "";
  xHost.innerHTML = "";
  state.b.forEach((value, i) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = value;
    input.setAttribute("aria-label", `Término independiente b${i + 1}`);
    input.addEventListener("input", () => {
      state.b[i] = Number(input.value);
      scheduleSolve();
    });
    bHost.append(input);

    const initial = document.createElement("input");
    initial.type = "number";
    initial.step = "any";
    initial.value = state.x0[i];
    initial.setAttribute("aria-label", `Valor inicial x${i + 1}`);
    initial.addEventListener("input", () => {
      state.x0[i] = Number(initial.value);
      scheduleSolve();
    });
    xHost.append(initial);
  });
}

function loadScenario(key) {
  const scenario = state.metadata.scenarios[key];
  state.scenarioKey = key;
  state.A = scenario.A.map((row) => row.slice());
  state.b = scenario.b.slice();
  state.x0 = Array(state.b.length).fill(0);
  $$(".scenario-button").forEach((button) => button.classList.toggle("active", button.dataset.scenario === key));
  $("#scenarioDescription").textContent = scenario.description;
  setText("#chartScenario", scenario.label.toUpperCase());
  if (key === "ill") $("#preconditioner").value = "jacobi";
  renderMatrix();
  renderVectorInputs();
  scheduleSolve(0);
}

function scheduleSolve(delay = 280) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => solveCurrent(), delay);
}

function setText(selector, value) {
  $(selector).textContent = value;
}

function setConvergence(converged) {
  const tag = $("#convergenceTag");
  tag.textContent = converged ? "CONVERGIÓ" : "NO CONVERGIÓ";
  tag.className = `tag ${converged ? "tag-good" : "tag-bad"}`;
}

function clearResultTables() {
  $("#solutionTable tbody").innerHTML = "";
  $("#errorTable tbody").innerHTML = "";
  $("#convergenceChart").getContext("2d").clearRect(0, 0, $("#convergenceChart").width, $("#convergenceChart").height);
}

function renderResults(result) {
  state.lastResult = result;
  setText("#gcIterations", result.gc.iterations);
  setText("#gcpIterations", result.gcp.iterations);
  setText("#kappaA", numberText(result.kappa_a, 4));
  setText("#kappaM", numberText(result.kappa_preconditioned, 4));
  setText("#finalResidual", numberText(result.residual_relative, 4));
  setText("#chartPreconditioner", result.preconditioner);
  setConvergence(result.gcp.converged);

  const solutionBody = $("#solutionTable tbody");
  solutionBody.innerHTML = "";
  result.errors.forEach((item, i) => {
    const row = document.createElement("tr");
    row.innerHTML = `<th scope="row">${item.variable}</th><td>${numberText(item.reference)}</td><td>${numberText(result.gc.x[i])}</td><td>${numberText(item.gcp)}</td>`;
    solutionBody.append(row);
  });

  const errorBody = $("#errorTable tbody");
  errorBody.innerHTML = "";
  result.errors.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `<th scope="row">${item.variable}</th><td>${numberText(item.absolute)}</td><td>${item.relative === null ? "No definido (referencia = 0)" : numberText(item.relative)}</td><td>${item.percent === null ? "—" : `${numberText(item.percent)} %`}</td>`;
    errorBody.append(row);
  });
  drawConvergence(result.gc.history, result.gcp.history);
  renderInterpretation(result);

  const scenario = state.metadata.scenarios[state.scenarioKey];
  state.comparisons[state.scenarioKey] = {
    label: scenario.label,
    gc: result.gc.iterations,
    gcp: result.gcp.iterations,
    kappaA: result.kappa_a,
    kappaM: result.kappa_preconditioned,
    residual: result.residual_relative,
    converged: result.gcp.converged,
  };
  renderComparison();
}

function renderInterpretation(result) {
  const scenario = state.metadata.scenarios[state.scenarioKey];
  const maxError = result.errors.reduce((largest, item) => Math.max(largest, item.absolute), 0);
  const largestAdjustment = result.errors.reduce((largest, item) =>
    Math.abs(item.gcp) > Math.abs(largest.gcp) ? item : largest, result.errors[0]);
  const scenarioLead = {
    ideal: "Este escenario sirve como línea base: describe el resultado del modelo bajo condiciones financieras estables.",
    stress: "Este escenario representa presión financiera mediante cambios en coeficientes y metas; compáralo con Ideal para ver cómo se desplazan los ajustes calculados.",
    ill: "Este escenario enfatiza el efecto del mal escalamiento: revisa cuánto cambia el condicionamiento y si Jacobi facilita la convergencia.",
  }[state.scenarioKey];
  const badge = $("#interpretationBadge");
  badge.textContent = scenario.label.toUpperCase();
  setText("#interpretationScenario", `Resultados actualizados para el escenario ${scenario.label}.`);
  setText("#interpretationLead", scenarioLead);

  const tolerance = Number($("#tolerance").value);
  const residual = result.residual_relative;
  const accuracy = result.gcp.converged
    ? `GCP alcanzó la tolerancia ${numberText(tolerance)}. El residuo relativo final es ${numberText(residual)} y el mayor error absoluto frente a Cholesky es ${numberText(maxError)} miles de Bs.`
    : `GCP no alcanzó la tolerancia ${numberText(tolerance)} en el máximo de iteraciones indicado. El residuo final (${numberText(residual)}) y los errores deben leerse como una aproximación incompleta.`;
  setText("#interpretationAccuracy", accuracy);

  let iterationText;
  if (!result.gcp.converged) {
    iterationText = `GC usó ${result.gc.iterations} iteraciones y GCP ${result.gcp.iterations}. Revisa el residuo, el máximo de iteraciones y el precondicionador antes de comparar el rendimiento.`;
  } else if (result.gcp.iterations < result.gc.iterations) {
    iterationText = `GCP convergió en ${result.gcp.iterations} iteraciones frente a ${result.gc.iterations} de GC. En este escenario, el precondicionamiento redujo las iteraciones.`;
  } else if (result.gcp.iterations === result.gc.iterations) {
    iterationText = `GC y GCP convergieron en ${result.gc.iterations} iteraciones. Para este sistema, el precondicionador no cambió el conteo de iteraciones.`;
  } else {
    iterationText = `GC convergió en ${result.gc.iterations} iteraciones y GCP en ${result.gcp.iterations}. En esta entrada, el precondicionador no aceleró la convergencia.`;
  }
  const conditionImproved = result.kappa_preconditioned < result.kappa_a;
  iterationText += conditionImproved
    ? ` κ pasó de ${numberText(result.kappa_a, 4)} a ${numberText(result.kappa_preconditioned, 4)} con la matriz precondicionada.`
    : ` κ(A) = ${numberText(result.kappa_a, 4)} y κ precondicionada = ${numberText(result.kappa_preconditioned, 4)}; aquí no se observa una reducción del número de condición.`;
  setText("#interpretationConvergence", iterationText);

  if (largestAdjustment) {
    const direction = largestAdjustment.gcp < 0 ? "reducción" : "aumento";
    setText("#interpretationFinance", `El mayor ajuste en valor absoluto corresponde a ${largestAdjustment.variable}: ${direction} de ${numberText(Math.abs(largestAdjustment.gcp))} miles de Bs respecto a la línea base didáctica. Es una salida del modelo; cambiar los supuestos puede cambiar el resultado.`);
  }
}

function renderComparison() {
  const body = $("#comparisonTable tbody");
  body.innerHTML = "";
  ["ideal", "stress", "ill"].forEach((key) => {
    const value = state.comparisons[key];
    if (!value) return;
    const row = document.createElement("tr");
    row.innerHTML = `<th scope="row">${value.label}</th><td>${value.gc}</td><td>${value.gcp}</td><td>${numberText(value.kappaA, 4)}</td><td>${numberText(value.kappaM, 4)}</td><td>${numberText(value.residual, 4)}</td><td>${value.converged ? "Sí" : "No"}</td>`;
    body.append(row);
  });
}

async function solveCurrent() {
  if (state.solving) {
    scheduleSolve(150);
    return;
  }
  state.solving = true;
  $("#errorBanner").classList.add("hidden");
  setText("#solveStatus", "Calculando…");
  try {
    const result = await requestSolve(currentPayload());
    renderResults(result);
    setText("#solveStatus", "Resultados actualizados.");
  } catch (error) {
    $("#errorBanner").textContent = error.message;
    $("#errorBanner").classList.remove("hidden");
    setText("#solveStatus", "Revisa los datos de entrada.");
    setConvergence(false);
  } finally {
    state.solving = false;
  }
}

function drawBudgetChart(rows) {
  const canvas = $("#budgetChart");
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = 260;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  const colors = ["#3274dc", "#25a987", "#e4a142"];
  const max = Math.max(...rows.map((r) => r.tgn + r.tax + r.idh));
  const left = 46, right = 12, top = 14, bottom = 34;
  const chartH = height - top - bottom;
  const barW = Math.max(14, (width - left - right) / rows.length * 0.56);
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#758094";
  ctx.strokeStyle = "#e6eaf0";
  [0, 0.5, 1].forEach((fraction) => {
    const y = top + chartH * (1 - fraction);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
    ctx.fillText(`${Math.round((max * fraction) / 1e6)}M`, 4, y + 4);
  });
  rows.forEach((r, index) => {
    const x = left + (index + 0.5) * (width - left - right) / rows.length - barW / 2;
    let y = height - bottom;
    [r.tgn, r.tax, r.idh].forEach((value, series) => {
      const barH = (value / max) * chartH;
      y -= barH;
      ctx.fillStyle = colors[series];
      ctx.fillRect(x, y, barW, barH);
    });
    ctx.fillStyle = "#687386";
    ctx.textAlign = "center";
    ctx.fillText(String(r.year), x + barW / 2, height - 12);
  });
  ctx.textAlign = "left";
}

function drawConvergence(gcHistory = [], gcpHistory = []) {
  const canvas = $("#convergenceChart");
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = 240;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  const left = 54, right = 18, top = 16, bottom = 43;
  const all = [...gcHistory, ...gcpHistory].filter((x) => Number.isFinite(x) && x >= 0);
  if (!all.length) return;
  const maxIter = Math.max(gcHistory.length, gcpHistory.length) - 1;
  const xDenominator = Math.max(1, maxIter);
  const tolerance = Math.max(Number($("#tolerance").value) || 1e-6, 1e-16);
  const logs = all.map((x) => Math.log10(Math.max(x, 1e-16)));
  const maxLog = Math.max(0, ...logs);
  const minLog = Math.min(Math.log10(tolerance) - 1, ...logs);
  const xAt = (i) => left + (i / xDenominator) * (width - left - right);
  const yAt = (value) => top + ((maxLog - Math.log10(Math.max(value, 1e-16))) / Math.max(1, maxLog - minLog)) * (height - top - bottom);
  ctx.strokeStyle = "#e6eaf0";
  ctx.fillStyle = "#758094";
  ctx.font = "11px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 2; i += 1) {
    const y = top + i * (height - top - bottom) / 2;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
    const tick = maxLog - i * (maxLog - minLog) / 2;
    ctx.fillText(`10^${tick.toFixed(0)}`, left - 9, y + 4);
  }
  const toleranceY = yAt(tolerance);
  ctx.beginPath();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "#718097";
  ctx.lineWidth = 1.5;
  ctx.moveTo(left, toleranceY);
  ctx.lineTo(width - right, toleranceY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#5c6c83";
  ctx.textAlign = "right";
  ctx.fillText("tol.", width - right - 3, toleranceY - 6);

  [[gcHistory, "#d8902e"], [gcpHistory, "#3274dc"]].forEach(([series, color]) => {
    if (!series.length) return;
    ctx.beginPath();
    series.forEach((value, i) => i ? ctx.lineTo(xAt(i), yAt(value)) : ctx.moveTo(xAt(i), yAt(value)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fillStyle = color;
    series.forEach((value, i) => {
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(value), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.strokeStyle = "#cbd4e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, height - bottom);
  ctx.lineTo(width - right, height - bottom);
  ctx.stroke();
  const xTicks = [...new Set([0, Math.round(maxIter / 2), maxIter])];
  ctx.fillStyle = "#758094";
  ctx.textAlign = "center";
  xTicks.forEach((iteration) => ctx.fillText(String(iteration), xAt(iteration), height - bottom + 17));
  ctx.fillStyle = "#596a82";
  ctx.font = "600 11px Segoe UI, Arial, sans-serif";
  ctx.fillText("Iteración", (left + width - right) / 2, height - 3);
  ctx.textAlign = "left";
}

function renderBudgetReference(rows) {
  const body = $("#budgetTable tbody");
  body.innerHTML = "";
  rows.forEach((r) => {
    const total = r.tgn + r.tax + r.idh;
    const tr = document.createElement("tr");
    tr.innerHTML = `<th scope="row">${r.year}</th><td>${moneyText(r.tgn)}</td><td>${moneyText(r.tax)}</td><td>${moneyText(r.idh)}</td><td>${moneyText(total)}</td>`;
    body.append(tr);
  });
  const latest = rows[rows.length - 1];
  $("#budgetTotal").textContent = `Bs ${moneyText(latest.tgn + latest.tax + latest.idh)}`;
  drawBudgetChart(rows);
}

function renderQa(rows) {
  const body = $("#qaTable tbody");
  body.innerHTML = "";
  rows.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th scope="row">${item.name}</th><td>${item.input}</td><td>${item.expected}</td><td>${item.obtained}</td><td><span class="qa-result ${item.pass ? "qa-pass" : "qa-fail"}">${item.pass ? "APROBADA" : "REVISAR"}</span></td>`;
    body.append(tr);
  });
  const passed = rows.filter((r) => r.pass).length;
  $("#qaStatus").textContent = `${passed} de ${rows.length} pruebas aprobadas.`;
}

async function runQa() {
  const button = $("#runQaButton");
  button.disabled = true;
  button.textContent = "Ejecutando…";
  const outcomes = [];
  const base = { tolerance: 1e-6, max_iterations: 1000, preconditioner: "jacobi" };
  try {
    for (const key of ["ideal", "stress", "ill"]) {
      const scenario = state.metadata.scenarios[key];
      const result = await requestSolve({ ...base, A: scenario.A, b: scenario.b, x0: Array(scenario.b.length).fill(0) });
      outcomes.push({
        name: `Carga de escenario: ${scenario.label}`,
        input: `A y b de ${scenario.label}`,
        expected: "Sistema válido y convergencia de GCP",
        obtained: result.gcp.converged ? `${result.gcp.iterations} iteraciones; residuo ${numberText(result.residual_relative)}` : "GCP no alcanzó tolerancia",
        pass: result.gcp.converged,
      });
    }
  } catch (error) {
    outcomes.push({ name: "Carga de escenarios", input: "Ideal, estrés y mal condicionado", expected: "Los tres deben resolverse", obtained: error.message, pass: false });
  }

  try {
    const scenario = state.metadata.scenarios.ideal;
    const invalidA = scenario.A.map((row) => row.slice());
    invalidA[0][1] += 1;
    await requestSolve({ ...base, A: invalidA, b: scenario.b, x0: Array(scenario.b.length).fill(0) });
    outcomes.push({ name: "Validación de matriz no válida", input: "A no simétrica", expected: "Mensaje de validación, sin colapso", obtained: "La solicitud fue aceptada", pass: false });
  } catch (error) {
    outcomes.push({ name: "Validación de matriz no válida", input: "A no simétrica", expected: "Mensaje de validación, sin colapso", obtained: error.message, pass: /simétrica/i.test(error.message) });
  }

  try {
    await solveCurrent();
    const before = state.lastResult?.gcp?.x?.slice() || [];
    const bInput = $("#bInputs input");
    const original = Number(bInput.value);
    bInput.value = String(original + 1.25);
    bInput.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(450);
    const after = state.lastResult?.gcp?.x || [];
    const changed = before.some((value, i) => Math.abs(value - after[i]) > 1e-10);
    bInput.value = String(original);
    bInput.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(450);
    outcomes.push({ name: "Edición dinámica", input: "Modificar b₁ desde la interfaz", expected: "Recálculo automático con solución actualizada", obtained: changed ? "La solución se actualizó" : "No se observó cambio", pass: changed });
  } catch (error) {
    outcomes.push({ name: "Edición dinámica", input: "Modificar b₁ desde la interfaz", expected: "Recálculo automático", obtained: error.message, pass: false });
  }

  try {
    const scenario = state.metadata.scenarios.ill;
    const result = await requestSolve({ ...base, A: scenario.A, b: scenario.b, x0: Array(scenario.b.length).fill(0) });
    const pass = result.gcp.iterations <= result.gc.iterations && result.gcp.converged;
    outcomes.push({ name: "Comparación del precondicionador", input: "Escenario mal condicionado; Jacobi", expected: "GCP converge en menos o igual iteraciones que GC", obtained: `GC ${result.gc.iterations}; GCP ${result.gcp.iterations}`, pass });
  } catch (error) {
    outcomes.push({ name: "Comparación del precondicionador", input: "Escenario mal condicionado", expected: "GCP ≤ GC", obtained: error.message, pass: false });
  }
  renderQa(outcomes);
  button.disabled = false;
  button.textContent = "Ejecutar pruebas QA";
}

async function init() {
  try {
    const response = await fetch("/api/metadata");
    state.metadata = await response.json();
    renderBudgetReference(state.metadata.budget_reference);
    $$(".scenario-button").forEach((button) => button.addEventListener("click", () => loadScenario(button.dataset.scenario)));
    $("#solveButton").addEventListener("click", () => solveCurrent());
    $("#runQaButton").addEventListener("click", runQa);
    ["#tolerance", "#maxIterations", "#preconditioner"].forEach((selector) => $(selector).addEventListener("input", () => scheduleSolve()));
    $("#preconditioner").addEventListener("change", () => scheduleSolve());
    window.addEventListener("resize", () => {
      drawBudgetChart(state.metadata.budget_reference);
      if (state.lastResult) drawConvergence(state.lastResult.gc.history, state.lastResult.gcp.history);
    });
    loadScenario("ideal");
  } catch (error) {
    setText("#solveStatus", "No se pudo cargar la aplicación.");
    $("#errorBanner").textContent = error.message;
    $("#errorBanner").classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", init);
