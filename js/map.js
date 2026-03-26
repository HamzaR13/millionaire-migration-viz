import {
  buildCountryAliases,
  formatSignedNumber,
  formatWealthBillions,
  getCountryName,
  normalizeCountryName
} from "./utils.js";

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 560;

export function createMap({
  containerSelector,
  tooltipSelector,
  resetButtonSelector,
  onCountryClick
}) {
  const container = d3.select(containerSelector);
  const tooltip = d3.select(tooltipSelector);
  const resetButton = resetButtonSelector ? d3.select(resetButtonSelector) : null;

  const svg = container
    .append("svg")
    .attr("class", "map-svg")
    .attr("viewBox", `0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const rootLayer = svg.append("g").attr("class", "map-root");
  const countriesLayer = rootLayer.append("g").attr("class", "countries-layer");
  const legendLayer = svg.append("g").attr("class", "legend-layer");

  const projection = d3.geoNaturalEarth1();
  const pathGenerator = d3.geoPath(projection);
  const aliases = buildCountryAliases();

  let countryMetrics = new Map();
  let selectedMetric = "netMigration";
  let activeCountryName = null;

  const zoomBehavior = d3
    .zoom()
    .scaleExtent([1, 6])
    .translateExtent([
      [0, 0],
      [DEFAULT_WIDTH, DEFAULT_HEIGHT]
    ])
    .extent([
      [0, 0],
      [DEFAULT_WIDTH, DEFAULT_HEIGHT]
    ])
    .on("start", () => {
      container.classed("is-dragging", true);
    })
    .on("zoom", (event) => {
      rootLayer.attr("transform", event.transform);
    })
    .on("end", () => {
      container.classed("is-dragging", false);
    });

  svg.call(zoomBehavior);

  if (resetButton && !resetButton.empty()) {
    resetButton.on("click", () => {
      svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
    });
  }

  function resizeProjection(geojson) {
    projection.fitExtent(
      [
        [18, 24],
        [DEFAULT_WIDTH - 18, DEFAULT_HEIGHT - 72]
      ],
      geojson
    );
  }

  function showTooltip(event, datum) {
    const metric = countryMetrics.get(datum.countryName);
    const netMigrationLabel = formatSignedNumber(metric?.netMigration);
    const wealthLabel = formatWealthBillions(metric?.wealthBillions);
    const growthLabel = metric?.growthPct === null || metric?.growthPct === undefined
      ? "N/A"
      : `${d3.format("+.0f")(metric.growthPct)}%`;

    tooltip
      .html(
        `
          <strong>${datum.countryName}</strong>
          <div>Net migration: ${netMigrationLabel}</div>
          <div>Migrating wealth: ${wealthLabel}</div>
          <div>Growth (2014-2024): ${growthLabel}</div>
        `
      )
      .style("left", `${event.offsetX}px`)
      .style("top", `${event.offsetY}px`)
      .classed("is-visible", true);
  }

  function hideTooltip() {
    tooltip.classed("is-visible", false);
  }

  function getMetricValue(metric) {
    if (!metric) {
      return null;
    }

    return selectedMetric === "wealth" ? metric.wealthBillions : metric.netMigration;
  }

  function updateLegend(colorScale) {
    const legendX = 30;
    const legendY = DEFAULT_HEIGHT - 40;
    const legendWidth = 220;
    const legendHeight = 12;

    legendLayer.selectAll("*").remove();

    const gradientId = "map-legend-gradient";
    const defs = svg.selectAll("defs").data([null]).join("defs");
    const gradient = defs
      .selectAll(`#${gradientId}`)
      .data([null])
      .join("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    const gradientStops = colorScale.range().map((color, index, colors) => ({
      offset: `${(index / Math.max(colors.length - 1, 1)) * 100}%`,
      color
    }));

    gradient
      .selectAll("stop")
      .data(gradientStops)
      .join("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    legendLayer
      .append("text")
      .attr("class", "legend-title")
      .attr("x", legendX)
      .attr("y", legendY - 12)
      .text(selectedMetric === "wealth" ? "Migrating wealth" : "Net millionaire migration");

    legendLayer
      .append("rect")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("rx", 6)
      .attr("fill", `url(#${gradientId})`);

    const domainValues = colorScale.domain();
    const minValue = domainValues[0];
    const maxValue = domainValues[domainValues.length - 1];
    const formatter = selectedMetric === "wealth" ? formatWealthBillions : formatSignedNumber;

    legendLayer
      .append("text")
      .attr("class", "legend-label")
      .attr("x", legendX)
      .attr("y", legendY + 30)
      .text(formatter(minValue));

    legendLayer
      .append("text")
      .attr("class", "legend-label")
      .attr("x", legendX + legendWidth)
      .attr("y", legendY + 30)
      .attr("text-anchor", "end")
      .text(formatter(maxValue));
  }

  function getColorScale() {
    const values = Array.from(countryMetrics.values())
      .map((metric) => getMetricValue(metric))
      .filter((value) => value !== null && value !== undefined);

    if (values.length === 0) {
      return d3.scaleLinear().domain([0, 1]).range(["#1c2b22", "#6ee7a0"]);
    }

    if (selectedMetric === "wealth") {
      const extent = d3.extent(values);
      const minValue = extent[0] ?? 0;
      const maxValue = extent[1] ?? 1;
      const midValue = (minValue + maxValue) / 2;

      return d3
        .scaleLinear()
        .domain([minValue, midValue, maxValue])
        .range(["#183225", "#2f7f57", "#7cf0aa"]);
    }

    const maxMagnitude = d3.max(values, (value) => Math.abs(value)) || 1;

    return d3
      .scaleLinear()
      .domain([-maxMagnitude, 0, maxMagnitude])
      .range(["#8a3b2e", "#203128", "#6ee7a0"]);
  }

  function syncActiveCountryClass() {
    countriesLayer
      .selectAll(".country")
      .classed("is-active", (datum) => datum.countryName === activeCountryName)
      .attr("opacity", (datum) => {
        if (!activeCountryName) {
          return 1;
        }

        return datum.countryName === activeCountryName ? 1 : 0.45;
      });
  }

  function updateMapColors() {
    const colorScale = getColorScale();

    countriesLayer
      .selectAll(".country")
      .transition()
      .duration(700)
      .attr("fill", (datum) => {
        const metric = countryMetrics.get(datum.countryName);
        const value = getMetricValue(metric);

        return value === null || value === undefined ? "#18231c" : colorScale(value);
      });

    updateLegend(colorScale);
    syncActiveCountryClass();
  }

  function setActiveCountry(countryName) {
    activeCountryName = countryName || null;
    syncActiveCountryClass();
  }

  function render(geojson, metricsMap) {
    countryMetrics = metricsMap;
    resizeProjection(geojson);

    const features = geojson.features.map((feature) => {
      const originalName = getCountryName(feature);
      const countryName = normalizeCountryName(originalName, aliases);

      return {
        ...feature,
        countryName
      };
    });

    countriesLayer
      .selectAll(".country")
      .data(features, (datum) => datum.countryName)
      .join("path")
      .attr("class", "country")
      .attr("d", pathGenerator)
      .attr("fill", "#18231c")
      .on("mouseenter", function (event, datum) {
        d3.select(this).raise();
        showTooltip(event, datum);
      })
      .on("mousemove", showTooltip)
      .on("mouseleave", hideTooltip)
      .on("click", (_, datum) => {
        const nextCountry = activeCountryName === datum.countryName ? null : datum.countryName;
        setActiveCountry(nextCountry);

        if (typeof onCountryClick === "function") {
          onCountryClick(activeCountryName);
        }
      });

    updateMapColors();
  }

  return {
    svg,
    render,
    setActiveCountry,
    resetView() {
      svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
    },
    updateMetric(metric) {
      selectedMetric = metric;
      updateMapColors();
    },
    showEmptyState(message) {
      container.html(`<div class="empty-state">${message}</div>`);
    }
  };
}
