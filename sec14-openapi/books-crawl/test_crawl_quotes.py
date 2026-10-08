import unittest

from crawl_quotes import parse_quotes


class QuoteParsingTests(unittest.TestCase):
    def test_script_template_is_not_a_rendered_quote(self):
        html = '''<script>document.write("<div class='quote'>example</div>");</script>'''
        self.assertEqual(parse_quotes(html), [])

    def test_preserves_quote_author_and_all_tags(self):
        html = '''<div class="quote">
          <span class="text">“Hello, &amp; goodbye.”</span>
          <span>by <small class="author">André Gide</small></span>
          <div class="tags">Tags: <a class="tag">life</a> <a class="tag">love</a></div>
        </div>'''
        self.assertEqual(parse_quotes(html), [{
            'quote': '“Hello, & goodbye.”', 'author': 'André Gide', 'tags': 'life, love',
        }])

    def test_incomplete_quote_fails_instead_of_saving_partial_data(self):
        with self.assertRaises(ValueError):
            parse_quotes('<div class="quote"><span class="text">Hello</span></div>')


if __name__ == '__main__':
    unittest.main()
