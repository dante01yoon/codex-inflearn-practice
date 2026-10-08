"""일반 HTML을 먼저 확인하고 필요하면 Playwright로 첫 2페이지를 수집합니다."""

import csv
import json
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup


BASE_URL = "https://quotes.toscrape.com"
URLS = [f"{BASE_URL}/js/", f"{BASE_URL}/js/page/2/"]
USER_AGENT = "QuotesPracticeCrawler/1.0"
OUTPUT = Path(__file__).resolve().parent / "quotes.csv"
FIELDS = ["quote", "author", "tags"]


def fetch(url):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def check_robots():
    """404/410은 규칙 파일 없음, 다른 오류나 금지 규칙은 중단합니다."""
    robots_url = f"{BASE_URL}/robots.txt"
    try:
        content = fetch(robots_url)
    except HTTPError as error:
        if error.code not in (404, 410):
            raise
        status = f"HTTP {error.code} (규칙 파일 없음)"
        print(f"robots.txt: {status}")
        return 1.0, status

    robots = RobotFileParser(robots_url)
    robots.parse(content.splitlines())
    for url in URLS:
        if not robots.can_fetch(USER_AGENT, url):
            raise RuntimeError(f"robots.txt가 수집을 금지합니다: {url}")
    delay = max(1.0, robots.crawl_delay(USER_AGENT) or 0)
    rate = robots.request_rate(USER_AGENT)
    if rate:
        delay = max(delay, rate.seconds / rate.requests)
    print(f"robots.txt: 수집 허용, 페이지 사이 {delay:g}초 대기")
    return delay, "수집 허용"


def parse_quotes(html):
    """스크립트 문자열을 실행하지 않고 실제 .quote 요소만 읽습니다."""
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for card in soup.select(".quote"):
        text = card.select_one(".text")
        author = card.select_one(".author")
        if text is None or author is None:
            raise ValueError("명언 또는 저자 요소가 누락되었습니다.")
        row = {
            "quote": text.get_text(strip=True),
            "author": author.get_text(strip=True),
            "tags": ", ".join(tag.get_text(strip=True) for tag in card.select(".tags .tag")),
        }
        if not row["quote"] or not row["author"]:
            raise ValueError("명언 또는 저자가 비어 있습니다.")
        rows.append(row)
    return rows


def pause(delay):
    print(f"{delay:g}초 대기")
    time.sleep(delay)


def collect_with_playwright(delay):
    from playwright.sync_api import sync_playwright

    pages = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(user_agent=USER_AGENT)
            for number, url in enumerate(URLS, 1):
                # 일반 요청의 마지막 페이지와 브라우저 첫 페이지 사이도 쉽니다.
                pause(delay)
                response = page.goto(url, wait_until="networkidle", timeout=30000)
                if response is None or response.status >= 400:
                    raise RuntimeError(f"브라우저 페이지 요청 실패: {url}")
                page.locator(".quote").first.wait_for(timeout=15000)
                rows = parse_quotes(page.content())
                if len(rows) != 10:
                    raise ValueError(f"페이지 {number}: 예상 10개, 실제 {len(rows)}개")
                pages.append(rows)
                print(f"Playwright 페이지 {number}: {len(rows)}개")
        finally:
            browser.close()
    return pages


def main():
    delay, robots_status = check_robots()  # 목록 요청보다 먼저 확인합니다.
    regular_pages = []
    for number, url in enumerate(URLS, 1):
        pause(delay)
        rows = parse_quotes(fetch(url))
        regular_pages.append(rows)
        print(f"일반 요청 페이지 {number}: {len(rows)}개")

    browser_pages = None
    if any(not rows for rows in regular_pages):
        print("일반 HTML에 명언 요소가 없어 Playwright로 전환합니다.")
        browser_pages = collect_with_playwright(delay)
    selected = browser_pages if browser_pages is not None else regular_pages
    rows = [row for page_rows in selected for row in page_rows]
    if len(rows) != 20 or len({row['quote'] for row in rows}) != 20:
        raise ValueError("첫 2페이지에서 서로 다른 명언 20개를 수집하지 못했습니다.")

    temporary = OUTPUT.with_suffix(".csv.tmp")
    with temporary.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    with temporary.open(encoding="utf-8-sig", newline="") as file:
        saved = list(csv.DictReader(file))
    if saved != rows:
        raise ValueError("CSV 재검증 실패: 수집 결과와 저장 결과가 다릅니다.")
    temporary.replace(OUTPUT)

    report = {
        "urls": URLS,
        "robots": robots_status,
        "delay_seconds": delay,
        "regular_counts": [len(page_rows) for page_rows in regular_pages],
        "playwright_counts": [len(page_rows) for page_rows in browser_pages]
        if browser_pages is not None else None,
        "saved_rows": len(saved),
        "csv_verified": saved == rows,
    }
    OUTPUT.with_name("quotes-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("\n| 방식 | 페이지 1 | 페이지 2 | 합계 |")
    print("|---|---:|---:|---:|")
    counts = report["regular_counts"]
    print(f"| 일반 요청 | {counts[0]} | {counts[1]} | {sum(counts)} |")
    counts = report["playwright_counts"]
    if counts is not None:
        print(f"| Playwright | {counts[0]} | {counts[1]} | {sum(counts)} |")
    else:
        print("| Playwright | NOT_RUN | NOT_RUN | NOT_RUN |")
    print(f"저장 및 재검증 완료: {OUTPUT} ({len(saved)}개)")


if __name__ == "__main__":
    main()
