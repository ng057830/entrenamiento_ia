const base = [
  ["P1", 14.2, 85, 91],
  ["P2", 13.8, 72, 89],
  ["P3", 13.5, 68, 88],
  ["P4", 12.4, 35, 84],
  ["P5", 11.8, 28, 81],
  ["P6", 11.2, 22, 79],
  ["P7", 10.5, 15, 75],
  ["P8", 9.8, 10, 72],
  ["P9", 9.2, 8, 70],
  ["P10", 8.7, 6, 68],
].map((x) => ({ id: x[0], h: x[1], f: x[2], v: x[3], label: "" }));
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  C = ["#7155ef", "#16a085", "#f29f3d", "#e85672", "#3182ce"];
let rows = JSON.parse(localStorage.getItem("anemialab-data") || "null") || base,
  method = "kmeans",
  model = null;
const vector = (p) => [p.h, p.f, p.v],
  distance = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
function scaler(data, on) {
  const xs = data.map(vector),
    mean = [0, 1, 2].map((i) => xs.reduce((s, x) => s + x[i], 0) / xs.length),
    sd = [0, 1, 2].map(
      (i) =>
        Math.sqrt(
          xs.reduce((s, x) => s + (x[i] - mean[i]) ** 2, 0) / xs.length,
        ) || 1,
    );
  return {
    go: (x) => (on ? x.map((n, i) => (n - mean[i]) / sd[i]) : [...x]),
    back: (x) => (on ? x.map((n, i) => n * sd[i] + mean[i]) : [...x]),
  };
}
function runKmeans() {
  const k = +$("#k").value,
    sc = scaler(rows, $("#normalize").checked),
    xs = rows.map((p) => sc.go(vector(p))),
    ordered = [...xs].sort((a, b) => a[1] - b[1]);
  let centers = Array.from({ length: k }, (_, i) => [
      ...ordered[Math.round((i * (ordered.length - 1)) / (k - 1))],
    ]),
    history = [];
  for (let iteration = 1; iteration <= 50; iteration++) {
    const groups = xs.map((x) =>
        centers.reduce(
          (best, c, j) =>
            distance(x, c) < distance(x, centers[best]) ? j : best,
          0,
        ),
      ),
      next = centers.map((old, j) => {
        const m = xs.filter((_, i) => groups[i] === j);
        return m.length
          ? [0, 1, 2].map((q) => m.reduce((s, x) => s + x[q], 0) / m.length)
          : old;
      }),
      movement = Math.max(...next.map((c, i) => distance(c, centers[i])));
    centers = next;
    history.push({
      groups,
      centers: centers.map((x) => [...x]),
      movement,
      iteration,
    });
    if (movement < 1e-6) break;
  }
  return { type: "kmeans", sc, history, snap: history.at(-1) };
}
function save() {
  localStorage.setItem("anemialab-data", JSON.stringify(rows));
}
function renderRows() {
  const body = $("#rows");
  body.innerHTML = rows
    .map(
      (p, i) =>
        `<tr><td><input data-i="${i}" data-f="id" value="${p.id}"></td><td><input type="number" data-i="${i}" data-f="h" value="${p.h}"></td><td><input type="number" data-i="${i}" data-f="f" value="${p.f}"></td><td><input type="number" data-i="${i}" data-f="v" value="${p.v}"></td><td><select data-i="${i}" data-f="label"><option value="">Sin rotular</option>${["Normal", "Alteración moderada", "Posible anemia marcada", "Revisar / indeterminado"].map((x) => `<option ${p.label === x ? "selected" : ""}>${x}</option>`).join("")}</select></td><td><button data-del="${i}">×</button></td></tr>`,
    )
    .join("");
  $("#count").textContent = rows.length;
  const n = rows.filter((p) => p.label).length;
  $("#labelCount").textContent = `${n} / ${rows.length}`;
  $("#labelBar").style.width = `${(100 * n) / Math.max(rows.length, 1)}%`;
  $("#labelHelp").textContent =
    method === "kmeans"
      ? "K-Means ignora los rótulos al entrenar; se usan después para interpretar."
      : "Este método usa el criterio médico como respuesta correcta.";
  $$("[data-f]").forEach(
    (e) =>
      (e.onchange = () => {
        const f = e.dataset.f,
          i = +e.dataset.i;
        rows[i][f] = ["h", "f", "v"].includes(f) ? +e.value : e.value;
        model = null;
        save();
        draw();
      }),
  );
  $$("[data-del]").forEach(
    (e) =>
      (e.onclick = () => {
        rows.splice(+e.dataset.del, 1);
        model = null;
        save();
        renderRows();
        draw();
      }),
  );
}
let camera = { yaw: -0.72, pitch: 0.42, zoom: 1 }, drag3d = null, lastFocus = null;
function bounds() {
  const all = rows.map(vector).concat(lastFocus ? [lastFocus] : []);
  return [0, 1, 2].map((i) => {
    const lo = Math.min(...all.map((x) => x[i])), hi = Math.max(...all.map((x) => x[i])), pad = (hi - lo || 1) * 0.08;
    return [lo - pad, hi + pad];
  });
}
function point(raw, domain = bounds()) {
  let x = ((raw[0] - domain[0][0]) / (domain[0][1] - domain[0][0]) - .5) * 330;
  let y = ((raw[1] - domain[1][0]) / (domain[1][1] - domain[1][0]) - .5) * 330;
  let z = ((raw[2] - domain[2][0]) / (domain[2][1] - domain[2][0]) - .5) * 270;
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const xr=x*cy-z*sy, zr=x*sy+z*cy, yr=y*cp-zr*sp, depth=y*sp+zr*cp;
  const perspective=1/(1+depth/1350), zoom=camera.zoom*perspective;
  return [380+xr*zoom,265+yr*.76*zoom,depth];
}
function edge(a,b,cls='plot-grid'){const A=point(a),B=point(b);return `<line class="${cls}" x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}"/>`}
function draw(focus = lastFocus) {
  lastFocus=focus; const svg=$("#plot"), domain=bounds(), lo=domain.map(x=>x[0]),hi=domain.map(x=>x[1]), labels=[...new Set(rows.map(p=>p.label).filter(Boolean))];
  let grid='<rect x="1" y="1" width="758" height="518" rx="18" fill="transparent" stroke="#ebe9e3"/>';
  for(let t=0;t<=4;t++){const q=t/4,x=lo[0]+(hi[0]-lo[0])*q,y=lo[1]+(hi[1]-lo[1])*q;grid+=edge([x,lo[1],lo[2]],[x,hi[1],lo[2]])+edge([lo[0],y,lo[2]],[hi[0],y,lo[2]])+edge([lo[0],y,lo[2]],[lo[0],y,hi[2]]);}
  const axes=[[lo,[hi[0],lo[1],lo[2]],'Hemoglobina','g/dL'],[lo,[lo[0],hi[1],lo[2]],'Ferritina','ng/mL'],[lo,[lo[0],lo[1],hi[2]],'VCM','fL']];
  axes.forEach(([a,b,name,unit],axisIndex)=>{grid+=edge(a,b,'plot-axis');const p=point(b);grid+=`<text class="plot-axis-label" x="${p[0]}" y="${p[1]-12}" text-anchor="middle">${name}</text><text class="plot-tick" x="${p[0]}" y="${p[1]+3}" text-anchor="middle">${Number(b[axisIndex]).toFixed(1)} ${unit}</text>`});
  const marks=rows.map((p,i)=>({kind:'patient',raw:vector(p),data:p,index:i,depth:point(vector(p))[2]}));
  if(model?.type==='kmeans') model.snap.centers.forEach((c,i)=>{const raw=model.sc.back(c);marks.push({kind:'center',raw,index:i,depth:point(raw)[2]})});
  if(focus) marks.push({kind:'focus',raw:focus,index:-1,depth:point(focus)[2]}); marks.sort((a,b)=>a.depth-b.depth);
  const markup=marks.map(m=>{const p=point(m.raw);if(m.kind==='center')return `<rect class="plot-centroid" data-center="${m.index}" x="${p[0]-9}" y="${p[1]-9}" width="18" height="18" rx="2" transform="rotate(45 ${p[0]} ${p[1]})" fill="${C[m.index]}"/>`;if(m.kind==='focus')return `<g><circle cx="${p[0]}" cy="${p[1]}" r="10" fill="#18212f" stroke="white" stroke-width="3"/><text class="plot-axis-label" x="${p[0]+14}" y="${p[1]-11}">Nuevo</text></g>`;const g=model?.type==='kmeans'?model.snap.groups[m.index]:labels.indexOf(m.data.label),color=g>=0?C[g]:'#aeb8c8';return `<g class="plot-patient" data-patient="${m.index}"><circle class="plot-point" cx="${p[0]}" cy="${p[1]}" r="7" fill="${color}"/><text class="plot-tick" x="${p[0]+10}" y="${p[1]-9}">${m.data.id}</text></g>`}).join('');
  svg.innerHTML=grid+markup; $("#legend").textContent=model?'● Modelo preparado':'● Sin entrenar'; bindPlotDetails();
}
function bindPlotDetails(){const tip=$("#plotTooltip"),stage=$('.plot-stage');$$('[data-patient]').forEach(g=>{const show=e=>{const p=rows[+g.dataset.patient],r=stage.getBoundingClientRect();tip.innerHTML=`<b>${p.id}</b><span>Hemoglobina</span> ${p.h} g/dL<br><span>Ferritina</span> ${p.f} ng/mL<br><span>VCM</span> ${p.v} fL<br><em>${p.label||'Sin rótulo clínico'}</em>`;tip.hidden=false;tip.style.left=`${e.clientX-r.left}px`;tip.style.top=`${e.clientY-r.top}px`;g.querySelector('circle').setAttribute('r','10')};g.onpointerenter=show;g.onpointermove=show;g.onpointerleave=()=>{tip.hidden=true;g.querySelector('circle').setAttribute('r','7')};g.onclick=show});}
function typeset(node) {
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([node]);
}
function latex(x) {
  return `<div class="formula">\\[${x}\\]</div>`;
}
function show(view) {
  $$("[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view),
  );
  ["data", "training", "predict"].forEach(
    (x) => ($(`#${x}View`).hidden = x !== view),
  );
  if (view === "training") training();
  if (view === "predict") predict();
}
function training() {
  const box = $("#trainingContent");
  if (!model) {
    box.innerHTML =
      '<div class="result"><h3>Sin entrenamiento</h3><p>Regresa a Datos y prepara el modelo.</p></div>';
    return;
  }
  if (model.type === "knn") {
    box.innerHTML = `<div class="panel-head"><div><small>SUPERVISADO</small><h2>KNN preparado con k = ${model.k}</h2></div></div><div class="lesson"><i>1</i><div><h3>Rótulos de la médica</h3><p>Se conservan ${model.data.length} pacientes rotulados. KNN no calcula centroides.</p></div></div><div class="lesson"><i>2</i><div><h3>Exactamente ${model.k} vecinos</h3>${latex("N_k(x)=\\operatorname{arg\\,sort}_k\;d(x,x_i)")}</div></div><div class="lesson"><i>3</i><div><h3>Votación</h3>${latex("\\hat y=\\operatorname{mode}\\{y_i:x_i\\in N_k(x)\\}")}</div></div><button class="primary" onclick="show('predict')">Clasificar paciente nuevo →</button>`;
    typeset(box);
    return;
  }
  const s = model.snap;
  box.innerHTML = `<div class="panel-head"><div><small>CONVERGENCIA</small><h2>${model.history.length} iteraciones</h2></div><i>Movimiento ${s.movement.toFixed(6)}</i></div><div class="lesson"><i>A</i><div><h3>Asignar cada paciente</h3><p>Se elige el centroide más cercano.</p>${latex("g(i)=\\underset{j}{\\operatorname{arg\\,min}}\;\\lVert x_i-\\mu_j\\rVert_2")}</div></div><div class="lesson"><i>B</i><div><h3>Recalcular centroides</h3><p>Un centroide no es un paciente: es el promedio variable por variable.</p>${latex("\\mu_j=\\frac{1}{|S_j|}\\sum_{x_i\\in S_j}x_i=\\left(\\frac{\\sum H_i}{n_j},\\frac{\\sum F_i}{n_j},\\frac{\\sum VCM_i}{n_j}\\right)")}</div></div>${s.centers.map((c, j) => centroidCard(c, j)).join("")}<button class="primary" onclick="show('predict')">Clasificar paciente nuevo →</button>`;
  typeset(box);
}
function centroidCard(c, j) {
  const members = rows.filter((_, i) => model.snap.groups[i] === j),
    r = model.sc.back(c),
    frac = (field) => members.map((x) => x[field]).join("+");
  return `<details class="centroid" ${j ? "" : "open"}><summary><i style="background:${C[j]}"></i> Centroide μ${j + 1}<b>(${r.map((x) => x.toFixed(2)).join(", ")})</b></summary><div><p>Miembros: ${members.map((x) => x.id).join(", ")}</p>${latex(`\\bar H=\\frac{${frac("h")}}{${members.length}}=${r[0].toFixed(2)}`)}${latex(`\\bar F=\\frac{${frac("f")}}{${members.length}}=${r[1].toFixed(2)}`)}${latex(`\\overline{VCM}=\\frac{${frac("v")}}{${members.length}}=${r[2].toFixed(2)}`)}<p>Criterio médico: ${members.map((x) => x.label || "sin rotular").join(" · ")}</p></div></details>`;
}
function predict() {
  const box = $("#predictContent");
  if (!model) {
    box.innerHTML =
      '<div class="result"><h3>Entrena primero</h3><p>El modelo necesita aprender de la base.</p></div>';
    return;
  }
  box.innerHTML = `<div class="panel-head"><div><small>NUEVA OBSERVACIÓN</small><h2>Clasificar paciente</h2></div></div><div class="candidate">${[
    ["Hemoglobina", 10.9],
    ["Ferritina", 18],
    ["VCM", 76],
  ]
    .map(
      (x, i) =>
        `<label>${x[0]}<input id="new${i}" type="number" step=".1" value="${x[1]}"></label>`,
    )
    .join(
      "",
    )}</div><button id="classify" class="primary">Calcular resultado →</button><div id="answer"></div>`;
  $("#classify").onclick = classify;
}
function classify() {
  const x = [0, 1, 2].map((i) => +$(`#new${i}`).value),
    tx = model.sc.go(x);
  draw(x);
  if (model.type === "knn") {
    const near = model.data
        .map((p) => ({ p, d: distance(tx, model.sc.go(vector(p))) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, model.k),
      votes = {};
    near.forEach((n) => (votes[n.p.label] = (votes[n.p.label] || 0) + 1));
    const win = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    $("#answer").innerHTML =
      `<div class="lesson"><i>1</i><div><h3>${near.length} vecinos consultados (k = ${model.k})</h3>${near.map((n) => `<div class="neighbor"><span>${n.p.id} · ${n.p.label}</span><b>${n.d.toFixed(3)}</b></div>`).join("")}</div></div><div class="result"><span>VOTO MAYORITARIO</span><h3>${win}</h3><p>KNN transfiere el criterio de los vecinos rotulados.</p></div>`;
  } else {
    const ds = model.snap.centers.map((c) => distance(tx, c)),
      w = ds.indexOf(Math.min(...ds));
    $("#answer").innerHTML =
      `<div class="lesson"><i>1</i><div><h3>Distancias</h3>${ds.map((d, i) => `<div class="neighbor"><span>Centroide μ${i + 1}</span><b>${d.toFixed(3)}</b></div>`).join("")}</div></div><div class="result"><span>DISTANCIA MÍNIMA</span><h3>Grupo ${w + 1}</h3><p>Distancia ${ds[w].toFixed(3)}. El grupo no equivale a diagnóstico.</p></div>`;
  }
}
function train() {
  if (method === "svm") {
    alert(
      "El área SVM y sus rótulos ya están separados. El optimizador de margen quedará para la siguiente ampliación.",
    );
    return;
  }
  if (method === "knn") {
    const data = rows.filter((p) => p.label);
    if (data.length < 2) {
      alert("Rotula al menos dos pacientes.");
      return;
    }
    model = {
      type: "knn",
      data,
      sc: scaler(data, $("#normalize").checked),
      k: Math.min(+$("#k").value, data.length),
    };
    $("#modelStatus").textContent = `KNN preparado · ${data.length} rotulados`;
    draw();
    show("training");
  } else {
    model = runKmeans();
    $("#modelStatus").textContent =
      `K-Means entrenado · ${model.history.length} iteraciones`;
    draw();
    show("training");
  }
}
$$("[data-method]").forEach(
  (b) =>
    (b.onclick = () => {
      method = b.dataset.method;
      model = null;
      $$("[data-method]").forEach((x) => x.classList.toggle("active", x === b));
      const supervised = method !== "kmeans";
      $("#methodNote").innerHTML = supervised
        ? `<b>${method.toUpperCase()} es supervisado:</b> la médica debe rotular primero los pacientes.`
        : "K-Means ignora los rótulos durante el entrenamiento. Después permite compararlos con el criterio médico.";
      const selectedK = $("#k").value;
      $("#parameterLabel").innerHTML =
        method === "kmeans"
          ? `Número de grupos <b>k = <i id="kValue">${selectedK}</i></b>`
          : `Número de vecinos <b>k = <i id="kValue">${selectedK}</i></b>`;
      $("#train").textContent =
        method === "svm"
          ? "Espacio SVM preparado"
          : method === "knn"
            ? "Preparar KNN →"
            : "Entrenar K-Means →";
      renderRows();
      draw();
      show("data");
    }),
);
$$("[data-view]").forEach((b) => (b.onclick = () => show(b.dataset.view)));
$("#add").onclick = () => {
  rows.push({ id: `P${rows.length + 1}`, h: 12, f: 30, v: 80, label: "" });
  save();
  renderRows();
  draw();
};
$("#reset").onclick = () => {
  rows = structuredClone(base);
  model = null;
  save();
  renderRows();
  draw();
};
$("#k").oninput = (e) => ($("#kValue").textContent = e.target.value);
$("#train").onclick = train;
const plot=$("#plot");
plot.onpointerdown=e=>{drag3d={x:e.clientX,y:e.clientY};plot.setPointerCapture(e.pointerId);$("#plotTooltip").hidden=true};
plot.onpointermove=e=>{if(!drag3d)return;const dx=e.clientX-drag3d.x,dy=e.clientY-drag3d.y;drag3d={x:e.clientX,y:e.clientY};camera.yaw+=dx*.009;camera.pitch=Math.max(-1.25,Math.min(1.25,camera.pitch+dy*.009));draw()};
plot.onpointerup=plot.onpointercancel=()=>drag3d=null;
plot.onwheel=e=>{e.preventDefault();camera.zoom=Math.max(.65,Math.min(1.75,camera.zoom*(e.deltaY>0?.92:1.08)));draw()};
$("#resetView").onclick=()=>{camera={yaw:-.72,pitch:.42,zoom:1};draw()};
renderRows();
draw();
show("data");
