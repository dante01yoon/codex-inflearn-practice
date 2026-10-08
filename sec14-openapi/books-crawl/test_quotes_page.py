import csv
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


class QuotesPageTests(unittest.TestCase):
    def test_filters_real_csv_data_and_navigates_only_matching_quotes(self):
        root = Path(__file__).resolve().parent
        self.assertTrue((root / 'quotes.html').exists(), '명언 페이지가 아직 없습니다')
        with (root / 'quotes.csv').open(encoding='utf-8-sig', newline='') as file:
            rows = list(csv.DictReader(file))
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                page = browser.new_page(viewport={'width': 1440, 'height': 1000})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto((root / 'quotes.html').as_uri())
                self.assertEqual(page.locator('#quote-text').inner_text(), rows[0]['quote'])
                page.get_by_role('button', name='다음 명언', exact=True).click()
                self.assertEqual(page.locator('#quote-text').inner_text(), rows[1]['quote'])
                page.get_by_role('button', name='이전 명언', exact=True).click()
                self.assertEqual(page.locator('#quote-text').inner_text(), rows[0]['quote'])
                tags = sorted({t for r in rows for t in r['tags'].split(', ') if t})
                for tag in tags:
                    matches = [r for r in rows if tag in r['tags'].split(', ')]
                    page.locator('#tag-cloud').get_by_role('button', name=f'{tag} · {len(matches)}개', exact=True).click()
                    for index, row in enumerate(matches):
                        self.assertEqual(page.locator('#quote-text').inner_text(), row['quote'])
                        self.assertEqual(page.locator('#quote-author').inner_text(), row['author'])
                        self.assertEqual(page.locator('#position').inner_text(), f'{index + 1:02d} / {len(matches):02d}')
                        self.assertEqual(page.get_by_role('button', name='다음 명언', exact=True).is_enabled(), len(matches) > 1)
                        if len(matches) > 1:
                            page.get_by_role('button', name='다음 명언', exact=True).click()
                    self.assertEqual(page.locator('#quote-text').inner_text(), matches[0]['quote'])
                page.get_by_role('button', name='전체 · 20개', exact=True).click()
                self.assertEqual(page.locator('#position').inner_text(), '01 / 20')
                page.set_viewport_size({'width': 390, 'height': 844})
                self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth'), 390)
                self.assertEqual(errors, [])
            finally:
                browser.close()


if __name__ == '__main__':
    unittest.main()
