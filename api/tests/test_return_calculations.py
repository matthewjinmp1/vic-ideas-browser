import math
import unittest

from scripts.calculate_sp500_benchmark import (
    compound_annual_return as benchmark_compound_annual_return,
)
from scripts.calculate_sp500_benchmark import value_at_or_before
from scripts.calculate_total_returns import (
    calculate_return,
    compound_annual_return as idea_compound_annual_return,
)


class ReturnCalculationTests(unittest.TestCase):
    def assert_close(self, actual, expected):
        self.assertIsNotNone(actual)
        self.assertTrue(math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9))

    def test_compound_annual_return_uses_cagr_not_linear_average(self):
        total_return_pct = 5000
        years_held = 10

        result = idea_compound_annual_return(total_return_pct, years_held)

        self.assert_close(
            result,
            ((1 + total_return_pct / 100) ** (1 / years_held) - 1) * 100,
        )
        self.assertLess(result, 50)
        self.assertNotEqual(result, total_return_pct / years_held)

    def test_compound_annual_return_handles_losses_above_minus_100_percent(self):
        result = idea_compound_annual_return(-50, 2)

        self.assert_close(result, (0.5 ** 0.5 - 1) * 100)

    def test_compound_annual_return_is_undefined_when_growth_factor_is_not_positive(self):
        for total_return_pct in [-100, -101, -5000]:
            with self.subTest(total_return_pct=total_return_pct):
                self.assertIsNone(idea_compound_annual_return(total_return_pct, 5))

    def test_sp500_benchmark_uses_same_compounded_annual_return_formula(self):
        total_return_pct = 44
        years_held = 2

        self.assert_close(
            benchmark_compound_annual_return(total_return_pct, years_held),
            ((1 + total_return_pct / 100) ** (1 / years_held) - 1) * 100,
        )

    def test_value_at_or_before_uses_latest_available_period_not_exact_match_only(self):
        periods = ["2020-01", "2020-03", "2020-06"]
        values = [100, 110, 121]

        self.assertEqual(value_at_or_before(periods, values, "2020-04"), 110)
        self.assertEqual(value_at_or_before(periods, values, "2020-06"), 121)
        self.assertIsNone(value_at_or_before(periods, values, "2019-12"))

    def test_quickfs_total_return_includes_only_dividends_after_start_through_end(self):
        series = [
            ("2020-03", 100, 10),
            ("2020-06", 110, 2),
            ("2020-09", 120, 3),
            ("2020-12", 130, 4),
        ]

        result = calculate_return(series, start=0)

        self.assertEqual(result["start_period"], "2020-03")
        self.assertEqual(result["end_period"], "2020-12")
        self.assertEqual(result["dividends"], 9)
        self.assert_close(result["stock_total_return_pct"], 39)


if __name__ == "__main__":
    unittest.main()
