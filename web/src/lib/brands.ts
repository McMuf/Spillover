import {
  siAirbnb, siAmd, siApple, siArm, siBankofamerica, siBitcoin, siBoeing, siBroadcom, siCisco, siCloudflare,
  siCocacola, siCoinbase, siDatadog, siDell, siEthereum, siFord, siGeneralmotors, siGoldmansachs, siGoogle,
  siHp, siIntel, siMastercard, siMcdonalds, siMeta, siMicrostrategy, siNetflix, siNike, siNvidia, siPalantir,
  siPaypal, siQualcomm, siReddit, siRobinhood, siShopify, siSnapchat, siSnowflake, siSpacex, siSpotify,
  siStarbucks, siTesla, siToyota, siUber, siVisa, siWellsfargo, siZoom,
  type SimpleIcon,
} from "simple-icons";

/**
 * Company marks come from the `simple-icons` package (CC0 files; the marks themselves remain their
 * owners' trademarks and are used only to identify the company a claim is about). They are bundled,
 * so the site makes no third-party image requests. Add a ticker by importing its icon here.
 * Some large companies (Microsoft, Amazon, Oracle...) are not in the set and fall back to initials,
 * or to a file in src/assets/logos/.
 */
export const BRAND_BY_TICKER: Readonly<Record<string, SimpleIcon>> = {
  AAPL: siApple, GOOGL: siGoogle, GOOG: siGoogle, META: siMeta, NVDA: siNvidia, TSLA: siTesla, NFLX: siNetflix,
  AMD: siAmd, INTC: siIntel, AVGO: siBroadcom, QCOM: siQualcomm, ARM: siArm, CSCO: siCisco, DELL: siDell, HPQ: siHp,
  PLTR: siPalantir, COIN: siCoinbase, HOOD: siRobinhood, MSTR: siMicrostrategy, SPACEX: siSpacex, SPCX: siSpacex,
  BA: siBoeing, V: siVisa, MA: siMastercard, PYPL: siPaypal, UBER: siUber, ABNB: siAirbnb, NKE: siNike,
  SHOP: siShopify, F: siFord, GM: siGeneralmotors, TM: siToyota, KO: siCocacola, SBUX: siStarbucks, MCD: siMcdonalds,
  SPOT: siSpotify, SNAP: siSnapchat, RDDT: siReddit, ZM: siZoom, SNOW: siSnowflake, DDOG: siDatadog, NET: siCloudflare,
  WFC: siWellsfargo, BAC: siBankofamerica, GS: siGoldmansachs, BTC: siBitcoin, ETH: siEthereum,
};

/** Friendly names for the symbols a reader is likely to meet. Unknown symbols show as themselves. */
export const NAME_BY_SYMBOL: Readonly<Record<string, string>> = {
  SPX: "S&P 500", NASDAQ: "Nasdaq Composite", XLK: "Technology Select Sector SPDR", MKT: "US stock market",
  AAPL: "Apple", GOOGL: "Alphabet", GOOG: "Alphabet", META: "Meta", NVDA: "Nvidia", TSLA: "Tesla", NFLX: "Netflix",
  AMD: "AMD", INTC: "Intel", AVGO: "Broadcom", QCOM: "Qualcomm", ARM: "Arm", CSCO: "Cisco", DELL: "Dell", HPQ: "HP",
  PLTR: "Palantir", COIN: "Coinbase", HOOD: "Robinhood", MSTR: "MicroStrategy", SPACEX: "SpaceX", BA: "Boeing",
  V: "Visa", MA: "Mastercard", PYPL: "PayPal", UBER: "Uber", ABNB: "Airbnb", NKE: "Nike", SHOP: "Shopify",
  F: "Ford", GM: "General Motors", TM: "Toyota", KO: "Coca-Cola", SBUX: "Starbucks", MCD: "McDonald's",
  SPOT: "Spotify", SNAP: "Snap", RDDT: "Reddit", ZM: "Zoom", SNOW: "Snowflake", DDOG: "Datadog", NET: "Cloudflare",
  WFC: "Wells Fargo", BAC: "Bank of America", GS: "Goldman Sachs", BTC: "Bitcoin", ETH: "Ethereum",
  MSFT: "Microsoft", AMZN: "Amazon", ORCL: "Oracle", CRM: "Salesforce", FED: "Federal Reserve",
};

export function brandFor(symbol: string): SimpleIcon | undefined {
  return BRAND_BY_TICKER[symbol.toUpperCase()];
}

export function instrumentName(symbol: string): string {
  return NAME_BY_SYMBOL[symbol.toUpperCase()] ?? symbol;
}
