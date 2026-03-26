import { createMap } from "./map.js";
import {
  buildCountryAliases,
  formatSignedNumber,
  formatWealthBillions,
  parseNumber,
  normalizeCountryName
} from "./utils.js";

const DATA_PATHS = {
  migration2025: "./data/country_millionaire_migration_2025.csv",
  migrationByYear: "./data/global_millionaire_migration_by_year.csv",
  wealthMarkets: "./data/fastest_growing_wealth_markets.csv",
  cities: "./data/top_50_cities_centi_millionaires.csv",
  worldGeoJson: "./data/world.geojson"
};

const aliases = buildCountryAliases();
const statusMessage = document.querySelector("#status-message");
const countrySummary = document.querySelector("#country-summary");
const takeawaysContainer = document.querySelector("#key-takeaways");
const countrySelect = document.querySelector("#country-select");
const chartContainer = d3.select("#yearly-chart");
const metricInputs = document.querySelectorAll('input[name="metric"]');

const mapView = createMap({
  containerSelector: "#map-container",
  tooltipSelector: "#tooltip",
  resetButtonSelector: "#reset-map",
  onCountryClick: handleCountrySelection
});

const appState = {
  selectedCountry: null,
  countryMetrics: new Map(),
  yearlyData: []
};

initializeApp();

async function initializeApp() {
  try {
    updateStatus("Loading CSV and GeoJSON files...");

    const [migrationRows, migrationByYearRows, wealthRows, cityRows, worldGeoJson] = await Promise.all([
      d3.csv(DATA_PATHS.migration2025, parseMigrationRow),
      d3.csv(DATA_PATHS.migrationByYear, parseYearlyMigrationRow),
      d3.csv(DATA_PATHS.wealthMarkets, parseWealthRow),
      d3.csv(DATA_PATHS.cities, parseCityRow),
      d3.json(DATA_PATHS.worldGeoJson)
    ]);

    if (!worldGeoJson || !Array.isArray(worldGeoJson.features) || worldGeoJson.features.length === 0) {
      throw new Error("Local world GeoJSON is missing or empty.");
    }

    const countryMetrics = buildCountryMetricsMap(migrationRows, wealthRows);
    const defaultCountry = getDefaultCountry(countryMetrics);

    appState.countryMetrics = countryMetrics;
    appState.yearlyData = migrationByYearRows.sort((a, b) => d3.ascending(a.year, b.year));

    mapView.render(worldGeoJson, countryMetrics);
    populateCountrySelect(countryMetrics);
    renderTakeaways(countryMetrics, appState.yearlyData);
    renderYearlyChart(appState.yearlyData);
    wireControls();
    handleCountrySelection(defaultCountry, { syncMap: true });

    updateStatus(
      `Loaded ${migrationRows.length} country records, ${migrationByYearRows.length} yearly records, and ${cityRows.length} city records.`
    );
  } catch (error) {
    console.error("Failed to initialize visualization:", error);

    mapView.showEmptyState(
      "The visualization could not load. Make sure you open the project through a local web server and check the browser console for details."
    );

    updateStatus("Loading failed. The world map data could not be loaded.");
  }
}

function wireControls() {
  metricInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      mapView.updateMetric(event.target.value);
      updateStatus(`Map metric changed to ${event.target.value === "wealth" ? "migrating wealth" : "net migration"}.`);
    });
  });

  if (countrySelect) {
    countrySelect.addEventListener("change", (event) => {
      const countryName = event.target.value || null;
      handleCountrySelection(countryName, { syncMap: true });
    });
  }
}

function handleCountrySelection(countryName, options = {}) {
  const { syncMap = false } = options;

  appState.selectedCountry = countryName;
  renderCountrySummary(countryName);

  if (syncMap) {
    mapView.setActiveCountry(countryName);
  }

  if (countrySelect && countrySelect.value !== (countryName || "")) {
    countrySelect.value = countryName || "";
  }

  if (!countryName) {
    updateStatus("Country selection cleared.");
    return;
  }

  updateStatus(`${countryName} selected. Review the side panel for migration and wealth details.`);
}

function populateCountrySelect(countryMetrics) {
  if (!countrySelect) {
    return;
  }

  const countryNames = Array.from(countryMetrics.keys()).sort(d3.ascending);

  countryNames.forEach((countryName) => {
    const option = document.createElement("option");
    option.value = countryName;
    option.textContent = countryName;
    countrySelect.appendChild(option);
  });
}

function renderTakeaways(countryMetrics, yearlyData) {
  if (!takeawaysContainer) {
    return;
  }

  const metrics = Array.from(countryMetrics.values()).filter((d) => d.netMigration !== null && d.netMigration !== undefined);
  const gainers = metrics.filter((d) => d.netMigration > 0);
  const losers = metrics.filter((d) => d.netMigration < 0);
  const topGainer = d3.greatest(gainers, (d) => d.netMigration);
  const topLoser = d3.least(losers, (d) => d.netMigration);
  const topWealth = d3.greatest(metrics, (d) => d.wealthBillions ?? -Infinity);
  const latestYear = yearlyData.at(-1);

  takeawaysContainer.innerHTML = `
    <h3>Key Takeaways</h3>
    <p>The map highlights where wealthy residents are concentrating and where wealth is leaving.</p>
    <ul>
      <li><strong>Top net inflow:</strong> ${topGainer ? `${topGainer.country} (${formatSignedNumber(topGainer.netMigration)})` : "N/A"}</li>
      <li><strong>Largest net outflow:</strong> ${topLoser ? `${topLoser.country} (${formatSignedNumber(topLoser.netMigration)})` : "N/A"}</li>
      <li><strong>Most migrating wealth:</strong> ${topWealth ? `${topWealth.country} (${formatWealthBillions(topWealth.wealthBillions)})` : "N/A"}</li>
      <li><strong>Latest yearly total:</strong> ${latestYear ? `${formatInteger(latestYear.migratingMillionaires)} in ${latestYear.year}` : "N/A"}</li>
    </ul>
  `;
}

function renderCountrySummary(countryName) {
  if (!countrySummary) {
    return;
  }

  if (!countryName) {
    countrySummary.innerHTML = `
      <h3>Select a country</h3>
      <p>Choose a country to compare its 2025 millionaire migration result with its broader wealth profile and long-term growth.</p>
    `;
    return;
  }

  const metric = appState.countryMetrics.get(countryName);

  if (!metric) {
    countrySummary.innerHTML = `
      <h3>${countryName}</h3>
      <p>This country appears on the world map, but the current millionaire dataset does not include a matching country summary row.</p>
    `;
    return;
  }

  countrySummary.innerHTML = `
    <h3>${countryName}</h3>
    <p>${buildCountryNarrative(metric)}</p>
    <div class="detail-grid">
      ${buildStatCard("Net migration", formatSignedNumber(metric.netMigration))}
      ${buildStatCard("Migrating wealth", formatWealthBillions(metric.wealthBillions))}
      ${buildStatCard("Growth 2014-2024", formatPercent(metric.growthPct))}
      ${buildStatCard("Millionaires", formatInteger(metric.millionairePopulation))}
      ${buildStatCard("Centi-millionaires", formatInteger(metric.centiMillionaires))}
      ${buildStatCard("Billionaires", formatInteger(metric.billionaires))}
    </div>
  `;
}

function buildCountryNarrative(metric) {
  const netMigration = metric.netMigration ?? 0;
  const growthText = metric.growthPct === null || metric.growthPct === undefined
    ? "its recent wealth growth is not available in this dataset"
    : `its millionaire population changed by ${formatPercent(metric.growthPct)} from 2014 to 2024`;
  const wealthText = metric.wealthBillions === null || metric.wealthBillions === undefined
    ? "The dataset does not estimate moving wealth for this country."
    : `The estimated wealth moving with these millionaires is ${formatWealthBillions(metric.wealthBillions)}.`;

  if (netMigration > 0) {
    return `This country is a net gainer of millionaires in 2025, which suggests it is attracting wealthy residents. ${wealthText} At the same time, ${growthText}.`;
  }

  if (netMigration < 0) {
    return `This country is a net loser of millionaires in 2025, which suggests wealthy residents are moving elsewhere. ${wealthText} At the same time, ${growthText}.`;
  }

  return `This country is approximately balanced in millionaire migration based on the available 2025 data. ${wealthText} At the same time, ${growthText}.`;
}

function buildStatCard(label, value) {
  return `
    <div class="detail-stat">
      <span class="detail-stat-label">${label}</span>
      <span class="detail-stat-value">${value}</span>
    </div>
  `;
}

function renderYearlyChart(data) {
  chartContainer.selectAll("*").remove();

  const width = 320;
  const height = 220;
  const margin = { top: 12, right: 14, bottom: 34, left: 48 };

  const svg = chartContainer
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const xScale = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.year))
    .range([margin.left, width - margin.right]);

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.migratingMillionaires) || 0])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const lineGenerator = d3
    .line()
    .x((d) => xScale(d.year))
    .y((d) => yScale(d.migratingMillionaires));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(Math.min(data.length, 6)).tickFormat(d3.format("d")));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(yScale).ticks(5).tickFormat((value) => `${Math.round(value / 1000)}k`));

  svg
    .append("path")
    .datum(data)
    .attr("class", "year-line")
    .attr("d", lineGenerator)
    .attr("stroke-dasharray", function () {
      const length = this.getTotalLength();
      return `${length} ${length}`;
    })
    .attr("stroke-dashoffset", function () {
      return this.getTotalLength();
    })
    .transition()
    .duration(1000)
    .attr("stroke-dashoffset", 0);

  svg
    .selectAll(".year-point")
    .data(data)
    .join("circle")
    .attr("class", "year-point")
    .attr("cx", (d) => xScale(d.year))
    .attr("cy", (d) => yScale(d.migratingMillionaires))
    .attr("r", 0)
    .append("title")
    .text((d) => `${d.year}: ${formatInteger(d.migratingMillionaires)} migrating millionaires (${d.status})`);

  svg
    .selectAll(".year-point")
    .transition()
    .delay((_, i) => i * 70)
    .duration(350)
    .attr("r", 4);
}

function buildCountryMetricsMap(migrationRows, wealthRows) {
  const metricsMap = new Map();

  migrationRows.forEach((row) => {
    metricsMap.set(row.country, {
      country: row.country,
      netMigration: row.netMigration,
      wealthBillions: row.wealthBillions,
      growthPct: row.growthPct
    });
  });

  wealthRows.forEach((row) => {
    const existingMetric = metricsMap.get(row.country) || { country: row.country };

    metricsMap.set(row.country, {
      ...existingMetric,
      millionairePopulation: row.millionaires,
      centiMillionaires: row.centiMillionaires,
      billionaires: row.billionaires,
      growthPct: row.growthPct ?? existingMetric.growthPct ?? null
    });
  });

  return metricsMap;
}

function getDefaultCountry(countryMetrics) {
  const countries = Array.from(countryMetrics.values());
  const topGainer = d3.greatest(countries, (d) => d.netMigration ?? -Infinity);
  return topGainer?.country ?? null;
}

function parseMigrationRow(row) {
  return {
    country: normalizeCountryName(row.country, aliases),
    netMigration: parseNumber(row.net_millionaire_migration_2025),
    wealthBillions: parseNumber(row.estimated_migrating_wealth_usd_bn),
    growthPct: parseNumber(row.millionaire_growth_pct_2014_2024)
  };
}

function parseYearlyMigrationRow(row) {
  return {
    year: parseNumber(row.year),
    migratingMillionaires: parseNumber(row.migrating_millionaires),
    status: row.status
  };
}

function parseWealthRow(row) {
  return {
    country: normalizeCountryName(row.country, aliases),
    growthPct: parseNumber(row.millionaire_growth_pct_2014_2024),
    millionaires: parseNumber(row.millionaires_usd_1m_plus),
    centiMillionaires: parseNumber(row.centi_millionaires_usd_100m_plus),
    billionaires: parseNumber(row.billionaires_usd_1bn_plus)
  };
}

function parseCityRow(row) {
  return {
    city: row.city,
    country: normalizeCountryName(row.country, aliases),
    centiMillionaires: parseNumber(row.centi_millionaires_usd_100m_plus)
  };
}

function formatInteger(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return d3.format(",d")(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return `${d3.format("+.0f")(value)}%`;
}

function updateStatus(message) {
  if (statusMessage) {
    statusMessage.textContent = message;
  }
}
