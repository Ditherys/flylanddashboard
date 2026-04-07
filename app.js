import { loadAllDatasets } from "./dataLoader.js";
import { buildKpiDataset, buildRealtimeDataset, getBottomPerformers } from "./kpiCalculator.js";
import { getAvailableAgents, getAvailableWeeks, getFilteredRecords, populateSelect } from "./filters.js";
import {
  renderBarChart,
  renderComparisonChart,
  renderContributionChart,
  renderDistributionChart,
  renderLineChart,
  renderScoreSpreadChart,
  renderStackedBarChart,
  renderVarianceChart,
} from "./charts.js";
import { exportRowsToCsv, initializeTable, renderTable, renderTableSummary, sortRecords } from "./table.js";

const state = {
  dataset: null,
  realtimeDataset: null,
  filters: { month: "all", week: "all", agent: "all", search: "" },
  dashboardFocus: "performance",
  sort: { key: "performanceScore", direction: "desc" },
  expandedRowKeys: new Set(),
  mobileSidebarOpen: false,
  mobileTableExpanded: true,
  mobileFiltersExpanded: false,
  floatingLegendOpen: false,
  distributionDrilldownOpen: false,
  distributionDrilldownExpanded: false,
  distributionDrilldownDetail: null,
  resizeRaf: null,
  charts: {},
  initialized: false,
};

const KPI_DEFINITIONS = [
  {
    key: "transferScore",
    label: "Transfer",
    raw: (summary) => `Transfer rate ${formatPercent(summary.transferRatePercent)}`,
  },
  {
    key: "admitsScore",
    label: "Admits",
    raw: (summary) =>
      `Admits count ${
        summary.admitsCount === null || summary.admitsCount === undefined ? "N/A" : Number(summary.admitsCount).toFixed(2)
      }`,
  },
  {
    key: "ahtScore",
    label: "AHT",
    raw: (summary) => `Average handle time ${formatTimeFromSeconds(summary.ahtSeconds)}`,
  },
  {
    key: "attendanceScore",
    label: "Attendance",
    raw: (summary) => `Attendance ${formatPercent(summary.attendancePercentValue)}`,
  },
  {
    key: "qaScore",
    label: "Quality Assurance",
    raw: (summary) => `QA ${formatPercent(summary.qaPercentValue)}`,
  },
];

const FOCUS_SCORING = {
  all: { metricKey: "overallScore", title: "Overall", distribution: "transfer" },
  performance: { metricKey: "performanceScore", title: "Performance", distribution: "transfer" },
  realtime: { metricKey: "performanceScore", title: "Real Time Performance", distribution: "transfer" },
  attendance: { metricKey: "attendanceScore", title: "Attendance", distribution: "attendance" },
  qa: { metricKey: "qaScore", title: "Quality Assurance", distribution: "qa" },
};

const elements = {
  appShell: document.querySelector("#appShell"),
  mobileSidebar: document.querySelector("#mobileSidebarPanel"),
  mobileMenuToggle: document.querySelector("#mobileMenuToggle"),
  mobileTableToggle: document.querySelector("#mobileTableToggle"),
  mobileLegendLauncher: document.querySelector("#mobileLegendLauncher"),
  mobileFiltersLauncher: document.querySelector("#mobileFiltersLauncher"),
  mobileStatusMonth: document.querySelector("#mobileStatusMonth"),
  mobileStatusWeek: document.querySelector("#mobileStatusWeek"),
  mobileStatusScope: document.querySelector("#mobileStatusScope"),
  mobileHomeButtons: [...document.querySelectorAll("[data-mobile-target]")],
  focusButtons: [...document.querySelectorAll("[data-dashboard-focus]")],
  mobileBottomNavButtons: [...document.querySelectorAll(".mobile-bottom-nav-button[data-mobile-action]")],
  summaryCardsList: [...document.querySelectorAll(".summary-card")],
  mobileDistributionButtons: [...document.querySelectorAll(".distribution-mobile-chip[data-distribution-panel]")],
  mobileDistributionItems: [...document.querySelectorAll("[data-distribution-item]")],
  mobileMorePanel: document.querySelector("#mobileMorePanel"),
  mobileMoreClose: document.querySelector("#mobileMoreClose"),
  mobileMoreLegend: document.querySelector("#mobileMoreLegend"),
  mobileMoreFilters: document.querySelector("#mobileMoreFilters"),
  mobileMoreExport: document.querySelector("#mobileMoreExport"),
  mobileMoreReset: document.querySelector("#mobileMoreReset"),
  floatingLegendToggle: document.querySelector("#floatingLegendToggle"),
  floatingLegendPanel: document.querySelector("#floatingLegendPanel"),
  floatingLegendClose: document.querySelector("#floatingLegendClose"),
  floatingLegendContent: document.querySelector("#floatingLegendContent"),
  distributionDrilldownPanel: document.querySelector("#distributionDrilldownPanel"),
  distributionDrilldownClose: document.querySelector("#distributionDrilldownClose"),
  distributionDrilldownTitle: document.querySelector("#distributionDrilldownTitle"),
  distributionDrilldownSubnote: document.querySelector("#distributionDrilldownSubnote"),
  distributionDrilldownList: document.querySelector("#distributionDrilldownList"),
  legendPanel: document.querySelector(".legend-panel"),
  monthFilterField: document.querySelector("#monthFilterField"),
  weekFilterField: document.querySelector("#weekFilterField"),
  agentFilterField: document.querySelector("#agentFilterField"),
  topFiltersTitle: document.querySelector("#topFiltersTitle"),
  monthFilterLabel: document.querySelector("#monthFilterLabel"),
  weekFilterLabel: document.querySelector("#weekFilterLabel"),
  agentFilterLabel: document.querySelector("#agentFilterLabel"),
  monthFilter: document.querySelector("#monthFilter"),
  weekFilter: document.querySelector("#weekFilter"),
  dateFilter: document.querySelector("#dateFilter"),
  agentFilter: document.querySelector("#agentFilter"),
  tableSearch: document.querySelector("#tableSearch"),
  resetFilters: document.querySelector("#resetFilters"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  expandAllRowsButton: document.querySelector("#expandAllRowsButton"),
  collapseAllRowsButton: document.querySelector("#collapseAllRowsButton"),
  filtersCollapseToggle: document.querySelector("#filtersCollapseToggle"),
  filtersContentArea: document.querySelector("#filtersContentArea"),
  tableCollapseToggle: document.querySelector("#tableCollapseToggle"),
  tableContentArea: document.querySelector("#tableContentArea"),
  tableSummaryStrip: document.querySelector("#tableSummaryStrip"),
  tableRowHint: document.querySelector("#tableRowHint"),
  tableHeadRow: document.querySelector("#tableHeadRow"),
  tableBody: document.querySelector("#tableBody"),
  dataStatusText: document.querySelector("#dataStatusText"),
  realtimeLastUpdatedPill: document.querySelector("#realtimeLastUpdatedPill"),
  realtimeLastUpdatedText: document.querySelector("#realtimeLastUpdatedText"),
  trendChart: document.querySelector("#trendChart"),
  weekScoreChart: document.querySelector("#weekScoreChart"),
  contributionChart: document.querySelector("#contributionChart"),
  varianceChart: document.querySelector("#varianceChart"),
  transferDistributionChart: document.querySelector("#transferDistributionChart"),
  admitsDistributionChart: document.querySelector("#admitsDistributionChart"),
  ahtDistributionChart: document.querySelector("#ahtDistributionChart"),
  attendanceDistributionChart: document.querySelector("#attendanceDistributionChart"),
  qaDistributionChart: document.querySelector("#qaDistributionChart"),
  performerSpreadChart: document.querySelector("#performerSpreadChart"),
  performerSpreadSummary: document.querySelector("#performerSpreadSummary"),
  stackedChart: document.querySelector("#stackedChart"),
  comparisonChart: document.querySelector("#comparisonChart"),
  comparisonTitle: document.querySelector("#comparisonTitle"),
  comparisonSubnote: document.querySelector("#comparisonSubnote"),
  rankingSubnote: document.querySelector("#rankingSubnote"),
  viewInsightTitle: document.querySelector("#viewInsightTitle"),
  viewInsightBody: document.querySelector("#viewInsightBody"),
  bestInsightTitle: document.querySelector("#bestInsightTitle"),
  bestInsightBody: document.querySelector("#bestInsightBody"),
  watchInsightTitle: document.querySelector("#watchInsightTitle"),
  watchInsightBody: document.querySelector("#watchInsightBody"),
  momentumInsightTitle: document.querySelector("#momentumInsightTitle"),
  momentumInsightBody: document.querySelector("#momentumInsightBody"),
  agentFocusName: document.querySelector("#agentFocusName"),
  agentFocusNarrative: document.querySelector("#agentFocusNarrative"),
  agentOverallValue: document.querySelector("#agentOverallValue"),
  agentOverallNarrative: document.querySelector("#agentOverallNarrative"),
  agentStrongestValue: document.querySelector("#agentStrongestValue"),
  agentStrongestNarrative: document.querySelector("#agentStrongestNarrative"),
  agentWeakestValue: document.querySelector("#agentWeakestValue"),
  agentWeakestNarrative: document.querySelector("#agentWeakestNarrative"),
  navButtons: [...document.querySelectorAll(".nav-item[data-target]")],
  teamOnlySections: [...document.querySelectorAll("[data-scope='team-only']")],
  agentOnlySections: [...document.querySelectorAll("[data-scope='agent-only']")],
  summaryCards: [...document.querySelectorAll(".summary-card[data-kpi]")],
  focusGroupedNodes: [...document.querySelectorAll("[data-focus-group]")],
  rawMetricsGrid: document.querySelector("#rawMetricsGrid"),
  overallCardTitle: document.querySelector("#overallCardTitle"),
  contributionCard: document.querySelector("#contributionCard"),
  tableSectionSubnote: document.querySelector("#tableSectionSubnote"),
  trendSectionTitle: document.querySelector("#trendSectionTitle"),
  snapshotSectionTitle: document.querySelector("#snapshotSectionTitle"),
  varianceSectionTitle: document.querySelector("#varianceSectionTitle"),
  rankingSectionTitle: document.querySelector("#rankingSectionTitle"),
  bottomSectionTitle: document.querySelector("#bottomSectionTitle"),
  improvedSectionTitle: document.querySelector("#improvedSectionTitle"),
  breakdownSectionTitle: document.querySelector("#breakdownSectionTitle"),
  distributionSectionTitle: document.querySelector("#distributionSectionTitle"),
  tableSectionTitle: document.querySelector("#tableSectionTitle"),
};

state.mobileMoreOpen = false;
state.mobileDistributionPanel = "transfer";

function isRealtimeFocus() {
  return state.dashboardFocus === "realtime";
}

function isPerformanceLikeFocus() {
  return state.dashboardFocus === "performance" || state.dashboardFocus === "realtime";
}

function getActiveDataset() {
  return isRealtimeFocus() ? state.realtimeDataset : state.dataset;
}

function setMobileDockActive(action) {
  elements.mobileBottomNavButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mobileAction === action);
  });
}

function triggerMobileAction(action) {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;
  if (!isMobile) return;

  if (action === "more") {
    state.mobileMoreOpen = !state.mobileMoreOpen;
    applyMobileMoreState();
    setMobileDockActive(action);
    return;
  }

  state.mobileMoreOpen = false;
  applyMobileMoreState();

  state.floatingLegendOpen = false;
  applyFloatingLegendState();

  if (action === "table") {
    state.mobileTableExpanded = true;
    applyMobileUiState();
    document.getElementById("tableSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileDockActive(action);
    return;
  }

  if (action === "filters") {
    state.mobileFiltersExpanded = true;
    applyMobileUiState();
    document.getElementById("filtersSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileDockActive(action);
    return;
  }

  if (action === "summary") {
    const summaryTarget = state.filters.agent === "all" ? "summaryCards" : "agentFocusSection";
    document.getElementById(summaryTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileDockActive(action);
    return;
  }

  if (action === "agents") {
    const agentsTarget = state.filters.agent === "all" ? "agentsSection" : "agentFocusSection";
    document.getElementById(agentsTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileDockActive(action);
    return;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  document.getElementById("dashboardTop")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setMobileDockActive("home");
}

function applyMobileUiState() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;

  elements.mobileSidebar?.classList.toggle("is-mobile-open", isMobile && state.mobileSidebarOpen);
  elements.mobileMenuToggle?.setAttribute("aria-expanded", String(isMobile && state.mobileSidebarOpen));
  if (elements.mobileMenuToggle) {
    elements.mobileMenuToggle.textContent = isMobile && state.mobileSidebarOpen ? "Close" : "Menu";
  }

  elements.tableContentArea?.classList.toggle("is-collapsed-mobile", isMobile && !state.mobileTableExpanded);
  elements.tableCollapseToggle?.setAttribute("aria-expanded", String(!isMobile || state.mobileTableExpanded));
  elements.mobileTableToggle?.setAttribute("aria-expanded", String(!isMobile || state.mobileTableExpanded));
  if (elements.tableCollapseToggle) {
    elements.tableCollapseToggle.textContent = !isMobile || state.mobileTableExpanded ? "Collapse Table" : "Expand Table";
  }
  if (elements.mobileTableToggle) {
    elements.mobileTableToggle.textContent = !isMobile || state.mobileTableExpanded ? "Hide Table" : "Show Table";
  }

  elements.filtersContentArea?.classList.toggle("is-collapsed-mobile", isMobile && !state.mobileFiltersExpanded);
  elements.filtersCollapseToggle?.setAttribute("aria-expanded", String(!isMobile || state.mobileFiltersExpanded));
  if (elements.filtersCollapseToggle) {
    elements.filtersCollapseToggle.textContent = !isMobile || state.mobileFiltersExpanded ? "Hide Filters" : "Show Filters";
  }

  if (!isMobile) {
    state.mobileMoreOpen = false;
    elements.summaryCardsList.forEach((card) => {
      card.classList.remove("is-mobile-expanded");
      card.setAttribute("aria-expanded", "false");
    });
    setMobileDockActive("home");
  }
}

function applyMobileMoreState() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;
  elements.mobileMorePanel?.classList.toggle("is-open", isMobile && state.mobileMoreOpen);
  elements.mobileMorePanel?.setAttribute("aria-hidden", String(!(isMobile && state.mobileMoreOpen)));
}

function applyMobileDistributionState() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;
  elements.mobileDistributionButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.distributionPanel === state.mobileDistributionPanel);
  });
  elements.mobileDistributionItems.forEach((item) => {
    item.classList.toggle(
      "is-mobile-active",
      !isMobile || item.dataset.distributionItem === state.mobileDistributionPanel
    );
  });
}

function bindSummaryCardInteractions() {
  elements.summaryCardsList.forEach((card) => {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-expanded", "false");

    const toggleCard = () => {
      const willExpand = !card.classList.contains("is-mobile-expanded");
      elements.summaryCardsList.forEach((item) => {
        item.classList.remove("is-mobile-expanded");
        item.setAttribute("aria-expanded", "false");
      });

      if (willExpand) {
        card.classList.add("is-mobile-expanded");
        card.setAttribute("aria-expanded", "true");
      }
    };

    card.addEventListener("click", toggleCard);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleCard();
      }
    });
  });
}

function resetDashboardFilters() {
  const activeDataset = getActiveDataset();
  state.filters = {
    month: isRealtimeFocus() ? "all" : activeDataset.monthOptions.at(-1) || "all",
    week: activeDataset.weekOptions.at(-1) || "all",
    agent: "all",
    search: "",
  };
  state.expandedRowKeys = new Set();
  elements.tableSearch.value = "";
  syncFilterOptions();
  updateDashboard();
}

function bindMobileScrollSpy() {
  const sectionMap = [
    { action: "home", title: "Dashboard Home", getElement: () => document.getElementById("dashboardTop") },
    { action: "summary", title: state.filters.agent === "all" ? "KPI Scorecards" : "Agent Focus", getElement: () => document.getElementById(state.filters.agent === "all" ? "summaryCards" : "agentFocusSection") },
    { action: "agents", title: state.filters.agent === "all" ? "Agent Insights" : "Agent Focus", getElement: () => document.getElementById(state.filters.agent === "all" ? "agentsSection" : "agentFocusSection") },
    { action: "table", title: "Team Table", getElement: () => document.getElementById("tableSection") },
  ];

  const updateActiveByScroll = () => {
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;
    if (!isMobile || state.mobileMoreOpen) return;

    const threshold = window.innerHeight * 0.28;
    let activeAction = "home";
    let activeTitle = "Dashboard Home";

    sectionMap.forEach(({ action, title, getElement }) => {
      const element = getElement();
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.top <= threshold) {
        activeAction = action;
        activeTitle = title;
      }
    });

    setMobileDockActive(activeAction);
  };

  window.addEventListener("scroll", updateActiveByScroll, { passive: true });
  updateActiveByScroll();
}

function applyFloatingLegendState() {
  elements.floatingLegendPanel?.classList.toggle("is-open", state.floatingLegendOpen);
  elements.floatingLegendPanel?.setAttribute("aria-hidden", String(!state.floatingLegendOpen));
  elements.floatingLegendToggle?.setAttribute("aria-expanded", String(state.floatingLegendOpen));
}

function applyDistributionDrilldownState() {
  elements.distributionDrilldownPanel?.classList.toggle("is-open", state.distributionDrilldownOpen);
  elements.distributionDrilldownPanel?.setAttribute("aria-hidden", String(!state.distributionDrilldownOpen));
}

function renderDistributionDrilldownContent() {
  if (!elements.distributionDrilldownList || !elements.distributionDrilldownTitle || !elements.distributionDrilldownSubnote) {
    return;
  }

  const detail = state.distributionDrilldownDetail;
  if (!detail) return;

  if (detail.mode === "breakdown") {
    elements.distributionDrilldownTitle.textContent = detail.agentName;
    elements.distributionDrilldownSubnote.textContent = `${detail.weekEnding} | KPI breakdown for the selected agent row.`;
    elements.distributionDrilldownList.innerHTML = detail.items.map((item) => `
      <div class="distribution-drilldown-item">
        ${item.label}: ${item.value}${item.score ? ` | Score ${item.score}` : ""}
      </div>
    `).join("");
    return;
  }

  elements.distributionDrilldownTitle.textContent = `${detail.label} | Score ${detail.score}`;
  elements.distributionDrilldownSubnote.textContent = `${detail.count} agent(s) in this bucket out of ${detail.total} scored agents.`;
  if (!detail.agents.length) {
    elements.distributionDrilldownList.innerHTML =
      '<div class="distribution-drilldown-empty">No agents found in this score bucket.</div>';
    return;
  }

  const previewLimit = 4;
  const visibleAgents = state.distributionDrilldownExpanded ? detail.agents : detail.agents.slice(0, previewLimit);
  const remainingCount = Math.max(detail.agents.length - visibleAgents.length, 0);

  elements.distributionDrilldownList.innerHTML = [
    ...visibleAgents.map((agent) => `<div class="distribution-drilldown-item">${agent}</div>`),
    !state.distributionDrilldownExpanded && remainingCount > 0
      ? `<button class="distribution-drilldown-more" type="button">Show ${remainingCount} more agent(s)</button>`
      : "",
  ].join("");
}

function openDistributionDrilldown(detail) {
  state.distributionDrilldownOpen = true;
  state.distributionDrilldownExpanded = false;
  state.distributionDrilldownDetail = detail;
  renderDistributionDrilldownContent();
  applyDistributionDrilldownState();
}

function openBreakdownDrilldown(record) {
  const focusItems = state.dashboardFocus === "all"
    ? [
      {
        label: "Transfer",
        value: record.transferRateDisplay,
        score: formatScore(record.transferScore),
      },
      {
        label: "Admits",
        value: record.admitsCount === null || record.admitsCount === undefined ? "N/A" : Number(record.admitsCount).toFixed(0),
        score: formatScore(record.admitsScore),
      },
      {
        label: "AHT",
        value: record.ahtDisplay,
        score: formatScore(record.ahtScore),
      },
      {
        label: "Attendance",
        value: record.attendancePercentDisplay,
        score: formatScore(record.attendanceScore),
      },
      {
        label: "Quality Assurance",
        value: record.qaPercentDisplay,
        score: formatScore(record.qaScore),
      },
      {
        label: "Overall",
        value: formatScore(record.overallScore),
        score: null,
      },
    ]
    : isPerformanceLikeFocus()
    ? [
      {
        label: "Transfer",
        value: record.transferRateDisplay,
        score: formatScore(record.transferScore),
      },
      {
        label: "Admits",
        value: record.admitsCount === null || record.admitsCount === undefined ? "N/A" : Number(record.admitsCount).toFixed(0),
        score: formatScore(record.admitsScore),
      },
      {
        label: "AHT",
        value: record.ahtDisplay,
        score: formatScore(record.ahtScore),
      },
      {
        label: "Performance",
        value: formatScore(record.performanceScore),
        score: null,
      },
    ]
    : state.dashboardFocus === "attendance"
      ? [
        {
          label: "Attendance",
          value: record.attendancePercentDisplay,
          score: formatScore(record.attendanceScore),
        },
      ]
      : [
        {
          label: "Quality Assurance",
          value: record.qaPercentDisplay,
          score: formatScore(record.qaScore),
        },
      ];

  state.distributionDrilldownOpen = true;
  state.distributionDrilldownExpanded = false;
  state.distributionDrilldownDetail = {
    mode: "breakdown",
    agentName: record.agentName,
    weekEnding: record.weekEnding,
    items: focusItems,
  };
  renderDistributionDrilldownContent();
  applyDistributionDrilldownState();
}

function initializeFloatingLegend() {
  if (!elements.legendPanel || !elements.floatingLegendContent) return;
  elements.floatingLegendContent.innerHTML = elements.legendPanel.innerHTML;
}

function initializeMobileDefaults() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;
  state.mobileTableExpanded = !isMobile;
  state.mobileFiltersExpanded = !isMobile;
  state.mobileSidebarOpen = false;
}

const cardMap = {
  overall: {
    value: document.querySelector("#overallScoreValue"),
    badge: document.querySelector("#overallCardBadge"),
    raw: document.querySelector("#overallScoreRaw"),
    delta: document.querySelector("#overallScoreDelta"),
  },
  transfer: {
    value: document.querySelector("#transferScoreValue"),
    badge: document.querySelector("#transferCardBadge"),
    raw: document.querySelector("#transferScoreRaw"),
    delta: document.querySelector("#transferScoreDelta"),
  },
  admits: {
    value: document.querySelector("#admitsScoreValue"),
    badge: document.querySelector("#admitsCardBadge"),
    raw: document.querySelector("#admitsScoreRaw"),
    delta: document.querySelector("#admitsScoreDelta"),
  },
  aht: {
    value: document.querySelector("#ahtScoreValue"),
    badge: document.querySelector("#ahtCardBadge"),
    raw: document.querySelector("#ahtScoreRaw"),
    delta: document.querySelector("#ahtScoreDelta"),
  },
  attendance: {
    value: document.querySelector("#attendanceScoreValue"),
    badge: document.querySelector("#attendanceCardBadge"),
    raw: document.querySelector("#attendanceScoreRaw"),
    delta: document.querySelector("#attendanceScoreDelta"),
  },
  qa: {
    value: document.querySelector("#qaScoreValue"),
    badge: document.querySelector("#qaCardBadge"),
    raw: document.querySelector("#qaScoreRaw"),
    delta: document.querySelector("#qaScoreDelta"),
  },
};

function scoreClassName(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return "score-na";
  return `score-${Math.max(1, Math.min(5, Math.round(score)))}`;
}

function formatScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return "N/A";
  return Number(score).toFixed(2);
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${Number(value).toFixed(digits)}%`;
}

function formatTimeFromSeconds(seconds) {
  if (!seconds) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function averageField(records, field) {
  const selector = typeof field === "function"
    ? field
    : (record) => String(field)
      .split(".")
      .reduce((value, key) => value?.[key], record);
  const valid = records
    .map((record) => selector(record))
    .filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatSignedDelta(delta) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "N/A";
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${Number(delta).toFixed(2)}`;
}

function getComparisonUnitLabel() {
  return isRealtimeFocus() ? "date" : "week";
}

function getDateKey(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateByDays(value, days) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const shifted = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function getRealtimeDateEntries() {
  return state.realtimeDataset?.weeklyAverages || [];
}

function getIsoDateFromWeekValue(weekValue) {
  const match = getRealtimeDateEntries().find((item) => item.weekEnding === weekValue);
  return match?.weekDate ? getDateKey(match.weekDate) : "";
}

function getWeekValueFromIsoDate(isoDate) {
  if (!isoDate) return "";
  const entries = getRealtimeDateEntries().filter((item) => item.weekDate instanceof Date && !Number.isNaN(item.weekDate.getTime()));
  if (!entries.length) return "";

  const exactMatch = entries.find((item) => getDateKey(item.weekDate) === isoDate);
  if (exactMatch) return exactMatch.weekEnding;

  const pickedTime = new Date(`${isoDate}T00:00:00`).getTime();
  const priorMatch = [...entries]
    .filter((item) => item.weekDate.getTime() <= pickedTime)
    .sort((left, right) => left.weekDate.getTime() - right.weekDate.getTime())
    .at(-1);
  if (priorMatch) return priorMatch.weekEnding;

  return entries[0]?.weekEnding || "";
}

function getLatestRealtimeWeek() {
  return state.realtimeDataset?.weekOptions?.at(-1) || "all";
}

function shouldShowRealtimeLastUpdated() {
  return isRealtimeFocus() && state.filters.week === getLatestRealtimeWeek();
}

function getRankedKpis(summary) {
  if (!summary) return [];
  return KPI_DEFINITIONS
    .map((kpi) => ({
      ...kpi,
      score: summary[kpi.key],
      rawText: kpi.raw(summary),
    }))
    .filter((item) => typeof item.score === "number" && !Number.isNaN(item.score))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function getFocusRankedKpis(summary) {
  if (!summary) return [];
  const scoped = state.dashboardFocus === "all"
    ? KPI_DEFINITIONS
    : isPerformanceLikeFocus()
    ? KPI_DEFINITIONS.filter((item) => ["transferScore", "admitsScore", "ahtScore"].includes(item.key))
    : KPI_DEFINITIONS.filter((item) => item.key === (state.dashboardFocus === "attendance" ? "attendanceScore" : "qaScore"));

  return scoped
    .map((kpi) => ({
      ...kpi,
      score: summary[kpi.key],
      rawText: kpi.raw(summary),
    }))
    .filter((item) => typeof item.score === "number" && !Number.isNaN(item.score))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function getSummaryMetrics(records) {
  if (!records.length) return null;
  return {
    transferScore: averageField(records, "transferScore"),
    admitsScore: averageField(records, "admitsScore"),
    ahtScore: averageField(records, "ahtScore"),
    attendanceScore: averageField(records, "attendanceScore"),
    qaScore: averageField(records, "qaScore"),
    performanceScore: averageField(records, "performanceScore"),
    overallScore: averageField(records, "overallScore"),
    transferRatePercent: averageField(records, "transferRatePercent"),
    admitsCount: averageField(records, "admitsCount"),
    firstTimeCaller: averageField(records, "firstTimeCaller"),
    transferCount: averageField(records, "transferCount"),
    inboundCalls: averageField(records, "inboundCalls"),
    inboundMinutesSeconds: averageField(records, "inboundMinutesSeconds"),
    holdTimeSeconds: averageField(records, "holdTimeSeconds"),
    ahtSeconds: averageField(records, "ahtSeconds"),
    attendancePercentValue: averageField(records, "attendancePercentValue"),
    qaPercentValue: averageField(records, "qaPercentValue"),
    agentCount: new Set(records.map((record) => record.agentName)).size,
    overallIncludesQa: records.some((record) => hasValidNumber(record.qaScore)),
    overallWeights: {
      performance: averageField(records, "overallWeights.performance"),
      attendance: averageField(records, "overallWeights.attendance"),
      qa: averageField(records, "overallWeights.qa"),
    },
  };
}

function getScopedWeeklyAverages(records) {
  const weekMap = new Map();
  records.forEach((record) => {
    const bucket = weekMap.get(record.weekEnding) || [];
    bucket.push(record);
    weekMap.set(record.weekEnding, bucket);
  });

  return [...weekMap.entries()]
    .map(([weekEnding, items]) => ({
      weekEnding,
      weekDate: items[0]?.weekDate,
      transferScore: averageField(items, "transferScore"),
      admitsScore: averageField(items, "admitsScore"),
      ahtScore: averageField(items, "ahtScore"),
      attendanceScore: averageField(items, "attendanceScore"),
      qaScore: averageField(items, "qaScore"),
      performanceScore: averageField(items, "performanceScore"),
      overallScore: averageField(items, "overallScore"),
      transferRatePercent: averageField(items, "transferRatePercent"),
      admitsCount: averageField(items, "admitsCount"),
      firstTimeCaller: averageField(items, "firstTimeCaller"),
      transferCount: averageField(items, "transferCount"),
      inboundCalls: averageField(items, "inboundCalls"),
      inboundMinutesSeconds: averageField(items, "inboundMinutesSeconds"),
      holdTimeSeconds: averageField(items, "holdTimeSeconds"),
      ahtSeconds: averageField(items, "ahtSeconds"),
      attendancePercentValue: averageField(items, "attendancePercentValue"),
      qaPercentValue: averageField(items, "qaPercentValue"),
      overallIncludesQa: items.some((item) => hasValidNumber(item.qaScore)),
      overallWeights: {
        performance: averageField(items, "overallWeights.performance"),
        attendance: averageField(items, "overallWeights.attendance"),
        qa: averageField(items, "overallWeights.qa"),
      },
    }))
    .sort((left, right) => (left.weekDate?.getTime() ?? 0) - (right.weekDate?.getTime() ?? 0));
}

function pickWeekSummary(filteredRecords, weeklyAverages) {
  if (!weeklyAverages.length) {
    return {
      transferScore: 0,
      admitsScore: 0,
      ahtScore: 0,
      attendanceScore: 0,
      qaScore: 0,
      performanceScore: 0,
      overallScore: 0,
      transferRatePercent: null,
      admitsCount: null,
      firstTimeCaller: null,
      transferCount: null,
      inboundCalls: null,
      inboundMinutesSeconds: null,
      holdTimeSeconds: null,
      ahtSeconds: null,
      attendancePercentValue: null,
      qaPercentValue: null,
      overallIncludesQa: false,
      overallWeights: {
        performance: 0,
        attendance: 0,
        qa: 0,
      },
      weekEnding: "No Data",
    };
  }

  if (state.filters.week !== "all") {
    return weeklyAverages.find((item) => item.weekEnding === state.filters.week) || weeklyAverages.at(-1);
  }

  if (filteredRecords.length) {
    const latestWeek = [...filteredRecords]
      .sort((left, right) => (left.weekDate?.getTime() ?? 0) - (right.weekDate?.getTime() ?? 0))
      .at(-1)?.weekEnding;
    return weeklyAverages.find((item) => item.weekEnding === latestWeek) || weeklyAverages.at(-1);
  }

  return weeklyAverages.at(-1);
}

function getComparisonWeeklyAverages(weeklyAverages, selectedWeekEnding) {
  if (!weeklyAverages.length) return [];

  const comparisonRecords = getFilteredRecords(getActiveDataset().records, {
    ...state.filters,
    month: "all",
    week: "all",
    search: "",
  });
  const comparisonPool = getScopedWeeklyAverages(comparisonRecords);
  if (!comparisonPool.length) return weeklyAverages;
  if (comparisonPool.length === 1) return comparisonPool;

  const resolvedSelectedWeek =
    selectedWeekEnding ||
    (state.filters.week !== "all" ? state.filters.week : weeklyAverages.at(-1)?.weekEnding) ||
    comparisonPool.at(-1)?.weekEnding;

  const selectedEntry = comparisonPool.find((item) => item.weekEnding === resolvedSelectedWeek);
  if (!selectedEntry?.weekDate) return comparisonPool.slice(-2);

  if (isRealtimeFocus()) {
    const yesterdayKey = getDateKey(shiftDateByDays(selectedEntry.weekDate, -1));
    const yesterdayEntry = comparisonPool.find((item) => getDateKey(item.weekDate) === yesterdayKey);
    return yesterdayEntry ? [yesterdayEntry, selectedEntry] : [selectedEntry];
  }

  const eligibleWeeks = comparisonPool.filter((item) => (item.weekDate?.getTime() ?? 0) <= selectedEntry.weekDate.getTime());
  if (!eligibleWeeks.length) return comparisonPool.slice(-2);
  return eligibleWeeks.slice(-2);
}

function getTrendWeeklyAverages(weeklyAverages, selectedWeekEnding) {
  if (!weeklyAverages.length) return [];

  const trendRecords = getFilteredRecords(getActiveDataset().records, {
    ...state.filters,
    month: "all",
    week: "all",
    search: "",
  });
  const trendPool = getScopedWeeklyAverages(trendRecords);
  if (!trendPool.length) return weeklyAverages;

  const resolvedSelectedWeek =
    selectedWeekEnding ||
    (state.filters.week !== "all" ? state.filters.week : weeklyAverages.at(-1)?.weekEnding) ||
    trendPool.at(-1)?.weekEnding;

  const selectedEntry = trendPool.find((item) => item.weekEnding === resolvedSelectedWeek);
  if (!selectedEntry?.weekDate) return trendPool.slice(-6);

  const eligibleWeeks = trendPool.filter((item) => (item.weekDate?.getTime() ?? 0) <= selectedEntry.weekDate.getTime());
  if (!eligibleWeeks.length) return trendPool.slice(-6);
  return eligibleWeeks.slice(-6);
}

function updateInsights(filteredRecords, weeklyAverages) {
  const selectedSummary = pickWeekSummary(filteredRecords, weeklyAverages);
  const comparisonWeeklyAverages = getComparisonWeeklyAverages(weeklyAverages, selectedSummary.weekEnding);
  const rankedKpis = getFocusRankedKpis(selectedSummary);
  const bestKpi = rankedKpis[0] || null;
  const weakestKpi = rankedKpis.at(-1) || null;
  const totalAgents = new Set(filteredRecords.map((record) => record.agentName)).size;
  const totalWeeks = new Set(filteredRecords.map((record) => record.weekEnding)).size;
  const isAgentView = state.filters.agent !== "all";

  elements.viewInsightTitle.textContent = isAgentView
    ? `${state.filters.agent} in focus`
    : `${totalAgents || 0} agents in current scope`;
  elements.viewInsightBody.textContent = isAgentView
    ? isRealtimeFocus()
      ? `${selectedSummary.weekEnding || "Latest date"} is selected across ${totalWeeks || 0} available date(s) for this agent.`
      : `${selectedSummary.weekEnding || "Latest week"} is selected across ${totalWeeks || 0} available week(s) for this agent.`
    : isRealtimeFocus()
    ? `${state.filters.week === "all" ? "All available dates" : state.filters.week} is showing ${filteredRecords.length} live row(s) for the current scope.`
    : `${state.filters.month === "all" ? "All months" : state.filters.month} with ${state.filters.week === "all" ? "all available weeks" : state.filters.week} is showing ${filteredRecords.length} score row(s).`;

  elements.bestInsightTitle.textContent = bestKpi
    ? `${bestKpi.label} is leading at ${formatScore(bestKpi.score)}`
    : "No KPI lead available";
  elements.bestInsightBody.textContent = bestKpi
    ? `${bestKpi.rawText}. This is the strongest signal in the currently selected view.`
    : "Select a scope with KPI data to surface the current strength.";

  elements.watchInsightTitle.textContent = weakestKpi
    ? `${weakestKpi.label} needs the most attention`
    : "No watch item available";
  elements.watchInsightBody.textContent = weakestKpi
    ? `${weakestKpi.rawText}. This is the lowest-scoring KPI in the current selection.`
    : "The watchlist will appear once KPI scores are available.";

  const currentWeek = comparisonWeeklyAverages.at(-1) || null;
  const previousWeek = comparisonWeeklyAverages.length > 1 ? comparisonWeeklyAverages[0] : null;
  const momentumKey = state.dashboardFocus === "all"
    ? "overallScore"
    : isPerformanceLikeFocus()
    ? "performanceScore"
    : state.dashboardFocus === "attendance"
      ? "attendanceScore"
      : "qaScore";
  const overallDelta =
    currentWeek && previousWeek ? Number(currentWeek[momentumKey]) - Number(previousWeek[momentumKey]) : null;

  elements.momentumInsightTitle.textContent =
    overallDelta === null || Number.isNaN(overallDelta)
      ? isRealtimeFocus() ? "No yesterday data for momentum" : "No previous week for momentum"
      : `${FOCUS_SCORING[state.dashboardFocus].title} ${overallDelta >= 0 ? "up" : "down"} ${formatSignedDelta(overallDelta)}`;
  elements.momentumInsightBody.textContent =
    overallDelta === null || Number.isNaN(overallDelta)
      ? isRealtimeFocus()
        ? `${selectedSummary.weekEnding || "Selected date"} has no yesterday data available for comparison.`
        : `${selectedSummary.weekEnding || "Selected week"} has no earlier week available for comparison.`
      : isRealtimeFocus()
      ? `${currentWeek.weekEnding} versus yesterday (${previousWeek.weekEnding}) on ${FOCUS_SCORING[state.dashboardFocus].title.toLowerCase()} score.`
      : `${currentWeek.weekEnding} versus ${previousWeek.weekEnding} on ${FOCUS_SCORING[state.dashboardFocus].title.toLowerCase()} score.`;

  if (elements.mobileStatusMonth && elements.mobileStatusWeek && elements.mobileStatusScope) {
    elements.mobileStatusMonth.textContent = isRealtimeFocus()
      ? "Real-Time Performance"
      : state.filters.month === "all"
      ? "All Months"
      : state.filters.month;
    elements.mobileStatusWeek.textContent = state.filters.week === "all" ? selectedSummary.weekEnding || (isRealtimeFocus() ? "Latest Date" : "Latest") : state.filters.week;
    elements.mobileStatusScope.textContent = state.filters.agent === "all" ? `${totalAgents || 0} Agents` : state.filters.agent;
  }

  if (elements.mobileLegendLauncher) {
    const legendTitle = elements.mobileLegendLauncher.querySelector("strong");
    const legendCopy = elements.mobileLegendLauncher.querySelector("p");
    if (legendTitle && legendCopy) {
      legendTitle.textContent = "KPI Legend";
      legendCopy.textContent = "Keep score definitions one tap away.";
    }
  }

  if (elements.mobileFiltersLauncher) {
    const filtersTitle = elements.mobileFiltersLauncher.querySelector("strong");
    const filtersCopy = elements.mobileFiltersLauncher.querySelector("p");
    if (filtersTitle && filtersCopy) {
      if (state.filters.agent === "all") {
        filtersTitle.textContent = "Filters";
        filtersCopy.textContent = isRealtimeFocus() ? "Open date and agent filters." : "Open month, week, and agent filters.";
      } else {
        filtersTitle.textContent = "Agent Scope";
        filtersCopy.textContent = isRealtimeFocus() ? "Change the selected agent or date focus." : "Change the selected agent or week focus.";
      }
    }
  }
}

function updateAgentFocus(filteredRecords, weeklyAverages) {
  if (state.filters.agent === "all") {
    elements.agentFocusName.textContent = "Selected agent";
    elements.agentFocusNarrative.textContent = "Pick one agent to show an individualized coaching snapshot.";
    elements.agentOverallValue.textContent = "--";
    elements.agentOverallNarrative.textContent = "Latest weighted score summary.";
    elements.agentStrongestValue.textContent = "--";
    elements.agentStrongestNarrative.textContent = "Best-performing KPI this week.";
    elements.agentWeakestValue.textContent = "--";
    elements.agentWeakestNarrative.textContent = "Most urgent KPI to coach this week.";
    return;
  }

  const selectedSummary = pickWeekSummary(filteredRecords, weeklyAverages);
  const rankedKpis = getFocusRankedKpis(selectedSummary);
  const bestKpi = rankedKpis[0] || null;
  const weakestKpi = rankedKpis.at(-1) || null;
  const comparisonWeeklyAverages = getComparisonWeeklyAverages(weeklyAverages, selectedSummary.weekEnding);
  const previousWeek = comparisonWeeklyAverages.length > 1 ? comparisonWeeklyAverages[0] : null;
  const currentWeek = comparisonWeeklyAverages.at(-1) || null;
  const overallDelta =
    currentWeek && previousWeek ? Number(currentWeek.overallScore) - Number(previousWeek.overallScore) : null;

  elements.agentFocusName.textContent = state.filters.agent;
  elements.agentFocusNarrative.textContent = `${weeklyAverages.length} tracked week(s) in the current month filter. Use this as a quick coaching snapshot before reviewing the charts below.`;
  if (isRealtimeFocus()) {
    elements.agentFocusNarrative.textContent = `${weeklyAverages.length} tracked date(s) in the real-time feed. Use this as a quick coaching snapshot before reviewing the charts below.`;
  }
  elements.agentOverallValue.textContent = formatScore(selectedSummary.overallScore);
  elements.agentOverallNarrative.textContent =
    overallDelta === null || Number.isNaN(overallDelta)
      ? isRealtimeFocus()
        ? `Latest available date: ${selectedSummary.weekEnding || "No Data"}.`
        : `Latest available week: ${selectedSummary.weekEnding || "No Data"}.`
      : isRealtimeFocus()
      ? `${currentWeek.weekEnding} moved ${formatSignedDelta(overallDelta)} versus yesterday (${previousWeek.weekEnding}).`
      : `${currentWeek.weekEnding} moved ${formatSignedDelta(overallDelta)} versus ${previousWeek.weekEnding}.`;
  elements.agentStrongestValue.textContent = bestKpi ? `${bestKpi.label} ${formatScore(bestKpi.score)}` : "N/A";
  elements.agentStrongestNarrative.textContent = bestKpi
    ? `${bestKpi.rawText}. This is the best KPI to reinforce.`
    : "No strongest KPI available for the selected view.";
  elements.agentWeakestValue.textContent = weakestKpi ? `${weakestKpi.label} ${formatScore(weakestKpi.score)}` : "N/A";
  elements.agentWeakestNarrative.textContent = weakestKpi
    ? `${weakestKpi.rawText}. This is the KPI to prioritize in coaching.`
    : "No weakest KPI available for the selected view.";
}

function getMostImprovedAgents(records, comparisonWeeklyAverages, limit = 5, metricKey = "overallScore") {
  if (comparisonWeeklyAverages.length < 2) return [];

  const previousWeek = comparisonWeeklyAverages[0]?.weekEnding;
  const currentWeek = comparisonWeeklyAverages.at(-1)?.weekEnding;
  if (!previousWeek || !currentWeek) return [];

  const previousByAgent = new Map();
  const currentByAgent = new Map();

  records.forEach((record) => {
    if (record.weekEnding === previousWeek) previousByAgent.set(record.agentName, record);
    if (record.weekEnding === currentWeek) currentByAgent.set(record.agentName, record);
  });

  return [...currentByAgent.entries()]
    .map(([agentName, currentRecord]) => {
      const previousRecord = previousByAgent.get(agentName);
      if (!previousRecord) return null;
      if (
        typeof currentRecord[metricKey] !== "number" ||
        Number.isNaN(currentRecord[metricKey]) ||
        typeof previousRecord[metricKey] !== "number" ||
        Number.isNaN(previousRecord[metricKey])
      ) {
        return null;
      }

      return {
        agentName,
        delta: currentRecord[metricKey] - previousRecord[metricKey],
        currentOverallScore: currentRecord[metricKey],
        previousOverallScore: previousRecord[metricKey],
      };
    })
    .filter((record) => record && record.delta > 0)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, limit);
}

function buildDeltaMarkup(current, previous) {
  const comparisonUnit = getComparisonUnitLabel();
  if (previous === null || previous === undefined) {
    return `<span class="delta-flat">Flat</span> No previous ${comparisonUnit} available`;
  }
  const delta = current - previous;
  if (delta > 0) return `<span class="delta-up">Up</span> ${Math.abs(delta).toFixed(2)} vs previous ${comparisonUnit}`;
  if (delta < 0) return `<span class="delta-down">Down</span> ${Math.abs(delta).toFixed(2)} vs previous ${comparisonUnit}`;
  return `<span class="delta-flat">Flat</span> 0.00 vs previous ${comparisonUnit}`;
}

function buildTextDelta(current, previous, formatter) {
  const comparisonUnit = getComparisonUnitLabel();
  if (current === null || current === undefined) return `Vs previous ${comparisonUnit} unavailable`;
  if (previous === null || previous === undefined) return `Vs previous ${comparisonUnit} unavailable`;
  return `${formatter(current)} vs ${formatter(previous)} previous ${comparisonUnit}`;
}

function buildCurrentPreviousDetail(label, currentValue, previousValue, formatter) {
  const currentText = currentValue === null || currentValue === undefined ? "N/A" : formatter(currentValue);
  const previousText = previousValue === null || previousValue === undefined ? "N/A" : formatter(previousValue);
  return `${label}: ${currentText} | Previous: ${previousText}`;
}

function hasValidNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

function describeOverallFormula(summary) {
  if (!summary) return "Overall score pending";
  if (summary.overallIncludesQa) {
    return "Performance + Attendance + QA";
  }
  return "Performance + Attendance only | QA pending";
}

function getRawMetricCards(metrics, currentSummary, previousSummary) {
  if (!metrics) return [];

  if (state.dashboardFocus === "all") {
    return [
      ["Average Transfer Rate", formatPercent(metrics.transferRatePercent), buildTextDelta(currentSummary?.transferRatePercent, previousSummary?.transferRatePercent, (value) => formatPercent(value))],
      ["Average Admit Count", metrics.admitsCount === null || metrics.admitsCount === undefined ? "N/A" : metrics.admitsCount.toFixed(2), buildTextDelta(currentSummary?.admitsCount, previousSummary?.admitsCount, (value) => Number(value).toFixed(2))],
      ["Average AHT", formatTimeFromSeconds(metrics.ahtSeconds), buildTextDelta(currentSummary?.ahtSeconds, previousSummary?.ahtSeconds, (value) => formatTimeFromSeconds(value))],
      ["Average Attendance", formatPercent(metrics.attendancePercentValue), buildTextDelta(currentSummary?.attendancePercentValue, previousSummary?.attendancePercentValue, (value) => formatPercent(value))],
      ["Average Quality Assurance", formatPercent(metrics.qaPercentValue), buildTextDelta(currentSummary?.qaPercentValue, previousSummary?.qaPercentValue, (value) => formatPercent(value))],
      ["Agents in Scope", String(metrics.agentCount), buildTextDelta(currentSummary?.agentCount, previousSummary?.agentCount, (value) => `${Math.round(value)} agents`)],
    ];
  }

  if (isPerformanceLikeFocus()) {
    return [
      ["Average Transfer Rate", formatPercent(metrics.transferRatePercent), buildTextDelta(currentSummary?.transferRatePercent, previousSummary?.transferRatePercent, (value) => formatPercent(value))],
      ["Average Admit Count", metrics.admitsCount === null || metrics.admitsCount === undefined ? "N/A" : metrics.admitsCount.toFixed(2), buildTextDelta(currentSummary?.admitsCount, previousSummary?.admitsCount, (value) => Number(value).toFixed(2))],
      ["Average AHT", formatTimeFromSeconds(metrics.ahtSeconds), buildTextDelta(currentSummary?.ahtSeconds, previousSummary?.ahtSeconds, (value) => formatTimeFromSeconds(value))],
      ["Average Inbound Calls", metrics.inboundCalls === null || metrics.inboundCalls === undefined ? "N/A" : metrics.inboundCalls.toFixed(2), buildTextDelta(currentSummary?.inboundCalls, previousSummary?.inboundCalls, (value) => Number(value).toFixed(2))],
      ["Agents in Scope", String(metrics.agentCount), buildTextDelta(currentSummary?.agentCount, previousSummary?.agentCount, (value) => `${Math.round(value)} agents`)],
    ];
  }

  if (state.dashboardFocus === "attendance") {
    return [
      ["Average Attendance", formatPercent(metrics.attendancePercentValue), buildTextDelta(currentSummary?.attendancePercentValue, previousSummary?.attendancePercentValue, (value) => formatPercent(value))],
      ["Attendance Score", formatScore(metrics.attendanceScore), buildTextDelta(currentSummary?.attendanceScore, previousSummary?.attendanceScore, (value) => formatScore(value))],
      ["Agents in Scope", String(metrics.agentCount), buildTextDelta(currentSummary?.agentCount, previousSummary?.agentCount, (value) => `${Math.round(value)} agents`)],
    ];
  }

  return [
    ["Average QA", formatPercent(metrics.qaPercentValue), buildTextDelta(currentSummary?.qaPercentValue, previousSummary?.qaPercentValue, (value) => formatPercent(value))],
    ["QA Score", formatScore(metrics.qaScore), buildTextDelta(currentSummary?.qaScore, previousSummary?.qaScore, (value) => formatScore(value))],
    ["Agents in Scope", String(metrics.agentCount), buildTextDelta(currentSummary?.agentCount, previousSummary?.agentCount, (value) => `${Math.round(value)} agents`)],
  ];
}

function describeSpreadGroup(records, metricKey, label, predicate) {
  const matches = records
    .filter((record) => typeof record[metricKey] === "number" && !Number.isNaN(record[metricKey]))
    .filter((record) => predicate(Number(record[metricKey])))
    .sort((left, right) => right[metricKey] - left[metricKey]);
  const names = matches.map((record) => getSpreadDisplayName(record.agentName)).join(", ");
  return {
    label,
    count: matches.length,
    names: names || "No agents in this group",
  };
}

function getSpreadDisplayName(agentName) {
  if (!agentName) return "";
  const parts = String(agentName).split(",");
  if (parts.length < 2) return String(agentName).trim();
  return parts.slice(1).join(",").trim() || String(agentName).trim();
}

function renderPerformerSpreadSummary(records, metricKey) {
  if (!elements.performerSpreadSummary) return;
  const scored = records.filter((record) => typeof record[metricKey] === "number" && !Number.isNaN(record[metricKey]));
  if (!scored.length) {
    elements.performerSpreadSummary.innerHTML = "";
    return;
  }

  const groups = [
    describeSpreadGroup(scored, metricKey, "Top", (value) => value >= 4),
    describeSpreadGroup(scored, metricKey, "Middle", (value) => value >= 3 && value < 4),
    describeSpreadGroup(scored, metricKey, "Needs Support", (value) => value < 3),
  ];

  elements.performerSpreadSummary.innerHTML = groups.map((group) => `
    <article class="performer-spread-card performer-spread-card-${group.label.toLowerCase().replace(/\s+/g, "-")}">
      <span class="performer-spread-label">${group.label}</span>
      <strong>${group.count}</strong>
      <p>${group.names}</p>
    </article>
  `).join("");
}

function renderRawMetricCards(metrics, currentSummary, previousSummary) {
  const cards = getRawMetricCards(metrics, currentSummary, previousSummary);
  elements.rawMetricsGrid.innerHTML = cards.map(([label, value, delta]) => `
    <article class="raw-card card">
      <span class="raw-label">${label}</span>
      <strong>${value}</strong>
      <p class="raw-delta">${delta}</p>
    </article>
  `).join("");
}

function updateSummaryCards(filteredRecords, weeklyAverages) {
  const metrics = getSummaryMetrics(filteredRecords);

  if (!metrics) {
    if (elements.rawMetricsGrid) {
      elements.rawMetricsGrid.innerHTML = "";
    }
    Object.values(cardMap).forEach((card) => {
      card.value.textContent = "--";
      card.badge.textContent = "-";
      card.badge.className = "score-chip";
      card.raw.textContent = "No data for the selected filters";
      card.delta.innerHTML = "No data for the selected filters";
    });
    return;
  }

  const currentWeekSummary = pickWeekSummary(filteredRecords, weeklyAverages);
  const comparisonWeeklyAverages = getComparisonWeeklyAverages(weeklyAverages, currentWeekSummary.weekEnding);
  const previousWeekSummary = comparisonWeeklyAverages.length > 1 ? comparisonWeeklyAverages[0] : null;
  renderRawMetricCards(metrics, currentWeekSummary, previousWeekSummary);

  const rawText = {
    overall: `${describeOverallFormula(currentWeekSummary)} | Performance ${buildCurrentPreviousDetail("current", currentWeekSummary.performanceScore, previousWeekSummary?.performanceScore, formatScore)} | Attendance ${buildCurrentPreviousDetail("current", currentWeekSummary.attendanceScore, previousWeekSummary?.attendanceScore, formatScore)} | QA ${buildCurrentPreviousDetail("current", currentWeekSummary.qaScore, previousWeekSummary?.qaScore, formatScore)}`,
    transfer: buildCurrentPreviousDetail(
      "Avg transfer rate",
      currentWeekSummary.transferRatePercent,
      previousWeekSummary?.transferRatePercent,
      (value) => formatPercent(value)
    ),
    admits: buildCurrentPreviousDetail(
      "Avg admits count",
      currentWeekSummary.admitsCount,
      previousWeekSummary?.admitsCount,
      (value) => Number(value).toFixed(2)
    ),
    aht: buildCurrentPreviousDetail(
      "Avg handle time",
      currentWeekSummary.ahtSeconds,
      previousWeekSummary?.ahtSeconds,
      (value) => formatTimeFromSeconds(value)
    ),
    attendance: buildCurrentPreviousDetail(
      "Avg attendance",
      currentWeekSummary.attendancePercentValue,
      previousWeekSummary?.attendancePercentValue,
      (value) => formatPercent(value)
    ),
    qa: buildCurrentPreviousDetail(
      "Avg QA",
      currentWeekSummary.qaPercentValue,
      previousWeekSummary?.qaPercentValue,
      (value) => formatPercent(value)
    ),
  };

  if (!hasValidNumber(currentWeekSummary.qaScore)) {
    rawText.qa = "QA data pending | Current: N/A | Previous: N/A";
  }

  const heroIsPerformance = isPerformanceLikeFocus();
  const heroIsAll = state.dashboardFocus === "all";
  elements.overallCardTitle.textContent = heroIsPerformance ? "Performance Score" : "Team Overall Score";

  [
    ["overall", "overallScore"],
    ["transfer", "transferScore"],
    ["admits", "admitsScore"],
    ["aht", "ahtScore"],
    ["attendance", "attendanceScore"],
    ["qa", "qaScore"],
  ].forEach(([cardKey, metricKey]) => {
    const score = metrics[metricKey];
    const card = cardMap[cardKey];
    const effectiveScore = cardKey === "overall" && heroIsPerformance ? metrics.performanceScore : score;
    const effectiveCurrent = cardKey === "overall" && heroIsPerformance ? currentWeekSummary.performanceScore : currentWeekSummary[metricKey];
    const effectivePrevious = cardKey === "overall" && heroIsPerformance ? previousWeekSummary?.performanceScore : previousWeekSummary?.[metricKey];
    card.value.textContent = formatScore(effectiveScore);
    card.badge.textContent =
      effectiveScore === null || effectiveScore === undefined || Number.isNaN(effectiveScore) ? "N/A" : Math.round(effectiveScore);
    card.badge.className = `score-chip ${scoreClassName(effectiveScore)}`;
    card.value.closest(".summary-card")?.setAttribute("data-kpi", cardKey);
    card.raw.textContent = cardKey === "overall" && heroIsPerformance
      ? `Transfer ${buildCurrentPreviousDetail("current", currentWeekSummary.transferScore, previousWeekSummary?.transferScore, formatScore)} | Admits ${buildCurrentPreviousDetail("current", currentWeekSummary.admitsScore, previousWeekSummary?.admitsScore, formatScore)} | AHT ${buildCurrentPreviousDetail("current", currentWeekSummary.ahtScore, previousWeekSummary?.ahtScore, formatScore)}`
      : cardKey === "overall" && heroIsAll
        ? rawText.overall
      : rawText[cardKey];
    card.delta.innerHTML = buildDeltaMarkup(effectiveCurrent, effectivePrevious);
  });
}

function syncFilterOptions() {
  const activeDataset = getActiveDataset();
  const realtimeFocus = isRealtimeFocus();

  populateSelect(elements.monthFilter, activeDataset.monthOptions, realtimeFocus ? "Real Time" : "All Months");

  const weekOptions = realtimeFocus
    ? activeDataset.weekOptions
    : getAvailableWeeks(activeDataset.records, state.filters.month);
  populateSelect(elements.weekFilter, weekOptions, realtimeFocus ? "All Dates" : "All Weeks");
  if (!weekOptions.includes(state.filters.week)) state.filters.week = weekOptions.at(-1) || "all";

  const agentOptions = getAvailableAgents(activeDataset.records, realtimeFocus ? "all" : state.filters.month, state.filters.week);
  populateSelect(elements.agentFilter, agentOptions, "All Agents");
  if (!agentOptions.includes(state.filters.agent)) state.filters.agent = "all";

  if (realtimeFocus) {
    state.filters.month = "all";
    const realtimeEntries = getRealtimeDateEntries().filter((item) => item.weekDate instanceof Date && !Number.isNaN(item.weekDate.getTime()));
    const minIsoDate = realtimeEntries[0]?.weekDate ? getDateKey(realtimeEntries[0].weekDate) : "";
    const maxIsoDate = realtimeEntries.at(-1)?.weekDate ? getDateKey(realtimeEntries.at(-1).weekDate) : "";
    const selectedIsoDate = getIsoDateFromWeekValue(state.filters.week) || maxIsoDate;
    if (elements.dateFilter) {
      elements.dateFilter.min = minIsoDate;
      elements.dateFilter.max = maxIsoDate;
      elements.dateFilter.value = selectedIsoDate;
    }
  }

  elements.monthFilter.value = state.filters.month;
  elements.weekFilter.value = state.filters.week;
  elements.agentFilter.value = state.filters.agent;
}

function updateCharts(filteredRecords, weeklyAverages, scopedRecords, trendWeeklyAverages = weeklyAverages) {
  const weekSummary = pickWeekSummary(filteredRecords, weeklyAverages);
  const chartRecords =
    state.filters.week === "all"
      ? filteredRecords.filter((record) => record.weekEnding === weekSummary.weekEnding)
      : filteredRecords;

  const comparisonWeeklyAverages = getComparisonWeeklyAverages(weeklyAverages, weekSummary.weekEnding);

  if (elements.comparisonTitle && elements.comparisonSubnote) {
    const selectedWeek = comparisonWeeklyAverages.at(-1)?.weekEnding || (isRealtimeFocus() ? "Selected Date" : "Selected Week");
    const previousWeek = comparisonWeeklyAverages.length > 1 ? comparisonWeeklyAverages[0]?.weekEnding : isRealtimeFocus() ? "No yesterday data" : `No previous ${getComparisonUnitLabel()}`;
    const qaPending = !hasValidNumber(weekSummary.qaScore);
    elements.comparisonTitle.textContent = state.dashboardFocus === "all"
      ? `Selected ${getComparisonUnitLabel()} vs previous ${getComparisonUnitLabel()}`
      : isRealtimeFocus()
      ? `${FOCUS_SCORING[state.dashboardFocus].title} vs yesterday`
      : `${FOCUS_SCORING[state.dashboardFocus].title} vs previous ${getComparisonUnitLabel()}`;
    elements.comparisonSubnote.textContent =
      comparisonWeeklyAverages.length > 1
        ? isRealtimeFocus()
          ? `${selectedWeek} vs yesterday (${previousWeek}).${qaPending ? " QA is pending and excluded from overall where missing." : ""}`
          : `${selectedWeek} vs ${previousWeek}.${qaPending ? " QA is pending and excluded from overall where missing." : ""}`
        : isRealtimeFocus()
        ? `${selectedWeek} has no yesterday data available.${qaPending ? " QA is pending and excluded from overall where missing." : ""}`
        : `${selectedWeek} has no prior ${getComparisonUnitLabel()}.${qaPending ? " QA is pending and excluded from overall where missing." : ""}`;
  }

  if (elements.rankingSubnote) {
    const qaPending = !hasValidNumber(weekSummary.qaScore);
    elements.rankingSubnote.textContent =
      state.filters.week !== "all"
        ? `${FOCUS_SCORING[state.dashboardFocus].title} spread for ${state.filters.week}. This shows where the team is clustering from top to trailing groups.${qaPending ? " QA pending is excluded from overall where missing." : ""}`
        : `Latest ${FOCUS_SCORING[state.dashboardFocus].title.toLowerCase()} spread within ${state.filters.month === "all" ? "this view" : state.filters.month}. This shows where the team is clustering from top to trailing groups.${qaPending ? " QA pending is excluded from overall where missing." : ""}`;
  }

  state.charts.trend = renderLineChart(elements.trendChart, state.charts.trend, trendWeeklyAverages, state.dashboardFocus);
  state.charts.weekScore = renderBarChart(elements.weekScoreChart, state.charts.weekScore, weekSummary, state.dashboardFocus);
  state.charts.contribution = renderContributionChart(elements.contributionChart, state.charts.contribution, weekSummary);
  state.charts.variance = renderVarianceChart(elements.varianceChart, state.charts.variance, comparisonWeeklyAverages, state.dashboardFocus);
  state.charts.transferDistribution = renderDistributionChart(
    elements.transferDistributionChart,
    state.charts.transferDistribution,
    chartRecords,
    "transferScore",
    "Transfer Distribution",
    "#3B82F6"
  );
  state.charts.admitsDistribution = renderDistributionChart(
    elements.admitsDistributionChart,
    state.charts.admitsDistribution,
    chartRecords,
    "admitsScore",
    "Admits Distribution",
    "#10B981"
  );
  state.charts.ahtDistribution = renderDistributionChart(
    elements.ahtDistributionChart,
    state.charts.ahtDistribution,
    chartRecords,
    "ahtScore",
    "AHT Distribution",
    "#F59E0B"
  );
  state.charts.attendanceDistribution = renderDistributionChart(
    elements.attendanceDistributionChart,
    state.charts.attendanceDistribution,
    chartRecords,
    "attendanceScore",
    "Attendance Distribution",
    "#8B5CF6"
  );
  state.charts.qaDistribution = renderDistributionChart(
    elements.qaDistributionChart,
    state.charts.qaDistribution,
    chartRecords,
    "qaScore",
    "QA Distribution",
    "#EC4899"
  );
  state.charts.performerSpread = renderScoreSpreadChart(
    elements.performerSpreadChart,
    state.charts.performerSpread,
    chartRecords,
    {
      scoreKey: FOCUS_SCORING[state.dashboardFocus].metricKey,
      scoreLabel: FOCUS_SCORING[state.dashboardFocus].title,
    }
  );
  renderPerformerSpreadSummary(chartRecords, FOCUS_SCORING[state.dashboardFocus].metricKey);
  state.charts.stacked = renderStackedBarChart(elements.stackedChart, state.charts.stacked, chartRecords, openBreakdownDrilldown, state.dashboardFocus);
  state.charts.comparison = renderComparisonChart(
    elements.comparisonChart,
    state.charts.comparison,
    comparisonWeeklyAverages,
    state.dashboardFocus
  );
}

function handleRowToggle(rowKey) {
  if (state.expandedRowKeys.has(rowKey)) {
    state.expandedRowKeys.delete(rowKey);
  } else {
    state.expandedRowKeys.add(rowKey);
  }
  updateTable(getFilteredRecords(getActiveDataset().records, state.filters));
}

function updateTable(filteredRecords) {
  const tableOptions = {
    showLastUpdated: shouldShowRealtimeLastUpdated(),
  };
  state.expandedRowKeys = new Set(
    [...state.expandedRowKeys].filter((key) => filteredRecords.some((record) => record.key === key))
  );
  initializeTable(elements.tableHeadRow, handleSortChange, state.sort, state.dashboardFocus, tableOptions);
  renderTableSummary(elements.tableSummaryStrip, filteredRecords, state.dashboardFocus);
  renderTable(
    elements.tableBody,
    sortRecords(filteredRecords, state.sort),
    state.expandedRowKeys,
    handleRowToggle,
    state.dashboardFocus,
    tableOptions
  );
}

function updateStatus(filteredRecords) {
  if (isRealtimeFocus()) {
    const showLastUpdated = shouldShowRealtimeLastUpdated();
    const totalAgents = new Set(filteredRecords.map((record) => record.agentName)).size;
    const totalDates = new Set(filteredRecords.map((record) => record.weekEnding)).size;
    const latestUpdated = [...filteredRecords]
      .map((record) => record.lastUpdatedAt)
      .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
      .sort((left, right) => left.getTime() - right.getTime())
      .at(-1);
    elements.dataStatusText.textContent =
      state.filters.agent === "all"
        ? `${filteredRecords.length} live rows across ${totalAgents} agents and ${totalDates} date(s).${showLastUpdated && latestUpdated ? ` Last updated ${latestUpdated.toLocaleString("en-US")}.` : ""}`
        : `${filteredRecords.length} live rows for ${state.filters.agent} across ${totalDates} date(s).${showLastUpdated && latestUpdated ? ` Last updated ${latestUpdated.toLocaleString("en-US")}.` : ""}`;
    if (elements.realtimeLastUpdatedText) {
      elements.realtimeLastUpdatedText.textContent = showLastUpdated && latestUpdated ? latestUpdated.toLocaleString("en-US") : "--";
    }
    if (elements.realtimeLastUpdatedPill) {
      elements.realtimeLastUpdatedPill.hidden = !showLastUpdated;
    }
    return;
  }

  const totalAgents = new Set(filteredRecords.map((record) => record.agentName)).size;
  const totalWeeks = new Set(filteredRecords.map((record) => record.weekEnding)).size;
  const qaAvailable = filteredRecords.some((record) => hasValidNumber(record.qaScore));
  elements.dataStatusText.textContent =
    state.filters.agent === "all"
      ? `${filteredRecords.length} score rows across ${totalAgents} agents and ${totalWeeks} weeks.${qaAvailable ? "" : " QA data is pending, so overall rankings are using the available KPIs only."}`
      : `${filteredRecords.length} score rows for ${state.filters.agent} across ${totalWeeks} week(s).${qaAvailable ? "" : " QA data is pending, so overall scores are using the available KPIs only."}`;
}

function updateLayoutVisibility() {
  const isAgentView = state.filters.agent !== "all";
  elements.teamOnlySections.forEach((section) => {
    section.classList.toggle("is-hidden", isAgentView);
  });
  elements.agentOnlySections.forEach((section) => {
    section.classList.toggle("is-hidden", !isAgentView);
  });

  const focus = state.dashboardFocus;
  elements.summaryCards.forEach((card) => {
    const group = card.dataset.focusGroup;
    const kpi = card.dataset.kpi;
    const visible =
      !group
        ? true
        : focus === "all"
        ? true
        : (focus === "performance" || focus === "realtime")
          ? group === "performance"
          : kpi === "overall" || group === focus;
    card.classList.toggle("is-hidden", !visible);
  });

  elements.focusGroupedNodes.forEach((node) => {
    const visible = focus === "all"
      ? true
      : (focus === "performance" || focus === "realtime")
      ? node.dataset.focusGroup === "performance"
      : node.dataset.focusGroup === focus;
    node.classList.toggle("is-hidden", !visible);
  });

  elements.contributionCard?.classList.toggle("is-hidden", focus === "performance" || focus === "realtime");
}

function updateDashboard() {
  const activeDataset = getActiveDataset();
  const dashboardRecords = getFilteredRecords(activeDataset.records, { ...state.filters, search: "" });
  const tableRecords = getFilteredRecords(activeDataset.records, state.filters);
  const trendRecords = getFilteredRecords(activeDataset.records, {
    ...state.filters,
    month: isRealtimeFocus() ? "all" : state.filters.month,
    week: "all",
    search: "",
  });
  const weeklyAverages = getScopedWeeklyAverages(trendRecords);
  const selectedSummary = pickWeekSummary(dashboardRecords, weeklyAverages);
  const trendWeeklyAverages = getTrendWeeklyAverages(weeklyAverages, selectedSummary.weekEnding);

  state.distributionDrilldownOpen = false;
  applyDistributionDrilldownState();

  updateInsights(dashboardRecords, weeklyAverages);
  updateSummaryCards(dashboardRecords, weeklyAverages);
  updateAgentFocus(dashboardRecords, weeklyAverages);
  updateCharts(dashboardRecords, weeklyAverages, trendRecords, trendWeeklyAverages);
  updateTable(tableRecords);
  updateStatus(dashboardRecords);
  updateLayoutVisibility();
}

function applyDashboardFocus() {
  const focusLabel = FOCUS_SCORING[state.dashboardFocus].title;
  const realtimeFocus = isRealtimeFocus();
  const performanceLike = isPerformanceLikeFocus();
  if (realtimeFocus) {
    state.filters.month = "all";
    state.filters.week = getLatestRealtimeWeek();
  }
  syncFilterOptions();
  if (elements.appShell) {
    elements.appShell.dataset.dashboardFocus = state.dashboardFocus;
  }
  elements.focusButtons.forEach((button) => {
    const active = button.dataset.dashboardFocus === state.dashboardFocus;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  if (elements.monthFilterField && elements.weekFilterField && elements.monthFilterLabel && elements.weekFilterLabel) {
    elements.monthFilterField.classList.toggle("is-hidden", realtimeFocus);
    elements.weekFilterLabel.textContent = realtimeFocus ? "Date" : "Week Ending";
    elements.monthFilterLabel.textContent = "Month";
  }
  if (elements.topFiltersTitle) {
    elements.topFiltersTitle.textContent = realtimeFocus
      ? "Filter by date and agent"
      : "Filter by month, week, and agent";
  }
  if (elements.weekFilter && elements.dateFilter) {
    elements.weekFilter.hidden = realtimeFocus;
    elements.dateFilter.hidden = !realtimeFocus;
  }
  if (elements.realtimeLastUpdatedPill && elements.realtimeLastUpdatedText) {
    elements.realtimeLastUpdatedPill.hidden = !shouldShowRealtimeLastUpdated();
    const activeDataset = getActiveDataset();
    elements.realtimeLastUpdatedText.textContent = realtimeFocus
      ? shouldShowRealtimeLastUpdated()
        ? activeDataset?.lastUpdatedDisplay || "N/A"
        : "--"
      : "--";
  }

  if (elements.trendSectionTitle) {
    elements.trendSectionTitle.textContent = state.dashboardFocus === "all"
      ? "Weekly KPI trends"
      : realtimeFocus
      ? "Real-time performance trends"
      : performanceLike
      ? "Weekly performance trends"
      : `Weekly ${focusLabel.toLowerCase()} trends`;
  }
  if (elements.snapshotSectionTitle) {
    elements.snapshotSectionTitle.textContent = realtimeFocus ? "Real-time performance snapshot" : state.dashboardFocus === "all" ? "KPI score snapshot" : `${focusLabel} score snapshot`;
  }
  if (elements.varianceSectionTitle) {
    elements.varianceSectionTitle.textContent = realtimeFocus ? "Previous date variance" : state.dashboardFocus === "all" ? "KPI variance" : `${focusLabel} variance`;
  }
  if (elements.rankingSectionTitle) {
    elements.rankingSectionTitle.textContent = realtimeFocus ? "Real-time performance spread" : state.dashboardFocus === "all" ? "Overall score spread" : `${focusLabel} score spread`;
  }
  if (elements.bottomSectionTitle) {
    elements.bottomSectionTitle.textContent = state.dashboardFocus === "all" ? "Bottom 5 agents" : `Bottom 5 ${focusLabel.toLowerCase()} agents`;
  }
  if (elements.improvedSectionTitle) {
    elements.improvedSectionTitle.textContent = state.dashboardFocus === "all" ? "Most improved agents" : `Most improved ${focusLabel.toLowerCase()} agents`;
  }
  if (elements.breakdownSectionTitle) {
    elements.breakdownSectionTitle.textContent = state.dashboardFocus === "all"
      ? "KPI breakdown per agent"
      : performanceLike
      ? "Performance KPI breakdown per agent"
      : `${focusLabel} breakdown per agent`;
  }
  if (elements.distributionSectionTitle) {
    elements.distributionSectionTitle.textContent = state.dashboardFocus === "all"
      ? "Agent score distribution by KPI"
      : performanceLike
      ? "Performance KPI score distribution"
      : `${focusLabel} score distribution`;
  }
  if (elements.tableSectionTitle) {
    elements.tableSectionTitle.textContent = state.dashboardFocus === "all"
      ? "All agents KPI score table"
      : realtimeFocus
      ? "Real-time performance table"
      : performanceLike
      ? "Performance KPI score table"
      : `${focusLabel} score table`;
  }
  if (elements.tableSectionSubnote) {
    elements.tableSectionSubnote.textContent = state.dashboardFocus === "all"
      ? "Balanced weekly view across performance, attendance, and quality assurance."
      : realtimeFocus
      ? "Live CTM performance rows by date, compared against yesterday when available."
      : performanceLike
      ? "Focused on transfer, admits, and AHT rows for the selected scope."
      : state.dashboardFocus === "attendance"
        ? "Focused on attendance score movement, with performance and overall kept for context."
        : "Focused on quality assurance rows, with performance and overall kept for context.";
  }
  if (elements.tableRowHint) {
    elements.tableRowHint.textContent = performanceLike
      ? "Click any row to view grouped Transfer, Admits, and AHT details."
      : "Click any row to open the detailed KPI breakdown.";
  }
  if (elements.tableSearch) {
    elements.tableSearch.placeholder = state.dashboardFocus === "all"
      ? "Search agent, week, or KPI row"
      : realtimeFocus
      ? "Search agent, date, or real-time row"
      : performanceLike
      ? "Search agent, week, or performance row"
      : state.dashboardFocus === "attendance"
        ? "Search agent, week, or attendance row"
        : "Search agent, week, or quality row";
  }

  state.mobileDistributionPanel = FOCUS_SCORING[state.dashboardFocus].distribution;
  applyMobileDistributionState();
  updateDashboard();
}

function handleSortChange(key) {
  if (state.sort.key === key) {
    state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
  } else {
    state.sort.key = key;
    state.sort.direction = key === "agentName" || key === "weekEnding" ? "asc" : "desc";
  }
  updateTable(getFilteredRecords(getActiveDataset().records, state.filters));
}

function bindNavigation() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      elements.navButtons.forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      state.mobileSidebarOpen = false;
      applyMobileUiState();
    });
  });
}

function bindViewportEvents() {
  window.addEventListener("resize", () => {
    if (state.resizeRaf) {
      cancelAnimationFrame(state.resizeRaf);
    }
    state.resizeRaf = requestAnimationFrame(() => {
      state.resizeRaf = null;
      if (state.dataset) {
        if (window.innerWidth > 720) {
          state.mobileTableExpanded = true;
          state.mobileFiltersExpanded = true;
          state.mobileSidebarOpen = false;
          state.floatingLegendOpen = false;
          state.mobileMoreOpen = false;
        }
        applyMobileUiState();
        applyMobileMoreState();
        applyMobileDistributionState();
        applyFloatingLegendState();
        updateDashboard();
      }
    });
  });
}

function bindEvents() {
  elements.mobileMenuToggle?.addEventListener("click", () => {
    state.mobileSidebarOpen = !state.mobileSidebarOpen;
    applyMobileUiState();
  });

  elements.mobileHomeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      let targetId = button.dataset.mobileTarget;
      if (state.filters.agent !== "all" && (targetId === "summaryCards" || targetId === "agentsSection")) {
        targetId = "agentFocusSection";
      }
      if (targetId === "tableSection") {
        state.mobileTableExpanded = true;
        applyMobileUiState();
        setMobileDockActive("table");
      } else if (targetId === "summaryCards" || targetId === "agentFocusSection") {
        setMobileDockActive("summary");
      } else if (targetId === "agentsSection") {
        setMobileDockActive("agents");
      } else {
        setMobileDockActive("home");
      }
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  elements.mobileLegendLauncher?.addEventListener("click", () => {
    state.mobileMoreOpen = false;
    applyMobileMoreState();
    state.floatingLegendOpen = true;
    applyFloatingLegendState();
    setMobileDockActive("more");
  });

  elements.mobileFiltersLauncher?.addEventListener("click", () => {
    state.mobileMoreOpen = false;
    applyMobileMoreState();
    state.mobileFiltersExpanded = true;
    applyMobileUiState();
    setMobileDockActive("more");
    document.getElementById("filtersSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.mobileBottomNavButtons.forEach((button) => {
    button.addEventListener("click", () => {
      triggerMobileAction(button.dataset.mobileAction);
    });
  });

  elements.mobileDistributionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileDistributionPanel = button.dataset.distributionPanel;
      applyMobileDistributionState();
    });
  });

  elements.floatingLegendToggle?.addEventListener("click", () => {
    state.floatingLegendOpen = !state.floatingLegendOpen;
    applyFloatingLegendState();
    if (state.floatingLegendOpen) {
      setMobileDockActive("more");
    }
  });

  elements.floatingLegendClose?.addEventListener("click", () => {
    state.floatingLegendOpen = false;
    applyFloatingLegendState();
    setMobileDockActive("home");
  });

  elements.mobileMoreClose?.addEventListener("click", () => {
    state.mobileMoreOpen = false;
    applyMobileMoreState();
    setMobileDockActive("home");
  });

  elements.mobileMoreLegend?.addEventListener("click", () => {
    state.mobileMoreOpen = false;
    applyMobileMoreState();
    state.floatingLegendOpen = true;
    applyFloatingLegendState();
    setMobileDockActive("more");
  });

  elements.mobileMoreFilters?.addEventListener("click", () => {
    state.mobileMoreOpen = false;
    applyMobileMoreState();
    state.mobileFiltersExpanded = true;
    applyMobileUiState();
    document.getElementById("filtersSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileDockActive("more");
  });

  elements.mobileMoreExport?.addEventListener("click", () => {
    const filteredRecords = sortRecords(getFilteredRecords(getActiveDataset().records, state.filters), state.sort);
    exportRowsToCsv(filteredRecords, state.dashboardFocus, { showLastUpdated: shouldShowRealtimeLastUpdated() });
    state.mobileMoreOpen = false;
    applyMobileMoreState();
    setMobileDockActive("more");
  });

  elements.mobileMoreReset?.addEventListener("click", () => {
    resetDashboardFilters();
    state.mobileMoreOpen = false;
    applyMobileMoreState();
    setMobileDockActive("home");
  });

  elements.distributionDrilldownClose?.addEventListener("click", () => {
    state.distributionDrilldownOpen = false;
    state.distributionDrilldownExpanded = false;
    state.distributionDrilldownDetail = null;
    applyDistributionDrilldownState();
  });

  elements.distributionDrilldownList?.addEventListener("click", (event) => {
    const trigger = event.target.closest(".distribution-drilldown-more");
    if (!trigger) return;
    state.distributionDrilldownExpanded = true;
    renderDistributionDrilldownContent();
  });

  elements.tableCollapseToggle?.addEventListener("click", () => {
    state.mobileTableExpanded = !state.mobileTableExpanded;
    applyMobileUiState();
  });

  elements.filtersCollapseToggle?.addEventListener("click", () => {
    state.mobileFiltersExpanded = !state.mobileFiltersExpanded;
    applyMobileUiState();
  });

  elements.mobileTableToggle?.addEventListener("click", () => {
    state.mobileTableExpanded = !state.mobileTableExpanded;
    applyMobileUiState();
    if (state.mobileTableExpanded) {
      setMobileDockActive("table");
    }
    document.getElementById("tableSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.monthFilter.addEventListener("change", (event) => {
    state.filters.month = event.target.value;
    syncFilterOptions();
    updateDashboard();
  });

  elements.weekFilter.addEventListener("change", (event) => {
    state.filters.week = event.target.value;
    syncFilterOptions();
    updateDashboard();
  });

  elements.dateFilter?.addEventListener("change", (event) => {
    const nextWeekValue = getWeekValueFromIsoDate(event.target.value);
    if (nextWeekValue) {
      state.filters.week = nextWeekValue;
      syncFilterOptions();
      updateDashboard();
      return;
    }

    syncFilterOptions();
  });

  elements.agentFilter.addEventListener("change", (event) => {
    state.filters.agent = event.target.value;
    updateDashboard();
  });

  elements.tableSearch.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    updateDashboard();
  });

  elements.expandAllRowsButton?.addEventListener("click", () => {
    const filteredRecords = sortRecords(getFilteredRecords(getActiveDataset().records, state.filters), state.sort);
    state.expandedRowKeys = new Set(filteredRecords.map((record) => record.key));
    updateTable(filteredRecords);
  });

  elements.collapseAllRowsButton?.addEventListener("click", () => {
    state.expandedRowKeys = new Set();
    updateTable(getFilteredRecords(getActiveDataset().records, state.filters));
  });

  elements.resetFilters.addEventListener("click", () => {
    resetDashboardFilters();
  });

  elements.focusButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.dashboardFocus = button.dataset.dashboardFocus || "all";
      state.sort = {
        key: FOCUS_SCORING[state.dashboardFocus].metricKey,
        direction: "desc",
      };
      applyDashboardFocus();
    });
  });

  elements.exportCsvButton.addEventListener("click", () => {
    const filteredRecords = sortRecords(getFilteredRecords(getActiveDataset().records, state.filters), state.sort);
    exportRowsToCsv(filteredRecords, state.dashboardFocus, { showLastUpdated: shouldShowRealtimeLastUpdated() });
  });
}

async function init() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;

  try {
    elements.dataStatusText.textContent = "Loading Google Sheets data and calculating KPI scores.";
    const rawDatasets = await loadAllDatasets();
    state.dataset = buildKpiDataset(rawDatasets);
    state.realtimeDataset = buildRealtimeDataset(rawDatasets);
    state.filters.month = state.dataset.monthOptions.at(-1) || "all";
    state.filters.week = state.dataset.weekOptions.at(-1) || "all";

    initializeMobileDefaults();
    syncFilterOptions();
    initializeFloatingLegend();
    bindNavigation();
    bindSummaryCardInteractions();
    bindEvents();
    bindViewportEvents();
    bindMobileScrollSpy();
    applyMobileUiState();
    applyMobileMoreState();
    applyMobileDistributionState();
    applyFloatingLegendState();
    applyDistributionDrilldownState();
    applyDashboardFocus();
  } catch (error) {
    state.initialized = false;
    console.error(error);
    elements.dataStatusText.textContent = "The dashboard could not load the CSV sources. Check the published sheet permissions and try again.";
    elements.tableBody.innerHTML = '<tr><td colspan="14"><div class="status-message">Unable to load dashboard data.</div></td></tr>';
  }
}

const authRequired = document.body?.dataset.requireAuth === "true";

if (!authRequired) {
  init();
} else {
  if (window.__flylandAuthState?.authorized) {
    init();
  }

  window.addEventListener("flyland:auth-granted", () => {
    init();
  });
}
