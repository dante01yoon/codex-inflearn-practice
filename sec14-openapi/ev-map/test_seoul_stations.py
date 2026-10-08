import unittest
from urllib.parse import parse_qs, urlsplit
from fetch_chargers import build_url, group_stations


class SeoulStationTests(unittest.TestCase):
    def row(self, charger='01', station='S1', lat='37.56'):
        return dict(statId=station, chgerId=charger, statNm='충전소',
                    addr='서울특별시', lat=lat, lng='126.98', zcode='11')

    def test_request_limit_and_seoul_filter(self):
        query = parse_qs(urlsplit(build_url('demo', 'encoded', 500)).query)
        self.assertEqual(query['numOfRows'], ['500'])
        self.assertEqual(query['zcode'], ['11'])
        with self.assertRaises(ValueError):
            build_url('demo', 'encoded', 501)

    def test_station_grouping_and_duplicate_charger(self):
        data = group_stations([self.row(), self.row('02'), self.row(), self.row(station='S2')])
        self.assertEqual(data['stationCount'], 2)
        self.assertEqual(data['chargerCount'], 3)
        self.assertEqual(data['stations'][0]['chargerCount'], 2)

    def test_invalid_coordinate_recovered_from_same_station(self):
        data = group_stations([self.row(lat='NaN'), self.row('02')])
        self.assertEqual(data['stations'][0]['lat'], 37.56)
        self.assertEqual(data['unmappedStationCount'], 0)
        data = group_stations([self.row(lat='')])
        self.assertIsNone(data['stations'][0]['lat'])
        self.assertEqual(data['chargerCount'], 1)
        self.assertEqual(data['unmappedStationCount'], 1)

    def test_reject_non_seoul_and_over_limit(self):
        row = self.row()
        row['zcode'] = '41'
        with self.assertRaises(ValueError):
            group_stations([row])
        with self.assertRaises(ValueError):
            group_stations([self.row()] * 501)


if __name__ == '__main__':
    unittest.main()
