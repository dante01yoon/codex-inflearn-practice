import importlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit


class ChargerTests(unittest.TestCase):
    def module(self):
        if not Path(__file__).with_name('fetch_chargers.py').exists():
            self.fail('충전기 조회 스크립트가 아직 구현되지 않았습니다.')
        return importlib.import_module('fetch_chargers')

    def test_both_key_forms_reach_server_without_double_encoding(self):
        module = self.module()
        for key in ('demo+/=', 'demo%2B%2F%3D'):
            for mode in ('encoded', 'decoded'):
                query = parse_qs(urlsplit(module.build_url(key, mode)).query)
                self.assertEqual(query['serviceKey'], ['demo+/='])
                self.assertEqual(query['zcode'], ['11'])
                self.assertEqual(query['numOfRows'], ['10'])

    def test_read_quoted_key_from_env_file(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            path.write_text('# comment\nexport DATA_GO_KR_KEY="demo%2B%2F%3D"\n')
            self.assertEqual(module.load_key(path), 'demo%2B%2F%3D')

    def test_network_error_does_not_return_secret_or_url(self):
        module = self.module()
        with patch.object(module, 'urlopen', side_effect=OSError('secret https://example.test/?serviceKey=secret')):
            result, payload = module.fetch('secret', 'decoded')
        self.assertIsNone(payload)
        self.assertNotIn('secret', str(result))
        self.assertNotIn('https://', str(result))
        self.assertEqual(result['status'], 'FAIL')

    def test_redact_all_key_forms_before_saving(self):
        module = self.module()
        payload = {'nested': ['demo+/=', 'demo%2B%2F%3D', 'demo%252B%252F%253D']}
        self.assertEqual(module.redact(payload, 'demo%2B%2F%3D'),
                         {'nested': ['[REDACTED]', '[REDACTED]', '[REDACTED]']})

    def test_parse_ev_api_top_level_result_code(self):
        module = self.module()
        raw = b'{"resultCode":"00","resultMsg":"OK","items":{"item":[{"zcode":"11"}]},"totalCount":1,"pageNo":1,"numOfRows":10}'
        payload, code, rows = module.parse_response(raw)
        self.assertEqual(code, '00')
        self.assertEqual(rows, [{'zcode': '11'}])


if __name__ == '__main__':
    unittest.main()
