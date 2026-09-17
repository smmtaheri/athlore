from __future__ import annotations

from django.test import SimpleTestCase

from common.phone import InvalidPhoneError, normalize_iran_mobile, phones_equivalent


class NormalizeIranMobileTests(SimpleTestCase):
    def test_local_09_format(self):
        self.assertEqual(normalize_iran_mobile("09121234567"), "+989121234567")

    def test_e164_and_formatting(self):
        self.assertEqual(normalize_iran_mobile("+98 912 123 4567"), "+989121234567")
        self.assertEqual(normalize_iran_mobile("989121234567"), "+989121234567")
        self.assertEqual(normalize_iran_mobile("00989121234567"), "+989121234567")

    def test_persian_digits(self):
        self.assertEqual(normalize_iran_mobile("۰۹۱۲۱۲۳۴۵۶۷"), "+989121234567")

    def test_optional_empty(self):
        self.assertIsNone(normalize_iran_mobile("", required=False))
        self.assertIsNone(normalize_iran_mobile(None, required=False))

    def test_required_empty_raises(self):
        with self.assertRaises(InvalidPhoneError):
            normalize_iran_mobile("", required=True)

    def test_invalid_raises_persian(self):
        with self.assertRaises(InvalidPhoneError) as ctx:
            normalize_iran_mobile("12345")
        self.assertIn("موبایل", str(ctx.exception))

    def test_phones_equivalent(self):
        self.assertTrue(phones_equivalent("09121234567", "+989121234567"))
        self.assertFalse(phones_equivalent("09121234567", "09129876543"))
