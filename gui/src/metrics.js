
const params = new URLSearchParams(window.location.search);
const port = params.get('metrics');
const mydomain = params.get('domain');
const name = params.get('name');
const local = params.get('local');
const main_api_port = params.get('main_api_port');

const METRICS_URL = `http://127.0.0.1:${main_api_port}/metrics?portametric=${port}`;
const LOGS_URL =    `http://127.0.0.1:${main_api_port}/logs?domain=${mydomain}&name=${name}`;

console.log('localhost',local);
console.log('port',port);
console.log('mydomain',mydomain);
console.log('name',name);
console.log('main_api_port',main_api_port);

let history = {
    traffic: [],
    rtt: []
};

let lastData = null;


document.querySelector("#my_domain").textContent = mydomain  || 'Desconhecido'
 document.querySelector("#project_nam").textContent = '['+local+']';

/* =========================================================
   PARSER PROMETHEUS
========================================================= */

function parsePrometheus(text) {

    const metrics = {};
    const lines = text.split("\n");

    let currentHelp = "";
    let currentType = "";

    for (let line of lines) {

        line = line.trim();

        if (!line) continue;

        if (line.startsWith("# HELP")) {

            const parts = line.split(" ");

            currentHelp = parts.slice(3).join(" ");

            continue;
        }

        if (line.startsWith("# TYPE")) {

            const parts = line.split(" ");

            currentType = parts[2];

            continue;
        }

        if (line.startsWith("#")) continue;

        const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*?)\})?\s+(.+)$/);

        if (!match) continue;

        const name = match[1];
        const labelsString = match[2] || "";
        const value = parseFloat(match[3]);

        const labels = {};

        if (labelsString) {

            const regex = /([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g;

            let m;

            while ((m = regex.exec(labelsString))) {
                labels[m[1]] = m[2];
            }
        }

        if (!metrics[name]) {
            metrics[name] = [];
        }

        metrics[name].push({
            labels,
            value,
            type: currentType,
            help: currentHelp
        });

    }

    return metrics;
}


/* =========================================================
   GET VALUE
========================================================= */

function value(metrics, name, labels = {}) {

    if (!metrics[name]) return 0;

    const item = metrics[name].find(x => {

        return Object.keys(labels).every(
            key => x.labels[key] === labels[key]
        );

    });

    return item ? item.value : 0;
}


/* =========================================================
   FORMATADORES
========================================================= */

function formatBytes(bytes) {

    if (!Number.isFinite(bytes)) return "--";

    const units = ["B", "KB", "MB", "GB", "TB"];

    let i = 0;

    while (bytes >= 1024 && i < units.length - 1) {

        bytes /= 1024;
        i++;

    }

    return bytes.toFixed(i === 0 ? 0 : 2) + " " + units[i];
}


function formatNumber(n) {

    if (!Number.isFinite(n)) return "--";

    return new Intl.NumberFormat("pt-BR").format(n);

}


function formatSeconds(seconds) {

    if (!seconds) return "--";

    const d = Math.floor(seconds / 86400);

    seconds %= 86400;

    const h = Math.floor(seconds / 3600);

    seconds %= 3600;

    const m = Math.floor(seconds / 60);

    const s = Math.floor(seconds % 60);

    return `${d}d ${h}h ${m}m ${s}s`;

}


/* =========================================================
   ATUALIZA DASHBOARD
========================================================= */

function updateDashboard(metrics) {

    lastData = metrics;

    const ha =
        value(metrics, "cloudflared_tunnel_ha_connections");

    const requests =
        value(metrics, "cloudflared_tunnel_total_requests");

    const errors =
        value(metrics, "cloudflared_tunnel_request_errors");

    const concurrent =
        value(metrics, "cloudflared_tunnel_concurrent_requests_per_tunnel");

    document.getElementById("tunnelStatus").textContent =
        ha > 0 ? "ONLINE" : "OFFLINE";

    document.getElementById("haConnections").textContent =
        formatNumber(ha);

    document.getElementById("requests").textContent =
        formatNumber(requests);

    document.getElementById("errors").textContent =
        formatNumber(errors);

    document.getElementById("concurrent").textContent =
        formatNumber(concurrent);


    /* STATUS */

    const dot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");

    if (ha > 0) {

        dot.classList.add("online");
        statusText.textContent = "Cloudflared conectado";

    } else {

        dot.classList.remove("online");
        statusText.textContent = "Túnel offline";

    }


    /* VERSION */

    const build = metrics["build_info"];

    if (build && build[0]) {

        document.getElementById("version").textContent =
            build[0].labels.version || "--";

        document.getElementById("goVersion").textContent =
            build[0].labels.goversion || "--";

    }


    document.getElementById("goroutines").textContent =
        formatNumber(value(metrics, "go_goroutines"));

    document.getElementById("threads").textContent =
        formatNumber(value(metrics, "go_threads"));

    document.getElementById("gomaxprocs").textContent =
        formatNumber(value(metrics, "go_sched_gomaxprocs_threads"));


    /* MEMÓRIA */

    document.getElementById("memory").textContent =
        formatBytes(value(metrics, "process_resident_memory_bytes"));

    document.getElementById("heap").textContent =
        formatBytes(value(metrics, "go_memstats_heap_alloc_bytes"));

    document.getElementById("heapObjects").textContent =
        formatNumber(value(metrics, "go_memstats_heap_objects"));

    document.getElementById("fds").textContent =
        formatNumber(value(metrics, "process_open_fds"));

    document.getElementById("cpu").textContent =
        value(metrics, "process_cpu_seconds_total").toFixed(2) + " s";


    /* UPTIME */

    const start =
        value(metrics, "process_start_time_seconds");

    if (start) {

        const uptime =
            Date.now() / 1000 - start;

        document.getElementById("uptime").textContent =
            "Uptime: " + formatSeconds(uptime);

    }


    /* TUNNEL */

    document.getElementById("tcpSessions").textContent =
        formatNumber(value(metrics, "cloudflared_tcp_total_sessions"));

    document.getElementById("udpSessions").textContent =
        formatNumber(value(metrics, "cloudflared_udp_total_sessions"));

    document.getElementById("http200").textContent =
        formatNumber(
            value(
                metrics,
                "cloudflared_tunnel_response_by_code",
                {status_code:"200"}
            )
        );

    document.getElementById("http404").textContent =
        formatNumber(
            value(
                metrics,
                "cloudflared_tunnel_response_by_code",
                {status_code:"404"}
            )
        );

    document.getElementById("configPushes").textContent =
        formatNumber(
            value(metrics, "cloudflared_config_local_config_pushes")
        );

    document.getElementById("configErrors").textContent =
        formatNumber(
            value(metrics, "cloudflared_config_local_config_pushes_errors")
        );

    document.getElementById("registers").textContent =
        formatNumber(
            value(
                metrics,
                "cloudflared_tunnel_tunnel_register_success",
                {rpcName:"registerConnection"}
            )
        );


    /* CONEXÕES */

    renderConnections(metrics);


    /* GRÁFICOS */

    updateCharts(metrics);


    /* TABELA */

    renderTable(metrics);

}


/* =========================================================
   CONEXÕES
========================================================= */

// function renderConnections(metrics) {

//     const container =
//         document.getElementById("connections");

//     container.innerHTML = "";

//     const locations =
//         metrics["cloudflared_tunnel_server_locations"] || [];

//     const rtts =
//         metrics["quic_client_latest_rtt"] || [];

//     if (!locations.length) {

//         container.innerHTML =
//             '<div class="connection">Nenhuma conexão encontrada.</div>';

//         return;

//     }

//     locations.forEach(item => {

//         const id = item.labels.connection_id;

//         const location = item.labels.edge_location;

//         const rtt =
//             value(
//                 metrics,
//                 "quic_client_latest_rtt",
//                 {conn_index:id}
//             );

//         const minRtt =
//             value(
//                 metrics,
//                 "quic_client_min_rtt",
//                 {conn_index:id}
//             );

//         const mtu =
//             value(
//                 metrics,
//                 "quic_client_mtu",
//                 {conn_index:id}
//             );

//         const sent =
//             value(
//                 metrics,
//                 "quic_client_sent_bytes",
//                 {conn_index:id}
//             );

//         const received =
//             value(
//                 metrics,
//                 "quic_client_receive_bytes",
//                 {conn_index:id}
//             );

//         const width =
//             Math.min(100, Math.max(5, rtt));

//         container.innerHTML += `

//             <div class="connection">

//                 <div class="connection-head">

//                     <span class="connection-id">
//                         Conexão #${id}
//                     </span>

//                     <span class="connection-status"></span>

//                 </div>

//                 <div class="location">
//                     ${location}
//                 </div>

//                 <small>
//                     RTT atual: <b>${rtt} ms</b>
//                 </small>

//                 <br>

//                 <small>
//                     RTT mínimo: ${minRtt} ms
//                 </small>

//                 <br>

//                 <small>
//                     MTU: ${mtu} bytes
//                 </small>

//                 <br>

//                 <small>
//                     ↑ ${formatBytes(sent)}
//                     &nbsp; ↓ ${formatBytes(received)}
//                 </small>

//                 <div class="rtt">
//                     <div
//                         class="rtt-bar"
//                         style="width:${width}%">
//                     </div>
//                 </div>

//             </div>

//         `;

//     });

// }


function renderConnections(metrics) {

    const container = document.getElementById("connections");
    container.innerHTML = "";

    const locations =
        metrics["cloudflared_tunnel_server_locations"] || [];

    if (!locations.length) {
        container.innerHTML =
            '<div class="connection">Nenhuma conexão encontrada.</div>';
        return;
    }

    // Agrupa os edge locations por conexão
    const connections = {};

    locations.forEach(item => {

        const id = item.labels.connection_id;
        const location = item.labels.edge_location;

        if (!connections[id]) {
            connections[id] = {
                id,
                locations: []
            };
        }

        if (!connections[id].locations.includes(location)) {
            connections[id].locations.push(location);
        }
    });

    Object.values(connections).forEach(conn => {

        const id = conn.id;

        const rtt = value(
            metrics,
            "quic_client_latest_rtt",
            { conn_index: id }
        );

        const minRtt = value(
            metrics,
            "quic_client_min_rtt",
            { conn_index: id }
        );

        const mtu = value(
            metrics,
            "quic_client_mtu",
            { conn_index: id }
        );

        const sent = value(
            metrics,
            "quic_client_sent_bytes",
            { conn_index: id }
        );

        const received = value(
            metrics,
            "quic_client_receive_bytes",
            { conn_index: id }
        );

        const width =
            Math.min(100, Math.max(5, rtt));

        container.innerHTML += `

            <div class="connection">

                <div class="connection-head">

                    <span class="connection-id">
                        Conexão #${id}
                    </span>

                    <span class="connection-status"></span>

                </div>

                <div class="location">
                    ${conn.locations.join(" • ")}
                </div>

                <small>
                    RTT atual: <b>${rtt} ms</b>
                </small>

                <br>

                <small>
                    RTT mínimo: ${minRtt} ms
                </small>

                <br>

                <small>
                    MTU: ${mtu} bytes
                </small>

                <br>

                <small>
                    ↑ ${formatBytes(sent)}
                    &nbsp; ↓ ${formatBytes(received)}
                </small>

                <div class="rtt">
                    <div
                        class="rtt-bar"
                        style="width:${width}%">
                    </div>
                </div>

            </div>
        `;
    });
}


/* =========================================================
   GRÁFICOS
========================================================= */

function updateCharts(metrics) {

    const sent =
        sumMetric(metrics, "quic_client_sent_bytes");

    const received =
        sumMetric(metrics, "quic_client_receive_bytes");

    const rtts =
        metrics["quic_client_smoothed_rtt"] || [];

    const avgRtt =
        rtts.length
        ? rtts.reduce((a,b)=>a+b.value,0) / rtts.length
        : 0;

    history.traffic.push({
        sent,
        received
    });

    history.rtt.push(avgRtt);

    if (history.traffic.length > 30)
        history.traffic.shift();

    if (history.rtt.length > 30)
        history.rtt.shift();

    drawTrafficChart();
    drawRttChart();

}


function sumMetric(metrics, name) {

    if (!metrics[name]) return 0;

    return metrics[name]
        .reduce((sum, item) => sum + item.value, 0);

}


/* =========================================================
   CANVAS TRAFFIC
========================================================= */

function drawTrafficChart() {

    const canvas =
        document.getElementById("trafficChart");

    const ctx =
        canvas.getContext("2d");

    const width =
        canvas.clientWidth;

    const height =
        canvas.clientHeight;

    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0,0,width,height);

    drawGrid(ctx,width,height);

    if (history.traffic.length < 2) return;

    const max =
        Math.max(
            1,
            ...history.traffic.flatMap(x =>
                [x.sent,x.received]
            )
        );

    drawLine(
        ctx,
        history.traffic.map(x => x.sent),
        max,
        width,
        height
    );

    drawLine(
        ctx,
        history.traffic.map(x => x.received),
        max,
        width,
        height
    );

    ctx.fillStyle = "#8c96a8";
    ctx.font = "12px Arial";

    ctx.fillText("↑ Enviado / ↓ Recebido",10,18);

}


function drawRttChart() {

    const canvas =
        document.getElementById("rttChart");

    const ctx =
        canvas.getContext("2d");

    const width =
        canvas.clientWidth;

    const height =
        canvas.clientHeight;

    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0,0,width,height);

    drawGrid(ctx,width,height);

    if (history.rtt.length < 2) return;

    const max =
        Math.max(10, ...history.rtt) * 1.2;

    drawLine(
        ctx,
        history.rtt,
        max,
        width,
        height
    );

    ctx.fillStyle = "#8c96a8";
    ctx.font = "12px Arial";

    ctx.fillText("RTT médio das conexões",10,18);

}


function drawGrid(ctx,width,height) {

    ctx.strokeStyle =
        "rgba(255,255,255,.06)";

    ctx.lineWidth = 1;

    for (let i=1;i<5;i++) {

        const y =
            (height / 5) * i;

        ctx.beginPath();

        ctx.moveTo(0,y);
        ctx.lineTo(width,y);

        ctx.stroke();

    }

}


function drawLine(ctx,data,max,width,height) {

    if (!data.length) return;

    ctx.beginPath();

    data.forEach((value,index)=>{

        const x =
            data.length === 1
            ? 0
            : (index/(data.length-1))*width;

        const y =
            height -
            (value/max)*(height-25);

        if (index === 0)
            ctx.moveTo(x,y);
        else
            ctx.lineTo(x,y);

    });

    ctx.strokeStyle = "#5b8cff";
    ctx.lineWidth = 2;

    ctx.stroke();

}


/* =========================================================
   TABELA
========================================================= */

function renderTable(metrics) {

    const tbody =
        document.getElementById("metricsTable");

    tbody.innerHTML = "";

    Object.keys(metrics)
        .sort()
        .forEach(name => {

            metrics[name].forEach(item => {

                const labels =
                    Object.entries(item.labels)
                    .map(([k,v]) => `${k}="${v}"`)
                    .join(", ");

                const tr =
                    document.createElement("tr");

                tr.innerHTML = `

                    <td>${escapeHtml(name)}</td>

                    <td>${escapeHtml(item.type || "")}</td>

                    <td>${escapeHtml(labels)}</td>

                    <td>${item.value}</td>

                `;

                tbody.appendChild(tr);

            });

        });

}


function escapeHtml(text) {

    return String(text)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");

}


/* =========================================================
   BUSCAR MÉTRICAS
========================================================= */

async function fetchMetrics() {

    try {

        const response =
            await fetch(
                METRICS_URL,
                {
                    cache: "no-store"
                }
            );

        if (!response.ok)
            throw new Error("HTTP " + response.status);

        const text =
            await response.text();

        const metrics =
            parsePrometheus(text);

        updateDashboard(metrics);

    } catch (error) {

        console.error(error);

        document.getElementById("statusDot")
            .classList.remove("online");

        document.getElementById("statusText")
            .textContent = "Não foi possível conectar";

        document.getElementById("tunnelStatus")
            .textContent = "OFFLINE";

    }

}


const MONTHS = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function formatLogDate(line) {
    // Captura: [Sun Sep 13 07:24:46 2026]
    return line.replace(
        /\[[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{4})\]/,
        (match, mon, day, time, year) => {
            const month = MONTHS[mon] || '00';
            const dayPadded = day.padStart(2, '0');
            return `[${dayPadded}/${month}/${year} ${time}]`;
        }
    );
}



let lastLogCount = 0;

async function fetcLogsProject() {

    try {

        const response = await fetch(LOGS_URL, { cache: "no-store" });

        if (!response.ok) throw new Error("HTTP " + response.status);

        const text = await response.json();

        if (text.isOnline === true) {
            document.getElementById("status_online_projetct").classList.add("logs_online");
            document.getElementById("status_online_projetct").textContent = "Online";
        } else {
            document.getElementById("status_online_projetct").classList.remove("logs_online");
            document.getElementById("status_online_projetct").textContent = "OFFLINE";
        }

        renderProjectLogs(text.logs);

    } catch (error) {

        console.error(error);

        document.getElementById("status_online_projetct").classList.remove("logs_online");
        document.getElementById("status_online_projetct").textContent = "OFFLINE";

    }

}

function renderProjectLogs(logs) {

    const container = document.querySelector(".scrolllogs");

    if (!logs || !logs.length) {
        container.innerHTML = '<div class="log-empty">Nenhum log ainda.</div>';
        lastLogCount = 0;
        return;
    }

    if (logs.length < lastLogCount) {
        container.innerHTML = "";
        lastLogCount = 0;
    }

    const wasAtBottom =
        container.scrollHeight - container.scrollTop <= container.clientHeight + 30;

    const newLines = logs.slice(lastLogCount);

    // newLines.forEach(line => {
    //     const div = document.createElement('div');
    //     div.className = classifyLogLine(line);
    //     div.textContent = line;
    //     container.appendChild(div);

    //     if (container.children.length > 150) {
    //         container.removeChild(container.firstChild);
    //     }
    // });

    newLines.forEach(line => {
        const formattedLine = formatLogDate(line);
        const div = document.createElement('div');
        div.className = classifyLogLine(line); // classifica com a linha original (regex de status continua igual)
        div.textContent = formattedLine;        // exibe já formatada
        container.appendChild(div);

        if (container.children.length > 150) {
            container.removeChild(container.firstChild);
        }
    });

    
    lastLogCount = logs.length;

    if (wasAtBottom) container.scrollTop = container.scrollHeight;

}

function classifyLogLine(line) {
    if (/\[(2\d\d)\]/.test(line)) return "log-line log-ok";
    if (/\[(4\d\d|5\d\d)\]/.test(line)) return "log-line log-error";
    if (/started at|Listening on|Iniciando projeto/i.test(line)) return "log-line log-start";
    if (/error|erro|fatal/i.test(line)) return "log-line log-fatal";
    return "log-line";
}


/* =========================================================
   START
========================================================= */

fetchMetrics();
fetcLogsProject();

setInterval(() => {
    fetchMetrics();
    fetcLogsProject();
}, 3000);


window.addEventListener(
    "resize",
    () => {

        if (lastData)
            updateCharts(lastData);

    }
);