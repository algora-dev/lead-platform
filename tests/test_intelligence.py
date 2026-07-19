import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))

from intelligence import advert_score, company_score, normalize_company, task_signals


class IntelligenceTests(unittest.TestCase):
    def test_normalize_company(self):
        self.assertEqual(normalize_company('Example Holdings Limited'), 'example')

    def test_task_signals(self):
        signals=task_signals('Maintain the CRM, answer customer enquiries and prepare monthly reports.')
        self.assertIn('data and records',signals)
        self.assertIn('customer communication',signals)
        self.assertIn('reporting and reconciliation',signals)

    def test_multiple_jobs_and_repeat_tasks_raise_score(self):
        one=[{'signals':['data and records'],'salary_high':30000}]
        three=[
            {'signals':['data and records'],'salary_high':30000},
            {'signals':['data and records','reporting and reconciliation'],'salary_high':32000},
            {'signals':['data and records'],'salary_high':35000},
        ]
        score_one=company_score(one,None,None,None)[0]
        score_three=company_score(three,'hello@example.com','0123456789',50)[0]
        self.assertGreater(score_three,score_one)

    def test_advert_score_is_positive_only(self):
        self.assertEqual(advert_score([]),0)
        self.assertGreater(advert_score(['data and records']),0)


if __name__=='__main__':
    unittest.main()
