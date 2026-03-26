import React, { useMemo, useState } from "react";

/*
  Australian Investment Property Calculator
  Single-file React app
*/

const defaultInputs = {
  monthlyNetIncome: 8570,
  monthlyRentPaid: 3683,
  monthlyRentReceivedFromTenant: 867,
  monthlyLivingCosts: 2200,
  startingCashSavings: 215000,
  emergencyBuffer: 50000,
  propertyPrice: 550000,
  depositPercent: 20,
  purchaseCostPercent: 6,
  loanInterestRatePercent: 8,
  loanTermYears: 30,
  loanType: "principal_and_interest",
  weeklyRent: 450,
  vacancyWeeks: 2,
  annualRentGrowthPercent: 3,
  propertyManagementPercent: 7,
  annualMaintenance: 2000,
  annualCouncilRates: 1500,
  annualInsurance: 1200,
  annualLandTax: 1500,
  marginalTaxRatePercent: 39,
  annualCapitalGrowthPercent: 5,
  annualExpenseInflationPercent: 3,
  extraMonthlyRepayment: 0,
  projectionYears: 15,
  usableEquityThresholdPercent: 80,
  secondPropertyTargetPrice: 550000,
  secondPropertyDepositPercent: 20,
  secondPropertyPurchaseCostPercent: 6,
  secondPropertyWeeklyRent: 500,
  secondPropertyInterestRate: 8,
  secondPropertyOtherAnnualCostsEstimate: 6500,
};

const scenarioPrices = [450000, 500000, 550000, 600000, 650000];

const moneyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Converts a user-provided value into a number and falls back when parsing fails.
 */
function parseNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Restricts a numeric value to a minimum and maximum range.
 */
function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Converts a whole-number percentage like 8 into a decimal like 0.08.
 */
function toPercent(value) {
  return parseNumber(value) / 100;
}

/**
 * Formats a numeric value as Australian currency.
 */
function formatCurrency(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return moneyFormatter.format(safeValue);
}

/**
 * Formats a plain number using Australian locale rules.
 */
function formatNumber(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return numberFormatter.format(safeValue);
}

/**
 * Formats a numeric percentage value with two decimal places.
 */
function formatPercent(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(2)}%`;
}

/**
 * Builds a friendly label for projection rows and chart axes.
 */
function formatYearLabel(year) {
  return year === 0 ? "Now" : `Year ${year}`;
}

/**
 * Calculates the standard monthly repayment for an amortizing loan.
 */
function getMonthlyPayment(principal, annualRate, totalMonths) {
  const loanPrincipal = Math.max(0, principal);
  const months = Math.max(1, Math.round(totalMonths));

  if (loanPrincipal <= 0) {
    return 0;
  }

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return loanPrincipal / months;
  }

  const factor = Math.pow(1 + monthlyRate, months);
  return (loanPrincipal * monthlyRate * factor) / (factor - 1);
}

/**
 * Simulates one year of loan activity and returns the updated balance and repayment totals.
 */
function getLoanSnapshot(startBalance, annualRate, remainingTermMonths, loanType, extraMonthlyRepayment) {
  const safeBalance = Math.max(0, startBalance);
  const safeExtra = Math.max(0, extraMonthlyRepayment);
  const monthlyRate = annualRate / 12;
  let balance = safeBalance;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalScheduledPayment = 0;
  let totalActualCashPaid = 0;
  const monthsThisYear = 12;

  if (balance <= 0) {
    return {
      endBalance: 0,
      interestPaid: 0,
      principalPaid: 0,
      scheduledPayment: 0,
      totalCashPaid: 0,
    };
  }

  for (let month = 0; month < monthsThisYear; month += 1) {
    if (balance <= 0) {
      break;
    }

    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    let scheduledPayment = 0;
    let principalPayment = 0;

    if (loanType === "interest_only") {
      scheduledPayment = interest;
      principalPayment = Math.min(balance, safeExtra);
    } else {
      const monthsLeft = Math.max(1, remainingTermMonths - month);
      scheduledPayment = getMonthlyPayment(balance, annualRate, monthsLeft);
      principalPayment = Math.max(0, scheduledPayment - interest) + safeExtra;
      principalPayment = Math.min(balance, principalPayment);
    }

    balance = Math.max(0, balance - principalPayment);
    totalInterest += interest;
    totalPrincipal += principalPayment;
    totalScheduledPayment += scheduledPayment;
    totalActualCashPaid += scheduledPayment + (loanType === "interest_only" ? principalPayment : safeExtra);
  }

  return {
    endBalance: balance,
    interestPaid: totalInterest,
    principalPaid: totalPrincipal,
    scheduledPayment: totalScheduledPayment,
    totalCashPaid: totalActualCashPaid,
  };
}

/**
 * Estimates the household's monthly surplus before adding the investment property.
 */
function getBaseHouseholdSurplus(values) {
  return (
    parseNumber(values.monthlyNetIncome) -
    ((parseNumber(values.monthlyRentPaid) - parseNumber(values.monthlyRentReceivedFromTenant)) +
      parseNumber(values.monthlyLivingCosts))
  );
}

/**
 * Normalizes inputs and produces the headline metrics for the current purchase scenario.
 */
function calculateDeal(rawValues) {
  const values = {
    ...defaultInputs,
    ...rawValues,
  };

  const propertyPrice = Math.max(0, parseNumber(values.propertyPrice));
  const depositPercent = clampNumber(toPercent(values.depositPercent), 0, 1);
  const purchaseCostPercent = clampNumber(toPercent(values.purchaseCostPercent), 0, 1);
  const interestRate = clampNumber(toPercent(values.loanInterestRatePercent), 0, 1);
  const loanTermYears = Math.max(1, parseNumber(values.loanTermYears, 30));
  const loanTermMonths = loanTermYears * 12;
  const taxRate = clampNumber(toPercent(values.marginalTaxRatePercent), 0, 1);
  const vacancyWeeks = clampNumber(parseNumber(values.vacancyWeeks), 0, 52);
  const annualRentGrowth = toPercent(values.annualRentGrowthPercent);
  const managementPercent = clampNumber(toPercent(values.propertyManagementPercent), 0, 1);
  const expenseInflation = toPercent(values.annualExpenseInflationPercent);
  const annualGrowth = toPercent(values.annualCapitalGrowthPercent);
  const extraMonthlyRepayment = Math.max(0, parseNumber(values.extraMonthlyRepayment));
  const projectionYears = Math.max(1, Math.round(parseNumber(values.projectionYears, 15)));
  const usableEquityThreshold = clampNumber(toPercent(values.usableEquityThresholdPercent), 0, 1);

  const depositAmount = propertyPrice * depositPercent;
  const purchaseCosts = propertyPrice * purchaseCostPercent;
  const totalCashNeededUpfront = depositAmount + purchaseCosts;
  const remainingSavingsAfterPurchase = parseNumber(values.startingCashSavings) - totalCashNeededUpfront;
  const loanAmount = Math.max(0, propertyPrice - depositAmount);

  const annualRentBeforeVacancy = parseNumber(values.weeklyRent) * 52;
  const annualRentAfterVacancy = parseNumber(values.weeklyRent) * (52 - vacancyWeeks);
  const annualManagementFee = annualRentAfterVacancy * managementPercent;
  const annualNonLoanCosts =
    annualManagementFee +
    parseNumber(values.annualMaintenance) +
    parseNumber(values.annualCouncilRates) +
    parseNumber(values.annualInsurance) +
    parseNumber(values.annualLandTax);

  const yearOneLoan = getLoanSnapshot(
    loanAmount,
    interestRate,
    loanTermMonths,
    values.loanType,
    extraMonthlyRepayment
  );

  const annualLoanCost = yearOneLoan.totalCashPaid;
  const annualBeforeTaxResult = annualRentAfterVacancy - annualNonLoanCosts - annualLoanCost;
  const taxAdjustment =
    annualBeforeTaxResult < 0
      ? Math.abs(annualBeforeTaxResult) * taxRate
      : -annualBeforeTaxResult * taxRate;
  const annualAfterTaxResult = annualBeforeTaxResult + taxAdjustment;
  const monthlyAfterTaxPropertyResult = annualAfterTaxResult / 12;
  const currentHouseholdSurplusBeforeInvestment = getBaseHouseholdSurplus(values);
  const householdSurplusAfterInvestment =
    currentHouseholdSurplusBeforeInvestment + monthlyAfterTaxPropertyResult;

  const projection = generateProjection({
    inputs: values,
    loanAmount,
    propertyPrice,
    annualRentAfterVacancy,
    annualNonLoanCosts,
    annualGrowth,
    annualRentGrowth,
    expenseInflation,
    interestRate,
    taxRate,
    loanTermMonths,
    extraMonthlyRepayment,
    projectionYears,
    usableEquityThreshold,
    currentHouseholdSurplusBeforeInvestment,
  });

  const secondPropertyReadiness = calculateSecondPropertyReadiness(values, projection, remainingSavingsAfterPurchase);

  return {
    inputs: values,
    depositAmount,
    purchaseCosts,
    totalCashNeededUpfront,
    remainingSavingsAfterPurchase,
    loanAmount,
    annualRentBeforeVacancy,
    annualRentAfterVacancy,
    annualManagementFee,
    annualNonLoanCosts,
    annualLoanCost,
    annualBeforeTaxResult,
    annualAfterTaxResult,
    monthlyAfterTaxPropertyResult,
    currentHouseholdSurplusBeforeInvestment,
    householdSurplusAfterInvestment,
    firstYearInterest: yearOneLoan.interestPaid,
    firstYearPrincipal: yearOneLoan.principalPaid,
    projection,
    secondPropertyReadiness,
  };
}

/**
 * Builds the year-by-year property, debt, and cash flow projection.
 */
function generateProjection(config) {
  const {
    inputs,
    loanAmount,
    propertyPrice,
    annualRentAfterVacancy,
    annualNonLoanCosts,
    annualGrowth,
    annualRentGrowth,
    expenseInflation,
    interestRate,
    taxRate,
    loanTermMonths,
    extraMonthlyRepayment,
    projectionYears,
    usableEquityThreshold,
    currentHouseholdSurplusBeforeInvestment,
  } = config;

  let currentValue = propertyPrice;
  let currentRent = annualRentAfterVacancy;
  let currentNonLoanCosts = annualNonLoanCosts;
  let currentBalance = loanAmount;
  let cumulativeAfterTaxPropertyResult = 0;
  let cumulativeAvailableCash =
    parseNumber(inputs.startingCashSavings) -
    (propertyPrice * toPercent(inputs.depositPercent) + propertyPrice * toPercent(inputs.purchaseCostPercent));
  const projection = [];

  projection.push({
    year: 0,
    label: formatYearLabel(0),
    propertyValue: currentValue,
    annualRent: currentRent,
    annualCosts: currentNonLoanCosts,
    annualLoanCost: 0,
    annualCashFlowBeforeTax: 0,
    annualCashFlowAfterTax: 0,
    cumulativePropertyCash: 0,
    cumulativeAvailableCash,
    cashAboveBuffer: Math.max(0, cumulativeAvailableCash - parseNumber(inputs.emergencyBuffer)),
    loanBalanceEnd: currentBalance,
    principalRepaid: 0,
    equity: currentValue - currentBalance,
    usableEquity: Math.max(0, currentValue * usableEquityThreshold - currentBalance),
    yearlyHouseholdSavings: 0,
    interestPaid: 0,
  });

  for (let year = 1; year <= projectionYears; year += 1) {
    const monthsElapsed = (year - 1) * 12;
    const remainingTermMonths = Math.max(1, loanTermMonths - monthsElapsed);
    const loanYear = getLoanSnapshot(
      currentBalance,
      interestRate,
      remainingTermMonths,
      inputs.loanType,
      extraMonthlyRepayment
    );

    currentBalance = loanYear.endBalance;

    const annualCashFlowBeforeTax = currentRent - currentNonLoanCosts - loanYear.totalCashPaid;
    const taxAdjustment =
      annualCashFlowBeforeTax < 0
        ? Math.abs(annualCashFlowBeforeTax) * taxRate
        : -annualCashFlowBeforeTax * taxRate;
    const annualCashFlowAfterTax = annualCashFlowBeforeTax + taxAdjustment;
    cumulativeAfterTaxPropertyResult += annualCashFlowAfterTax;

    const yearlyHouseholdSavings =
      currentHouseholdSurplusBeforeInvestment * 12 + annualCashFlowAfterTax;
    cumulativeAvailableCash += yearlyHouseholdSavings;

    currentValue *= 1 + annualGrowth;
    const equity = currentValue - currentBalance;
    const usableEquity = Math.max(0, currentValue * usableEquityThreshold - currentBalance);
    const cashAboveBuffer = Math.max(0, cumulativeAvailableCash - parseNumber(inputs.emergencyBuffer));

    projection.push({
      year,
      label: formatYearLabel(year),
      propertyValue: currentValue,
      annualRent: currentRent,
      annualCosts: currentNonLoanCosts,
      annualLoanCost: loanYear.totalCashPaid,
      annualCashFlowBeforeTax,
      annualCashFlowAfterTax,
      cumulativePropertyCash: cumulativeAfterTaxPropertyResult,
      cumulativeAvailableCash,
      cashAboveBuffer,
      loanBalanceEnd: currentBalance,
      principalRepaid: loanYear.principalPaid,
      equity,
      usableEquity,
      yearlyHouseholdSavings,
      interestPaid: loanYear.interestPaid,
    });

    currentRent *= 1 + annualRentGrowth;
    currentNonLoanCosts *= 1 + expenseInflation;
  }

  return projection;
}

/**
 * Evaluates when saved cash plus usable equity could fund a second purchase.
 */
function calculateSecondPropertyReadiness(values, projection, remainingSavingsAfterPurchase) {
  const secondDeposit =
    parseNumber(values.secondPropertyTargetPrice) * toPercent(values.secondPropertyDepositPercent);
  const secondCosts =
    parseNumber(values.secondPropertyTargetPrice) * toPercent(values.secondPropertyPurchaseCostPercent);
  const totalSecondUpfrontCash = secondDeposit + secondCosts;

  const rows = projection.map((row) => {
    const accessibleCash = Math.max(0, row.cumulativeAvailableCash - parseNumber(values.emergencyBuffer));
    const totalBuyingPower = accessibleCash + row.usableEquity;
    const ready = totalBuyingPower >= totalSecondUpfrontCash;

    let reason = "Not ready yet";
    if (ready) {
      const savingsEnough = accessibleCash >= totalSecondUpfrontCash;
      const equityEnough = row.usableEquity >= totalSecondUpfrontCash;
      if (savingsEnough && !equityEnough) {
        reason = "Savings growth";
      } else if (!savingsEnough && equityEnough) {
        reason = "Equity growth";
      } else {
        reason = "Both";
      }
    }

    return {
      ...row,
      accessibleCash,
      totalBuyingPower,
      totalSecondUpfrontCash,
      readyForSecondProperty: ready,
      readinessReason: reason,
    };
  });

  const firstReadyRow = rows.find((row) => row.readyForSecondProperty);

  return {
    possibleNow: Boolean(rows[0]?.readyForSecondProperty),
    firstReadyYear: firstReadyRow ? firstReadyRow.year : null,
    firstReadyLabel: firstReadyRow ? firstReadyRow.label : "Not within projection window",
    readinessReason: firstReadyRow ? firstReadyRow.readinessReason : "Not ready yet",
    secondDeposit,
    secondCosts,
    totalSecondUpfrontCash,
    remainingSavingsAfterPurchase,
    rows,
  };
}

/**
 * Recalculates the deal across preset purchase prices for side-by-side comparison.
 */
function generateScenarioRows(values) {
  return scenarioPrices.map((price) => {
    const scenarioValues = {
      ...values,
      propertyPrice: price,
    };
    const result = calculateDeal(scenarioValues);

    return {
      propertyPrice: price,
      upfrontCashNeeded: result.totalCashNeededUpfront,
      loanAmount: result.loanAmount,
      annualRentAfterVacancy: result.annualRentAfterVacancy,
      annualNonLoanCosts: result.annualNonLoanCosts,
      annualLoanCost: result.annualLoanCost,
      annualBeforeTaxResult: result.annualBeforeTaxResult,
      annualAfterTaxResult: result.annualAfterTaxResult,
      monthlyAfterTaxResult: result.monthlyAfterTaxPropertyResult,
      remainingSavingsAfterPurchase: result.remainingSavingsAfterPurchase,
      householdSurplusAfterInvestment: result.householdSurplusAfterInvestment,
      secondPropertyYear:
        result.secondPropertyReadiness.firstReadyYear === null
          ? "Not in range"
          : result.secondPropertyReadiness.firstReadyYear === 0
            ? "Now"
            : `Year ${result.secondPropertyReadiness.firstReadyYear}`,
    };
  });
}

/**
 * Converts the scenario comparison rows into a CSV string for export.
 */
function toCsv(rows) {
  const headers = [
    "Property Price",
    "Upfront Cash Needed",
    "Loan Amount",
    "Annual Rent After Vacancy",
    "Annual Non-Loan Costs",
    "Annual Loan Cost",
    "Annual Before-Tax Result",
    "Annual After-Tax Result",
    "Monthly After-Tax Result",
    "Remaining Savings After Purchase",
    "Household Surplus After Investment",
    "Second Property Possible",
  ];

  const csvRows = rows.map((row) => [
    row.propertyPrice,
    row.upfrontCashNeeded,
    row.loanAmount,
    row.annualRentAfterVacancy,
    row.annualNonLoanCosts,
    row.annualLoanCost,
    row.annualBeforeTaxResult,
    row.annualAfterTaxResult,
    row.monthlyAfterTaxResult,
    row.remainingSavingsAfterPurchase,
    row.householdSurplusAfterInvestment,
    row.secondPropertyYear,
  ]);

  return [headers, ...csvRows]
    .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/**
 * Triggers a browser download for the provided CSV text.
 */
function downloadCsv(csvText, fileName) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Finds padded min and max chart bounds across one or more series.
 */
function getChartBounds(seriesList) {
  const values = seriesList.flatMap((series) => series.values);
  const safeValues = values.filter((value) => Number.isFinite(value));
  const min = safeValues.length ? Math.min(...safeValues) : 0;
  const max = safeValues.length ? Math.max(...safeValues) : 0;

  if (min === max) {
    return {
      min: min - 1,
      max: max + 1,
    };
  }

  const padding = (max - min) * 0.12;
  return {
    min: min - padding,
    max: max + padding,
  };
}

/**
 * Converts a series value into SVG x/y coordinates within the chart area.
 */
function scalePoint(index, value, count, bounds, width, height, padding) {
  const x = padding.left + (index / Math.max(1, count - 1)) * (width - padding.left - padding.right);
  const y =
    padding.top +
    ((bounds.max - value) / Math.max(1e-9, bounds.max - bounds.min)) *
      (height - padding.top - padding.bottom);

  return { x, y };
}

/**
 * Builds an SVG line path string from a list of chart values.
 */
function buildLinePath(values, bounds, width, height, padding) {
  return values
    .map((value, index) => {
      const point = scalePoint(index, value, values.length, bounds, width, height, padding);
      return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    })
    .join(" ");
}

/**
 * Builds an SVG area path string that fills from the line down to the baseline.
 */
function buildAreaPath(values, bounds, width, height, padding) {
  if (!values.length) {
    return "";
  }

  const firstPoint = scalePoint(0, values[0], values.length, bounds, width, height, padding);
  const line = buildLinePath(values, bounds, width, height, padding);
  const lastPoint = scalePoint(values.length - 1, values[values.length - 1], values.length, bounds, width, height, padding);
  const baselineY = height - padding.bottom;

  return `${line} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
}

/**
 * Maps a numeric result to the matching visual tone for the UI.
 */
function getStatusTone(value) {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "neutral";
}

/**
 * Renders a reusable content card with an optional action area.
 */
function Card({ title, subtitle, children, rightSlot }) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="cardActions">{rightSlot}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Displays a labeled metric with optional tone styling and helper text.
 */
function Stat({ label, value, tone = "neutral", helper }) {
  return (
    <div className="stat">
      <span className="statLabel">{label}</span>
      <strong className={`statValue ${tone}`}>{value}</strong>
      {helper ? <span className="statHelper">{helper}</span> : null}
    </div>
  );
}

/**
 * Renders a labeled input control used throughout the assumptions form.
 */
function InputField({ label, value, onChange, type = "number", step = "any", suffix, min }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="inputShell">
        <input type={type} value={value} step={step} min={min} onChange={onChange} />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  );
}

/**
 * Renders a labeled select control for choosing from fixed options.
 */
function SelectField({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="inputShell">
        <select value={value} onChange={onChange}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

/**
 * Shows a compact status badge with tone-based styling.
 */
function Pill({ children, tone = "neutral" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

/**
 * Formats a value for summary tables using the requested display type.
 */
function ValueText({ value, type = "currency" }) {
  const tone = getStatusTone(value);
  const formatted =
    type === "currency"
      ? formatCurrency(value)
      : type === "percent"
        ? formatPercent(value)
        : formatNumber(value);

  return <span className={tone}>{formatted}</span>;
}

/**
 * Renders a lightweight SVG chart with legend, axes, and tooltip support.
 */
function SimpleChart({ title, subtitle, labels, series, formatValue = formatCurrency }) {
  const width = 720;
  const height = 280;
  const padding = { top: 20, right: 18, bottom: 42, left: 58 };
  const bounds = getChartBounds(series);
  const ticks = 4;
  const [hoverIndex, setHoverIndex] = useState(null);

  const activeIndex = hoverIndex ?? labels.length - 1;
  const activeLabel = labels[activeIndex] ?? "";
  const gradientId = `${title.replace(/\s+/g, "-").toLowerCase()}-area`;

  return (
    <div className="chartCard">
      <div className="chartHeader">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="legend">
          {series.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const ratio = rect.width > 0 ? x / rect.width : 0;
          const index = Math.round(clampNumber(ratio, 0, 1) * (labels.length - 1));
          setHoverIndex(index);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(17, 94, 89, 0.28)" />
            <stop offset="100%" stopColor="rgba(17, 94, 89, 0.03)" />
          </linearGradient>
        </defs>

        {Array.from({ length: ticks + 1 }).map((_, index) => {
          const y =
            padding.top + (index / ticks) * (height - padding.top - padding.bottom);
          const value = bounds.max - (index / ticks) * (bounds.max - bounds.min);
          return (
            <g key={index}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="rgba(15, 23, 42, 0.08)"
                strokeWidth="1"
              />
              <text x={12} y={y + 4} className="axisLabel">
                {formatValue(value)}
              </text>
            </g>
          );
        })}

        {labels.map((label, index) => {
          const point = scalePoint(index, bounds.min, labels.length, bounds, width, height, padding);
          return (
            <g key={label}>
              <line
                x1={point.x}
                x2={point.x}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke={hoverIndex === index ? "rgba(17, 94, 89, 0.18)" : "transparent"}
                strokeWidth="2"
              />
              <text x={point.x} y={height - 16} className="axisLabel axisLabelX">
                {label.replace("Year ", "Y")}
              </text>
            </g>
          );
        })}

        {series[0]?.showArea ? (
          <path
            d={buildAreaPath(series[0].values, bounds, width, height, padding)}
            fill={`url(#${gradientId})`}
          />
        ) : null}

        {series.map((item) => (
          <path
            key={item.key}
            d={buildLinePath(item.values, bounds, width, height, padding)}
            fill="none"
            stroke={item.color}
            strokeWidth="3"
            strokeDasharray={item.dashed ? "8 6" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {series.map((item) => {
          const point = scalePoint(
            activeIndex,
            item.values[activeIndex] ?? 0,
            labels.length,
            bounds,
            width,
            height,
            padding
          );

          return (
            <circle
              key={item.key}
              cx={point.x}
              cy={point.y}
              r="4.5"
              fill={item.color}
              stroke="#fff"
              strokeWidth="2"
            />
          );
        })}
      </svg>

      <div className="chartTooltip">
        <strong>{activeLabel}</strong>
        <div className="tooltipGrid">
          {series.map((item) => (
            <div key={item.key}>
              <span>{item.label}</span>
              <strong style={{ color: item.color }}>
                {formatValue(item.values[activeIndex] ?? 0)}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = `
  :root {
    color-scheme: light;
    --bg: #f5f4ef;
    --surface: rgba(255, 255, 255, 0.88);
    --surface-strong: #ffffff;
    --text: #16211d;
    --muted: #5f6d66;
    --line: rgba(22, 33, 29, 0.1);
    --shadow: 0 18px 48px rgba(34, 49, 43, 0.08);
    --green: #17795d;
    --green-soft: #e8f5ef;
    --red: #c24c43;
    --red-soft: #fff1ef;
    --amber: #b67914;
    --amber-soft: #fff5df;
    --ink: #22312b;
    --teal: #115e59;
    --blue: #315f99;
    --rose: #9f4d69;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background:
      radial-gradient(circle at top left, rgba(239, 226, 195, 0.6), transparent 30%),
      radial-gradient(circle at top right, rgba(205, 230, 224, 0.75), transparent 28%),
      linear-gradient(180deg, #f7f5ef 0%, #efeee7 100%);
    color: var(--text);
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  }

  .appShell {
    min-height: 100vh;
    padding: 32px 20px 56px;
  }

  .app {
    max-width: 1320px;
    margin: 0 auto;
  }

  .hero {
    padding: 28px 30px;
    margin-bottom: 22px;
    border: 1px solid rgba(255, 255, 255, 0.45);
    border-radius: 28px;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.65)),
      linear-gradient(135deg, rgba(17, 94, 89, 0.06), rgba(177, 121, 20, 0.06));
    box-shadow: var(--shadow);
    backdrop-filter: blur(14px);
  }

  .hero h1 {
    margin: 0 0 10px;
    font-size: clamp(2rem, 3vw, 3rem);
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .hero p {
    margin: 0;
    max-width: 860px;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.65;
  }

  .topStats, .statsGrid, .chartGrid {
    display: grid;
    gap: 14px;
  }

  .topStats { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 22px; }
  .statsGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .chartGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }

  .topStats .stat {
    min-height: 126px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.75);
  }

  .grid { display: grid; gap: 18px; }
  .sectionGrid { grid-template-columns: 1.2fr 1fr; align-items: start; }

  .card {
    border-radius: 24px;
    border: 1px solid var(--line);
    background: var(--surface);
    box-shadow: var(--shadow);
    backdrop-filter: blur(10px);
    padding: 22px;
  }

  .cardHeader, .chartHeader {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }

  .cardHeader h2, .chartHeader h3 {
    margin: 0;
    font-size: 1.2rem;
    letter-spacing: -0.02em;
  }

  .cardHeader p, .chartHeader p {
    margin: 6px 0 0;
    color: var(--muted);
    line-height: 1.5;
    font-size: 0.94rem;
  }

  .cardActions, .buttonRow, .legend {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  button {
    border: 0;
    cursor: pointer;
    border-radius: 999px;
    padding: 11px 16px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--ink);
    background: rgba(22, 33, 29, 0.08);
    transition: transform 120ms ease, background 120ms ease;
  }

  button:hover {
    transform: translateY(-1px);
    background: rgba(22, 33, 29, 0.12);
  }

  .buttonPrimary {
    color: white;
    background: linear-gradient(135deg, #115e59, #17795d);
  }

  .buttonPrimary:hover {
    background: linear-gradient(135deg, #0f514d, #13664f);
  }

  .formSection, .field, .tooltipGrid div {
    display: grid;
    gap: 16px;
  }

  .formGroup {
    padding: 18px;
    border-radius: 20px;
    border: 1px solid rgba(22, 33, 29, 0.08);
    background: rgba(255, 255, 255, 0.62);
  }

  .formGroup h3 {
    margin: 0 0 14px;
    font-size: 1rem;
  }

  .fieldGrid, .tooltipGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .field span {
    font-size: 0.92rem;
    color: var(--muted);
    font-weight: 600;
  }

  .inputShell { position: relative; }

  input, select {
    width: 100%;
    border-radius: 16px;
    border: 1px solid rgba(22, 33, 29, 0.12);
    background: rgba(255, 255, 255, 0.95);
    padding: 14px 16px;
    font-size: 0.98rem;
    color: var(--text);
    outline: none;
  }

  input:focus, select:focus {
    border-color: rgba(17, 94, 89, 0.38);
    box-shadow: 0 0 0 4px rgba(17, 94, 89, 0.08);
  }

  .inputShell em {
    position: absolute;
    top: 50%;
    right: 14px;
    transform: translateY(-50%);
    font-style: normal;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .stat {
    display: grid;
    gap: 8px;
    padding: 18px;
    border-radius: 20px;
    border: 1px solid rgba(22, 33, 29, 0.08);
    background: rgba(255, 255, 255, 0.74);
  }

  .statLabel {
    color: var(--muted);
    font-size: 0.88rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .statValue {
    font-size: 1.45rem;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .statHelper {
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .positive { color: var(--green); }
  .negative { color: var(--red); }
  .neutral { color: var(--text); }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    padding: 10px 14px;
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .pill.positive { color: var(--green); background: var(--green-soft); }
  .pill.negative { color: var(--red); background: var(--red-soft); }
  .pill.warning { color: var(--amber); background: var(--amber-soft); }

  .summaryTable, .scenarioTable {
    width: 100%;
    border-collapse: collapse;
  }

  .summaryTable td, .scenarioTable th, .scenarioTable td {
    padding: 13px 10px;
    border-bottom: 1px solid rgba(22, 33, 29, 0.08);
    text-align: left;
    vertical-align: top;
  }

  .summaryTable tr:last-child td, .scenarioTable tr:last-child td { border-bottom: 0; }
  .summaryTable td:first-child, .scenarioTable th { color: var(--muted); font-weight: 700; }
  .tableWrap { overflow-x: auto; }

  .scenarioTable th {
    position: sticky;
    top: 0;
    background: rgba(245, 244, 239, 0.96);
    backdrop-filter: blur(8px);
    white-space: nowrap;
  }

  .chartCard {
    border-radius: 24px;
    padding: 20px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.82);
    box-shadow: var(--shadow);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .legend i {
    width: 12px;
    height: 12px;
    display: inline-block;
    border-radius: 999px;
  }

  .chart {
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .axisLabel {
    fill: #6c7973;
    font-size: 11px;
    font-weight: 600;
  }

  .axisLabelX { text-anchor: middle; }

  .chartTooltip {
    margin-top: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(241, 245, 244, 0.9);
    border: 1px solid rgba(22, 33, 29, 0.08);
  }

  .chartTooltip strong {
    display: block;
    margin-bottom: 8px;
  }

  .tooltipGrid span {
    color: var(--muted);
    font-size: 0.84rem;
    font-weight: 700;
  }

  .callout {
    padding: 18px;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(17, 94, 89, 0.08), rgba(255, 255, 255, 0.72));
    border: 1px solid rgba(17, 94, 89, 0.12);
  }

  .callout p {
    margin: 8px 0 0;
    color: var(--muted);
    line-height: 1.6;
  }

  .notes {
    margin-top: 18px;
    color: var(--muted);
    line-height: 1.7;
    font-size: 0.93rem;
  }

  @media (max-width: 1080px) {
    .sectionGrid, .chartGrid, .topStats, .statsGrid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 820px) {
    .sectionGrid, .chartGrid, .topStats, .statsGrid, .fieldGrid, .tooltipGrid {
      grid-template-columns: 1fr;
    }

    .hero { padding: 22px; }
    .card, .chartCard { padding: 18px; }
  }
`;

/**
 * Hosts the calculator UI, local state, and all derived scenario outputs.
 */
export default function App() {
  const [inputs, setInputs] = useState(
    Object.fromEntries(
      Object.entries(defaultInputs).map(([key, value]) => [key, String(value)])
    )
  );
  const [displayMode, setDisplayMode] = useState("yearly");

  const result = useMemo(() => calculateDeal(inputs), [inputs]);
  const scenarioRows = useMemo(() => generateScenarioRows(inputs), [inputs]);

  const chartLabels = result.projection.map((row) => row.label);
  const readinessRows = result.secondPropertyReadiness.rows;
  const readinessStatus = result.secondPropertyReadiness.possibleNow
    ? "second property ready"
    : "not ready yet";

  /**
   * Creates a change handler for a specific input key in the form state.
   */
  function handleInputChange(key) {
    return (event) => {
      setInputs((current) => ({
        ...current,
        [key]: event.target.value,
      }));
    };
  }

  /**
   * Restores the calculator inputs and display mode to their default values.
   */
  function resetDefaults() {
    setInputs(
      Object.fromEntries(
        Object.entries(defaultInputs).map(([key, value]) => [key, String(value)])
      )
    );
    setDisplayMode("yearly");
  }

  /**
   * Exports the current scenario comparison table as a CSV download.
   */
  function exportScenarioCsv() {
    const csvText = toCsv(scenarioRows);
    downloadCsv(csvText, "investment-property-scenarios.csv");
  }

  /**
   * Converts yearly amounts to monthly values when the compact view is selected.
   */
  const monthlyOrYearly = (yearlyValue) =>
    displayMode === "monthly" ? yearlyValue / 12 : yearlyValue;

  const displaySuffix = displayMode === "monthly" ? "per month" : "per year";

  return (
    <div className="appShell">
      <style>{styles}</style>

      <div className="app">
        <header className="hero">
          <h1>Australian Investment Property Calculator</h1>
          <p>
            Model affordability, cash flow, value growth, equity build-up, and the
            likely timing of a second purchase. The calculator keeps the logic simple,
            transparent, and editable, with scenario comparisons and hand-built SVG charts.
          </p>

          <div className="topStats">
            <Stat
              label="Household Surplus After Investment"
              value={formatCurrency(result.householdSurplusAfterInvestment)}
              tone={getStatusTone(result.householdSurplusAfterInvestment)}
              helper="Monthly position after rent, living costs, and the property result."
            />
            <Stat
              label="Current Property Result"
              value={formatCurrency(result.monthlyAfterTaxPropertyResult)}
              tone={getStatusTone(result.monthlyAfterTaxPropertyResult)}
              helper={result.monthlyAfterTaxPropertyResult >= 0 ? "Positively geared" : "Negatively geared"}
            />
            <Stat
              label="Total Equity at Purchase"
              value={formatCurrency(result.projection[0].equity)}
              tone="positive"
              helper="Deposit-based starting equity before any market growth."
            />
            <Stat
              label="Second Property Status"
              value={
                result.secondPropertyReadiness.possibleNow
                  ? "Ready now"
                  : result.secondPropertyReadiness.firstReadyYear === null
                    ? "Not in range"
                    : result.secondPropertyReadiness.firstReadyLabel
              }
              tone={result.secondPropertyReadiness.possibleNow ? "positive" : "neutral"}
              helper={readinessStatus}
            />
          </div>
        </header>

        <div className="grid sectionGrid">
          <Card
            title="Inputs"
            subtitle="Edit the assumptions and every section updates instantly."
            rightSlot={
              <div className="buttonRow">
                <button type="button" onClick={resetDefaults}>
                  Reset to defaults
                </button>
              </div>
            }
          >
            <div className="formSection">
              <div className="formGroup">
                <h3>Household / personal</h3>
                <div className="fieldGrid">
                  <InputField label="Monthly net income" value={inputs.monthlyNetIncome} onChange={handleInputChange("monthlyNetIncome")} suffix="AUD" min="0" />
                  <InputField label="Monthly rent paid" value={inputs.monthlyRentPaid} onChange={handleInputChange("monthlyRentPaid")} suffix="AUD" min="0" />
                  <InputField label="Monthly rent received from tenant" value={inputs.monthlyRentReceivedFromTenant} onChange={handleInputChange("monthlyRentReceivedFromTenant")} suffix="AUD" min="0" />
                  <InputField label="Monthly living costs" value={inputs.monthlyLivingCosts} onChange={handleInputChange("monthlyLivingCosts")} suffix="AUD" min="0" />
                  <InputField label="Starting cash savings" value={inputs.startingCashSavings} onChange={handleInputChange("startingCashSavings")} suffix="AUD" min="0" />
                  <InputField label="Emergency buffer" value={inputs.emergencyBuffer} onChange={handleInputChange("emergencyBuffer")} suffix="AUD" min="0" />
                </div>
              </div>

              <div className="formGroup">
                <h3>Property purchase</h3>
                <div className="fieldGrid">
                  <InputField label="Property price" value={inputs.propertyPrice} onChange={handleInputChange("propertyPrice")} suffix="AUD" min="0" />
                  <InputField label="Deposit percent" value={inputs.depositPercent} onChange={handleInputChange("depositPercent")} suffix="%" min="0" />
                  <InputField label="Purchase cost percent" value={inputs.purchaseCostPercent} onChange={handleInputChange("purchaseCostPercent")} suffix="%" min="0" />
                  <InputField label="Loan interest rate percent" value={inputs.loanInterestRatePercent} onChange={handleInputChange("loanInterestRatePercent")} suffix="%" min="0" />
                  <InputField label="Loan term in years" value={inputs.loanTermYears} onChange={handleInputChange("loanTermYears")} suffix="years" min="1" />
                  <SelectField
                    label="Loan type"
                    value={inputs.loanType}
                    onChange={handleInputChange("loanType")}
                    options={[
                      { value: "principal_and_interest", label: "Principal and interest" },
                      { value: "interest_only", label: "Interest only" },
                    ]}
                  />
                </div>
              </div>

              <div className="formGroup">
                <h3>Rental / holding assumptions</h3>
                <div className="fieldGrid">
                  <InputField label="Weekly rent" value={inputs.weeklyRent} onChange={handleInputChange("weeklyRent")} suffix="AUD" min="0" />
                  <InputField label="Vacancy weeks per year" value={inputs.vacancyWeeks} onChange={handleInputChange("vacancyWeeks")} suffix="weeks" min="0" />
                  <InputField label="Annual rent growth percent" value={inputs.annualRentGrowthPercent} onChange={handleInputChange("annualRentGrowthPercent")} suffix="%" />
                  <InputField label="Property management percent" value={inputs.propertyManagementPercent} onChange={handleInputChange("propertyManagementPercent")} suffix="%" min="0" />
                  <InputField label="Annual maintenance" value={inputs.annualMaintenance} onChange={handleInputChange("annualMaintenance")} suffix="AUD" min="0" />
                  <InputField label="Annual council rates" value={inputs.annualCouncilRates} onChange={handleInputChange("annualCouncilRates")} suffix="AUD" min="0" />
                  <InputField label="Annual insurance" value={inputs.annualInsurance} onChange={handleInputChange("annualInsurance")} suffix="AUD" min="0" />
                  <InputField label="Annual land tax" value={inputs.annualLandTax} onChange={handleInputChange("annualLandTax")} suffix="AUD" min="0" />
                  <InputField label="Marginal tax rate percent" value={inputs.marginalTaxRatePercent} onChange={handleInputChange("marginalTaxRatePercent")} suffix="%" min="0" />
                </div>
              </div>

              <div className="formGroup">
                <h3>Projection assumptions</h3>
                <div className="fieldGrid">
                  <InputField label="Annual capital growth percent" value={inputs.annualCapitalGrowthPercent} onChange={handleInputChange("annualCapitalGrowthPercent")} suffix="%" />
                  <InputField label="Annual expense inflation percent" value={inputs.annualExpenseInflationPercent} onChange={handleInputChange("annualExpenseInflationPercent")} suffix="%" />
                  <InputField label="Extra monthly repayment" value={inputs.extraMonthlyRepayment} onChange={handleInputChange("extraMonthlyRepayment")} suffix="AUD" min="0" />
                  <InputField label="Projection years" value={inputs.projectionYears} onChange={handleInputChange("projectionYears")} suffix="years" min="1" />
                  <InputField label="Usable equity threshold percent" value={inputs.usableEquityThresholdPercent} onChange={handleInputChange("usableEquityThresholdPercent")} suffix="%" min="0" />
                </div>
              </div>

              <div className="formGroup">
                <h3>Second property assumptions</h3>
                <div className="fieldGrid">
                  <InputField label="Second property target price" value={inputs.secondPropertyTargetPrice} onChange={handleInputChange("secondPropertyTargetPrice")} suffix="AUD" min="0" />
                  <InputField label="Second property deposit percent" value={inputs.secondPropertyDepositPercent} onChange={handleInputChange("secondPropertyDepositPercent")} suffix="%" min="0" />
                  <InputField label="Second property purchase cost percent" value={inputs.secondPropertyPurchaseCostPercent} onChange={handleInputChange("secondPropertyPurchaseCostPercent")} suffix="%" min="0" />
                  <InputField label="Second property weekly rent" value={inputs.secondPropertyWeeklyRent} onChange={handleInputChange("secondPropertyWeeklyRent")} suffix="AUD" min="0" />
                  <InputField label="Second property interest rate" value={inputs.secondPropertyInterestRate} onChange={handleInputChange("secondPropertyInterestRate")} suffix="%" min="0" />
                  <InputField label="Second property other annual costs estimate" value={inputs.secondPropertyOtherAnnualCostsEstimate} onChange={handleInputChange("secondPropertyOtherAnnualCostsEstimate")} suffix="AUD" min="0" />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid">
            <Card
              title="Current Deal Summary"
              subtitle="Purchase setup, gearing, and affordability at today's assumptions."
              rightSlot={
                result.monthlyAfterTaxPropertyResult >= 0 ? (
                  <Pill tone="positive">Positively geared</Pill>
                ) : (
                  <Pill tone="negative">Negatively geared</Pill>
                )
              }
            >
              <div className="statsGrid">
                <Stat label="Deposit amount" value={formatCurrency(result.depositAmount)} tone="neutral" />
                <Stat label="Purchase costs" value={formatCurrency(result.purchaseCosts)} tone="neutral" />
                <Stat label="Upfront cash needed" value={formatCurrency(result.totalCashNeededUpfront)} tone="neutral" />
                <Stat label="Remaining savings" value={formatCurrency(result.remainingSavingsAfterPurchase)} tone={getStatusTone(result.remainingSavingsAfterPurchase)} />
                <Stat label="Loan amount" value={formatCurrency(result.loanAmount)} tone="neutral" />
                <Stat label="Usable equity now" value={formatCurrency(result.projection[0].usableEquity)} tone="positive" />
              </div>

              <table className="summaryTable">
                <tbody>
                  <tr><td>Annual rent after vacancy</td><td><ValueText value={result.annualRentAfterVacancy} /></td></tr>
                  <tr><td>Annual non-loan costs</td><td><ValueText value={-result.annualNonLoanCosts} /></td></tr>
                  <tr><td>Annual loan cost used for cash flow</td><td><ValueText value={-result.annualLoanCost} /></td></tr>
                  <tr><td>First-year interest / principal split</td><td>{formatCurrency(result.firstYearInterest)} interest, {formatCurrency(result.firstYearPrincipal)} principal</td></tr>
                  <tr><td>Before-tax property result</td><td><ValueText value={result.annualBeforeTaxResult} /></td></tr>
                  <tr><td>After-tax property result</td><td><ValueText value={result.annualAfterTaxResult} /></td></tr>
                  <tr><td>Monthly property result</td><td><ValueText value={result.monthlyAfterTaxPropertyResult} /></td></tr>
                  <tr><td>Household surplus before investment</td><td><ValueText value={result.currentHouseholdSurplusBeforeInvestment} /></td></tr>
                  <tr><td>Household surplus after investment</td><td><ValueText value={result.householdSurplusAfterInvestment} /></td></tr>
                </tbody>
              </table>
            </Card>

            <Card
              title="Cash Flow Results"
              subtitle="A cleaner view of the income, holding costs, and net household effect."
              rightSlot={
                <div className="buttonRow">
                  <button type="button" className={displayMode === "yearly" ? "buttonPrimary" : ""} onClick={() => setDisplayMode("yearly")}>Yearly</button>
                  <button type="button" className={displayMode === "monthly" ? "buttonPrimary" : ""} onClick={() => setDisplayMode("monthly")}>Monthly</button>
                </div>
              }
            >
              <div className="statsGrid">
                <Stat label={`Rent after vacancy ${displaySuffix}`} value={formatCurrency(monthlyOrYearly(result.annualRentAfterVacancy))} tone="positive" />
                <Stat label={`Non-loan costs ${displaySuffix}`} value={formatCurrency(monthlyOrYearly(result.annualNonLoanCosts))} tone="negative" />
                <Stat label={`Loan cash cost ${displaySuffix}`} value={formatCurrency(monthlyOrYearly(result.annualLoanCost))} tone="negative" />
                <Stat label={`Before-tax result ${displaySuffix}`} value={formatCurrency(monthlyOrYearly(result.annualBeforeTaxResult))} tone={getStatusTone(result.annualBeforeTaxResult)} />
                <Stat label={`After-tax result ${displaySuffix}`} value={formatCurrency(monthlyOrYearly(result.annualAfterTaxResult))} tone={getStatusTone(result.annualAfterTaxResult)} />
                <Stat label="Household surplus after investment" value={formatCurrency(result.householdSurplusAfterInvestment)} tone={getStatusTone(result.householdSurplusAfterInvestment)} />
              </div>
            </Card>

            <Card
              title="Second Property Readiness"
              subtitle="This checks whether cash above your emergency buffer plus usable equity can fund the second deposit and costs."
              rightSlot={
                result.secondPropertyReadiness.possibleNow ? (
                  <Pill tone="positive">Second property ready</Pill>
                ) : (
                  <Pill tone="warning">Not ready yet</Pill>
                )
              }
            >
              <div className="callout">
                <strong>
                  {result.secondPropertyReadiness.possibleNow
                    ? "A second purchase appears possible now."
                    : result.secondPropertyReadiness.firstReadyYear === null
                      ? "A second purchase is not reached within the current projection window."
                      : `The earliest estimated timing is ${result.secondPropertyReadiness.firstReadyLabel}.`}
                </strong>
                <p>
                  Required upfront cash for the second purchase is <strong>{formatCurrency(result.secondPropertyReadiness.totalSecondUpfrontCash)}</strong>. The readiness driver is <strong>{result.secondPropertyReadiness.readinessReason.toLowerCase()}</strong>.
                </p>
              </div>

              <div className="statsGrid" style={{ marginTop: 16 }}>
                <Stat label="Second deposit" value={formatCurrency(result.secondPropertyReadiness.secondDeposit)} />
                <Stat label="Second purchase costs" value={formatCurrency(result.secondPropertyReadiness.secondCosts)} />
                <Stat label="Total second upfront cash" value={formatCurrency(result.secondPropertyReadiness.totalSecondUpfrontCash)} />
                <Stat label="Available cash above buffer now" value={formatCurrency(readinessRows[0]?.accessibleCash ?? 0)} tone="positive" />
                <Stat label="Usable equity now" value={formatCurrency(readinessRows[0]?.usableEquity ?? 0)} tone="positive" />
                <Stat label="Total buying power now" value={formatCurrency(readinessRows[0]?.totalBuyingPower ?? 0)} tone={getStatusTone((readinessRows[0]?.totalBuyingPower ?? 0) - result.secondPropertyReadiness.totalSecondUpfrontCash)} />
              </div>
            </Card>
          </div>
        </div>

        <div className="grid" style={{ marginTop: 18 }}>
          <Card title="Projection Charts" subtitle="Simple SVG charts showing value growth, debt reduction, cash flow, and refinance readiness over time.">
            <div className="chartGrid">
              <SimpleChart
                title="Property value over time"
                subtitle="Projected market value using the annual capital growth assumption."
                labels={chartLabels}
                series={[{ key: "value", label: "Property value", values: result.projection.map((row) => row.propertyValue), color: "#115e59", showArea: true }]}
              />

              <SimpleChart
                title="Loan balance vs equity"
                subtitle="Debt falling and equity building over the projection."
                labels={chartLabels}
                series={[
                  { key: "loan", label: "Loan balance", values: result.projection.map((row) => row.loanBalanceEnd), color: "#c24c43" },
                  { key: "equity", label: "Equity", values: result.projection.map((row) => row.equity), color: "#17795d" },
                ]}
              />

              <SimpleChart
                title="Annual after-tax cash flow over time"
                subtitle="Net yearly property result after the simplified tax adjustment."
                labels={chartLabels}
                series={[{ key: "cashFlow", label: "After-tax cash flow", values: result.projection.map((row) => row.annualCashFlowAfterTax), color: "#315f99" }]}
              />

              <SimpleChart
                title="Usable equity and second-property readiness"
                subtitle="When combined buying power crosses the required second upfront cash."
                labels={chartLabels}
                series={[
                  { key: "usableEquity", label: "Usable equity", values: readinessRows.map((row) => row.usableEquity), color: "#17795d" },
                  { key: "buyingPower", label: "Total buying power", values: readinessRows.map((row) => row.totalBuyingPower), color: "#9f4d69" },
                  { key: "required", label: "Required upfront cash", values: readinessRows.map((row) => row.totalSecondUpfrontCash), color: "#b67914", dashed: true },
                ]}
              />
            </div>
          </Card>

          <Card
            title="Scenario Comparison Table"
            subtitle="Purchase-price stress test across common price points, using the same assumptions for rent, costs, and projections."
            rightSlot={<div className="buttonRow"><button type="button" className="buttonPrimary" onClick={exportScenarioCsv}>Export CSV</button></div>}
          >
            <div className="tableWrap">
              <table className="scenarioTable">
                <thead>
                  <tr>
                    <th>Property price</th>
                    <th>Upfront cash needed</th>
                    <th>Loan amount</th>
                    <th>Annual rent after vacancy</th>
                    <th>Annual non-loan costs</th>
                    <th>Annual loan cost</th>
                    <th>Annual before-tax result</th>
                    <th>Annual after-tax result</th>
                    <th>Monthly after-tax result</th>
                    <th>Remaining savings</th>
                    <th>Household surplus after investment</th>
                    <th>Second property timing</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioRows.map((row) => (
                    <tr key={row.propertyPrice}>
                      <td>{formatCurrency(row.propertyPrice)}</td>
                      <td>{formatCurrency(row.upfrontCashNeeded)}</td>
                      <td>{formatCurrency(row.loanAmount)}</td>
                      <td>{formatCurrency(row.annualRentAfterVacancy)}</td>
                      <td className="negative">{formatCurrency(row.annualNonLoanCosts)}</td>
                      <td className="negative">{formatCurrency(row.annualLoanCost)}</td>
                      <td className={getStatusTone(row.annualBeforeTaxResult)}>{formatCurrency(row.annualBeforeTaxResult)}</td>
                      <td className={getStatusTone(row.annualAfterTaxResult)}>{formatCurrency(row.annualAfterTaxResult)}</td>
                      <td className={getStatusTone(row.monthlyAfterTaxResult)}>{formatCurrency(row.monthlyAfterTaxResult)}</td>
                      <td className={getStatusTone(row.remainingSavingsAfterPurchase)}>{formatCurrency(row.remainingSavingsAfterPurchase)}</td>
                      <td className={getStatusTone(row.householdSurplusAfterInvestment)}>{formatCurrency(row.householdSurplusAfterInvestment)}</td>
                      <td>{row.secondPropertyYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Assumptions Note" subtitle="A few important caveats to keep the model practical and easy to follow.">
            <div className="notes">
              <div>These figures are estimates only and are designed for quick scenario testing.</div>
              <div>Tax treatment is simplified and does not replace professional tax advice.</div>
              <div>Stamp duty, purchase costs, and land tax vary by state, property type, and land value.</div>
              <div>Second-property readiness here checks available cash plus usable equity, not full borrowing-capacity or lender servicing rules.</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
