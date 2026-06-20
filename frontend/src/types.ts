export interface Company {
  ticker: string;
  company_name: string;
}

export interface User {
  username: string;
  user_link: string;
}

export interface Performance {
  nextDayOpen: number | null;
  nextDayClose: number | null;
  oneWeekClosePerf: number | null;
  twoWeekClosePerf: number | null;
  oneMonthPerf: number | null;
  threeMonthPerf: number | null;
  sixMonthPerf: number | null;
  oneYearPerf: number | null;
  twoYearPerf: number | null;
  threeYearPerf: number | null;
  fiveYearPerf: number | null;
}

export interface TotalReturn {
  idea_id: string;
  ticker: string;
  matched_ticker: string;
  start_period: string;
  end_period: string;
  start_price: number;
  end_price: number;
  dividends: number;
  stock_total_return_pct: number;
  idea_total_return_pct: number;
  periods_held: number;
  calculation_note: string;
  computed_at: string;
}

export interface Idea {
  id: string;
  link: string;
  company_id: string;
  user_id: string;
  date: string;
  is_short: boolean;
  is_contest_winner: boolean;
  company?: Company | null;
  user?: User | null;
  performance?: Performance | null;
  total_return?: TotalReturn | null;
}

export interface IdeaDetail extends Idea {
  description?: { description: string } | null;
  catalysts?: { catalysts: string } | null;
}

export interface IdeaListParams {
  skip: number;
  limit: number;
  search?: string;
}
