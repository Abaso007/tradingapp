const hasText = (value) => {
  return typeof value === "string" && value.trim() !== "";
};

const hasMeaningfulValue = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.values(value).some((entry) => hasMeaningfulValue(entry));
  }
  return false;
};

const looksLikePolymarketPosition = (position) => {
  if (!position || typeof position !== "object") {
    return false;
  }
  const market = String(position.market || "").trim().toLowerCase();
  if (market === "polymarket") {
    return true;
  }
  return hasText(position.asset_id) || hasText(position.outcome);
};

const hasPolymarketMetadata = (portfolio) => {
  const polymarket = portfolio?.polymarket;
  if (!polymarket || typeof polymarket !== "object") {
    return false;
  }

  if (
    hasText(polymarket.address) ||
    hasText(polymarket.makerAddress) ||
    hasText(polymarket.executionMode) ||
    hasText(polymarket.requestedExecutionMode) ||
    hasText(polymarket.effectiveExecutionMode) ||
    hasText(polymarket.authAddress) ||
    hasText(polymarket.backfilledAt) ||
    hasText(polymarket.lastTradeMatchTime) ||
    hasText(polymarket.lastTradeId) ||
    hasText(polymarket.apiKey) ||
    hasText(polymarket.secret) ||
    hasText(polymarket.passphrase)
  ) {
    return true;
  }

  if (
    polymarket.backfillPending === true ||
    polymarket.sizeToBudget === true ||
    polymarket.seedFromPositions === true
  ) {
    return true;
  }

  return (
    hasMeaningfulValue(polymarket.untradeableTokenIds) ||
    hasMeaningfulValue(polymarket.sizing) ||
    hasMeaningfulValue(polymarket.sizingState)
  );
};

export const getPortfolioProvider = (portfolio) => {
  const explicit = String(portfolio?.provider || "").trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  if (hasPolymarketMetadata(portfolio)) {
    return "polymarket";
  }

  if (Array.isArray(portfolio?.stocks) && portfolio.stocks.some((stock) => looksLikePolymarketPosition(stock))) {
    return "polymarket";
  }

  if (
    Array.isArray(portfolio?.targetPositions) &&
    portfolio.targetPositions.some((position) => looksLikePolymarketPosition(position))
  ) {
    return "polymarket";
  }

  return "alpaca";
};

export const normalizePortfolioProvider = (portfolio) => {
  if (!portfolio || typeof portfolio !== "object") {
    return portfolio;
  }

  const provider = getPortfolioProvider(portfolio);
  if (portfolio.provider === provider) {
    return portfolio;
  }

  return {
    ...portfolio,
    provider,
  };
};
