const DAYS = 60;


/* ===============================
   GENERATE HISTORICAL DATA
================================ */

function genSeries(
  base,
  trendPerDay,
  noise,
  seasonAmp = 0,
  seasonPeriod = 7
) {

  const arr = [];

  for (let i = 0; i < DAYS; i++) {

    const season =
      seasonAmp *
      Math.sin(
        (2 * Math.PI * i) / seasonPeriod
      );

    const value =
      base +
      trendPerDay * i +
      season +
      (Math.random() - 0.5) * noise;

    arr.push(
      Math.max(
        0,
        Math.round(value * 10) / 10
      )
    );
  }

  return arr;
}


/* ===============================
   RESOURCES
================================ */

const RESOURCES = {

  cpu: {
    label: "CPU Utilization",
    unit: "%",
    cap: 100,
    color: "#9B7BFF",
    data: genSeries(48, 0.35, 4, 5)
  },

  memory: {
    label: "Memory Usage",
    unit: "%",
    cap: 100,
    color: "#FF7BD8",
    data: genSeries(55, 0.28, 3.5, 4)
  },

  storage: {
    label: "Storage Used",
    unit: "GB",
    cap: 2000,
    color: "#4ADE9E",
    data: genSeries(900, 9, 15, 0)
  },

  network: {
    label: "Network Throughput",
    unit: "Mbps",
    cap: 1000,
    color: "#FFC15E",
    data: genSeries(320, 3.5, 30, 40)
  },

  cost: {
    label: "Daily Cloud Spend",
    unit: "$",
    cap: 400,
    color: "#FF6B6B",
    data: genSeries(180, 1.6, 8, 0)
  }

};


/* ===============================
   LINEAR REGRESSION
================================ */

function linearRegression(y) {

  const n = y.length;

  const xMean = (n - 1) / 2;

  const yMean =
    y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;

  for (let i = 0; i < n; i++) {

    num +=
      (i - xMean) *
      (y[i] - yMean);

    den +=
      (i - xMean) ** 2;
  }

  const slope = num / den;

  const intercept =
    yMean - slope * xMean;


  let ssRes = 0;

  for (let i = 0; i < n; i++) {

    const prediction =
      intercept + slope * i;

    ssRes +=
      (y[i] - prediction) ** 2;
  }


  const stdErr =
    Math.sqrt(
      ssRes / (n - 2)
    );


  let ssTot = 0;

  for (let i = 0; i < n; i++) {

    ssTot +=
      (y[i] - yMean) ** 2;
  }


  const r2 =
    1 - ssRes / ssTot;


  return {
    slope,
    intercept,
    stdErr,
    r2
  };
}


/* ===============================
   FORECAST
================================ */

function forecast(data, horizon, cap) {

  const {
    slope,
    intercept,
    stdErr,
    r2
  } = linearRegression(data);

  const n = data.length;

  const preds = [];


  for (let i = 0; i < horizon; i++) {

    const x = n + i;

    let value =
      intercept + slope * x;

    value = Math.max(0, value);


    preds.push({

      value:
        Math.round(value * 10) / 10,

      upper:
        Math.round(
          (value + 1.6 * stdErr) * 10
        ) / 10,

      lower:
        Math.max(
          0,
          Math.round(
            (value - 1.6 * stdErr) * 10
          ) / 10
        )

    });

  }


  const daysToBreach =
    slope > 0
      ? Math.max(
          0,
          Math.ceil(
            (cap - data[n - 1]) / slope
          ) - n
        )
      : null;


  return {
    preds,
    slope,
    r2,
    stdErr,
    daysToBreach
  };
}


/* ===============================
   RESOURCE STATUS
================================ */

function statusFor(pct) {

  if (pct >= 90)
    return "crit";

  if (pct >= 70)
    return "warn";

  return "safe";
}


/* ===============================
   OVERVIEW
================================ */

function buildOverview() {

  const cards =
    document.getElementById(
      "resourceCards"
    );

  const recBody =
    document.getElementById(
      "recBody"
    );


  cards.innerHTML = "";

  recBody.innerHTML = "";


  let maxPeakPct = 0;


  Object.entries(
    RESOURCES
  ).forEach(([key, resource]) => {

    const current =
      resource.data[
        resource.data.length - 1
      ];


    const fc =
      forecast(
        resource.data,
        7,
        resource.cap
      );


    const peak7 =
      Math.max(
        ...fc.preds.map(
          p => p.value
        )
      );


    const pctPeak =
      Math.min(
        100,
        (peak7 / resource.cap) * 100
      );


    maxPeakPct =
      Math.max(
        maxPeakPct,
        pctPeak
      );


    const status =
      statusFor(pctPeak);


    const card =
      document.createElement(
        "div"
      );


    card.className = "card";


    card.innerHTML = `

      <div class="card-top">

        <span class="res-name">
          ${resource.label}
        </span>

        <span class="res-badge badge-${status}">
          ${
            status === "crit"
              ? "At risk"
              : status === "warn"
              ? "Watch"
              : "Healthy"
          }
        </span>

      </div>


      <div class="res-value">
        ${current}${resource.unit}
      </div>


      <div class="res-forecast">

        7d forecast:

        <b>
          ${peak7}${resource.unit}
        </b>

        (
        ${fc.slope >= 0 ? "+" : ""}
        ${(fc.slope * 7).toFixed(1)}
        ${resource.unit}/wk
        )

      </div>


      <div class="bar-track">

        <div
          class="bar-fill"
          style="
            width:${pctPeak}%;
            background:${resource.color};
          "
        ></div>

      </div>
    `;


    cards.appendChild(card);


    if (
      fc.daysToBreach !== null &&
      fc.daysToBreach <= 30
    ) {

      const priority =
        fc.daysToBreach <= 7
          ? "crit"
          : "warn";


      const action =
        key === "cost"
          ? "Review budget / right-size instances"
          : key === "storage"
          ? "Provision additional storage volume"
          : "Scale out cluster capacity";


      recBody.innerHTML += `

        <tr>

          <td>
            ${resource.label}
          </td>

          <td>
            ~${fc.daysToBreach} days
          </td>

          <td>
            ${action}
          </td>

          <td>

            <span class="tag badge-${priority}">
              ${
                priority === "crit"
                  ? "High"
                  : "Medium"
              }
            </span>

          </td>

        </tr>

      `;
    }

  });


  if (!recBody.innerHTML) {

    recBody.innerHTML = `

      <tr>

        <td
          colspan="4"
          style="
            text-align:center;
            color:var(--muted);
            padding:20px;
          "
        >

          No thresholds projected
          to breach within 30 days

        </td>

      </tr>

    `;
  }


  document.getElementById(
    "heroPeak"
  ).innerHTML =

    Math.round(maxPeakPct) +

    '<span> % cluster capacity</span>';
}


buildOverview();


/* ===============================
   NAVIGATION
================================ */

function goTo(page) {

  document
    .querySelectorAll(".page")
    .forEach(pageElement => {

      pageElement.classList.remove(
        "active"
      );

    });


  document
    .getElementById(
      "page-" + page
    )
    .classList.add("active");


  document
    .querySelectorAll(
      "nav.tabs button"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });

}


document
  .querySelectorAll(
    "nav.tabs button"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => goTo(
        button.dataset.page
      )
    );

  });


/* ===============================
   FORECAST PAGE
================================ */

const resourceSelect =
  document.getElementById(
    "resourceSelect"
  );


Object.entries(
  RESOURCES
).forEach(([key, resource]) => {

  resourceSelect.innerHTML += `

    <option value="${key}">
      ${resource.label}
    </option>

  `;

});


let selectedResource = "cpu";

let horizon = 7;

let forecastChart = null;


/* ===============================
   RENDER CHART
================================ */

function renderForecast() {

  const resource =
    RESOURCES[selectedResource];


  const fc =
    forecast(
      resource.data,
      horizon,
      resource.cap
    );


  document.getElementById(
    "chartTitle"
  ).textContent =

    `${resource.label} — history + ${horizon}-day forecast`;


  const histLabels =
    resource.data.map(
      (_, i) => `D-${DAYS - i}`
    );


  const futureLabels =
    fc.preds.map(
      (_, i) => `D+${i + 1}`
    );


  const labels = [
    ...histLabels,
    ...futureLabels
  ];


  const historical =
    [
      ...resource.data,
      ...Array(horizon).fill(null)
    ];


  const predicted =
    [
      ...Array(DAYS - 1).fill(null),
      resource.data[DAYS - 1],
      ...fc.preds.map(
        p => p.value
      )
    ];


  const upper =
    [
      ...Array(DAYS - 1).fill(null),
      resource.data[DAYS - 1],
      ...fc.preds.map(
        p => p.upper
      )
    ];


  const lower =
    [
      ...Array(DAYS - 1).fill(null),
      resource.data[DAYS - 1],
      ...fc.preds.map(
        p => p.lower
      )
    ];


  const canvas =
    document.getElementById(
      "forecastChart"
    );


  if (forecastChart) {

    forecastChart.destroy();

  }


  forecastChart =
    new Chart(
      canvas,
      {

        type: "line",

        data: {

          labels,

          datasets: [

            {
              label: "Upper bound",

              data: upper,

              borderColor:
                "transparent",

              backgroundColor:
                "rgba(255,123,216,0.12)",

              fill: "+1",

              pointRadius: 0,

              tension: 0.3
            },


            {
              label: "Lower bound",

              data: lower,

              borderColor:
                "transparent",

              backgroundColor:
                "rgba(255,123,216,0.12)",

              fill: false,

              pointRadius: 0,

              tension: 0.3
            },


            {
              label: "Predicted",

              data: predicted,

              borderColor:
                "#FF7BD8",

              borderWidth: 2.5,

              borderDash: [
                5,
                4
              ],

              pointRadius: 0,

              tension: 0.3,

              fill: false
            },


            {
              label: "Historical",

              data: historical,

              borderColor:
                "#9B7BFF",

              backgroundColor:
                "rgba(155,123,255,0.10)",

              borderWidth: 2.5,

              pointRadius: 0,

              tension: 0.25,

              fill: true
            }

          ]

        },


        options: {

          responsive: true,

          interaction: {

            mode: "index",

            intersect: false

          },


          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              backgroundColor:
                "#1F1940",

              borderColor:
                "rgba(167,148,255,0.25)",

              borderWidth: 1

            }

          },


          scales: {

            x: {

              grid: {

                color:
                  "rgba(167,148,255,0.06)"

              },

              ticks: {

                color:
                  "#8A81B3",

                maxTicksLimit: 10

              }

            },


            y: {

              grid: {

                color:
                  "rgba(167,148,255,0.06)"

              },

              ticks: {

                color:
                  "#8A81B3"

              }

            }

          }

        }

      }
    );


  /* MODEL STATS */

  const statRow =
    document.getElementById(
      "statRow"
    );


  const breachText =

    fc.daysToBreach === null

      ? "No upward trend"

      : fc.daysToBreach <= 60

      ? `~${fc.daysToBreach} days`

      : "> 60 days";


  statRow.innerHTML = `

    <div class="stat">

      <div class="k">
        Trend / day
      </div>

      <div class="v">
        ${fc.slope >= 0 ? "+" : ""}
        ${fc.slope.toFixed(2)}
        ${resource.unit}
      </div>

    </div>


    <div class="stat">

      <div class="k">
        Model fit (R²)
      </div>

      <div class="v">
        ${fc.r2.toFixed(3)}
      </div>

    </div>


    <div class="stat">

      <div class="k">
        Std. error
      </div>

      <div class="v">
        ±${fc.stdErr.toFixed(1)}
        ${resource.unit}
      </div>

    </div>


    <div class="stat">

      <div class="k">
        Predicted cap breach
      </div>

      <div class="v">
        ${breachText}
      </div>

    </div>

  `;
}


/* ===============================
   EVENTS
================================ */

resourceSelect.addEventListener(
  "change",
  () => {

    selectedResource =
      resourceSelect.value;

    renderForecast();

  }
);


document
  .querySelectorAll(
    ".toggle-group button"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(
            ".toggle-group button"
          )
          .forEach(
            b =>
              b.classList.remove(
                "active"
              )
          );


        button.classList.add(
          "active"
        );


        horizon =
          parseInt(
            button.dataset.horizon
          );


        renderForecast();

      }
    );

  });


renderForecast();