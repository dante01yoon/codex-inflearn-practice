"""Books to Scrape 첫 3페이지를 수집합니다. Python 표준 라이브러리만 사용합니다."""

import csv
import json
import re
import time
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser


BASE_URL = "https://books.toscrape.com"
USER_AGENT = "BooksPracticeCrawler/1.0"
OUTPUT = Path(__file__).resolve().parent / "books.csv"
RATINGS = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5}
FIELDS = ["title", "price_gbp", "rating", "availability", "image_url"]


def fetch(url):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def check_robots(urls):
    """404/410은 규칙 없음으로 처리하고, 다른 요청 실패는 수집을 중단합니다."""
    robots_url = f"{BASE_URL}/robots.txt"
    try:
        content = fetch(robots_url)
    except HTTPError as error:
        if error.code not in (404, 410):
            raise
        print(f"robots.txt: HTTP {error.code} (규칙 파일 없음)")
        return 1.0

    robots = RobotFileParser(robots_url)
    robots.parse(content.splitlines())
    for url in urls:
        if not robots.can_fetch(USER_AGENT, url):
            raise RuntimeError(f"robots.txt가 수집을 금지합니다: {url}")
    delay = max(1.0, robots.crawl_delay(USER_AGENT) or 0)
    rate = robots.request_rate(USER_AGENT)
    if rate:
        delay = max(delay, rate.seconds / rate.requests)
    print(f"robots.txt: 수집 허용 확인 (페이지 사이 {delay:g}초 대기)")
    return delay


class BookParser(HTMLParser):
    def __init__(self, page_url=f"{BASE_URL}/catalogue/page-1.html"):
        super().__init__()
        self.page_url = page_url
        self.books = []
        self.book = None
        self.field = None
        self.chunks = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if tag == "article" and "product_pod" in classes:
            self.book = {}
        if self.book is None:
            return
        if tag == "a" and "title" in attrs:
            self.book["title"] = attrs["title"]
        if tag == "img" and attrs.get("src"):
            self.book["image_url"] = urljoin(self.page_url, attrs["src"])
        if tag == "p":
            if "star-rating" in classes:
                self.book["rating"] = next(
                    RATINGS[name] for name in classes if name in RATINGS
                )
            if "price_color" in classes:
                self.field = "price_gbp"
                self.chunks = []
            elif "availability" in classes:
                self.field = "availability"
                self.chunks = []

    def handle_data(self, data):
        if self.field:
            self.chunks.append(data)

    def handle_endtag(self, tag):
        if tag == "p" and self.field:
            value = " ".join("".join(self.chunks).split())
            if self.field == "price_gbp":
                value = f"{Decimal(value.removeprefix('£')):.2f}"
            self.book[self.field] = value
            self.field = None
        if tag == "article" and self.book is not None:
            if set(self.book) != set(FIELDS) or not all(self.book.values()):
                raise ValueError(f"책 정보가 누락되었습니다: {self.book}")
            self.books.append(self.book)
            self.book = None


def update_catalog(books):
    """CSV와 같은 데이터를 단일 HTML에 삽입하여 file://에서도 동작하게 합니다."""
    catalog = OUTPUT.with_name("index.html")
    if not catalog.exists():
        return
    data = json.dumps(books, ensure_ascii=False).replace("<", "\\u003c")
    html, replacements = re.subn(
        r'(<script id="book-data" type="application/json">).*?(</script>)',
        lambda match: match[1] + data + match[2],
        catalog.read_text(encoding="utf-8"),
        flags=re.DOTALL,
    )
    if replacements != 1:
        raise ValueError("index.html에 book-data 영역이 정확히 하나 있어야 합니다.")
    temporary = catalog.with_suffix(".html.tmp")
    temporary.write_text(html, encoding="utf-8")
    temporary.replace(catalog)
    print(f"카탈로그 갱신: {catalog}")


def main():
    urls = [f"{BASE_URL}/catalogue/page-{page}.html" for page in range(1, 4)]
    delay = check_robots(urls)  # 책 목록 요청 전에 반드시 확인합니다.
    books = []
    for index, url in enumerate(urls):
        if index:
            print(f"{delay:g}초 대기")
            time.sleep(delay)
        parser = BookParser(url)
        parser.feed(fetch(url))
        parser.close()
        if len(parser.books) != 20:
            raise ValueError(f"{url}: 예상한 20권과 다릅니다 ({len(parser.books)}권)")
        books.extend(parser.books)
        print(f"페이지 {index + 1}: {len(parser.books)}권 수집")

    temporary = OUTPUT.with_suffix(".csv.tmp")
    with temporary.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(books)
    temporary.replace(OUTPUT)

    # 메모리의 수집 결과 대신 실제 저장 파일을 다시 읽어 집계합니다.
    with OUTPUT.open(encoding="utf-8-sig", newline="") as file:
        saved = list(csv.DictReader(file))
    update_catalog(saved)
    print(f"\n저장 완료: {OUTPUT} ({len(saved)}권)")
    print("\n| 책 제목 | 가격(GBP) | 별점 | 재고 |")
    print("|---|---:|---:|---|")
    for book in sorted(saved, key=lambda item: Decimal(item["price_gbp"]), reverse=True)[:3]:
        title = book["title"].replace("|", "\\|")
        print(f"| {title} | £{book['price_gbp']} | {book['rating']}/5 | {book['availability']} |")


if __name__ == "__main__":
    main()
