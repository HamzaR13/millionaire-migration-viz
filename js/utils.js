export function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalizedValue = String(value).replace(/,/g, "").trim();
  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function formatSignedNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return d3.format("+,d")(value);
}

export function formatWealthBillions(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return `${d3.format(",.1f")(value)}B USD`;
}

export function getCountryName(feature) {
  return (
    feature?.properties?.name ||
    feature?.properties?.ADMIN ||
    feature?.properties?.admin ||
    feature?.properties?.NAME ||
    "Unknown"
  );
}

export function buildCountryAliases() {
  return new Map([
    ["United States", "USA"],
    ["United States of America", "USA"],
    ["United Kingdom", "UK"],
    ["Russian Federation", "Russia"],
    ["Czechia", "Czech Republic"],
    ["Republic of Korea", "South Korea"],
    ["Korea, Republic of", "South Korea"],
    ["Viet Nam", "Vietnam"],
    ["Türkiye", "Turkey"],
    ["United Arab Emirates", "UAE"]
  ]);
}

export function normalizeCountryName(name, aliases = buildCountryAliases()) {
  return aliases.get(name) || name;
}
