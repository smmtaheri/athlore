from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from common.sms import SmsDeliveryUnavailable, send_template_sms


@override_settings(SMS_BACKEND="najva", NAJVA_API_KEY="test-key", NAJVA_SENDER="100001")
class SmsRetryTests(SimpleTestCase):
    def send(self, event="login_otp"):
        return send_template_sms(
            phone="+989121234567",
            template="test_template",
            tokens={"token": "123456"},
            event=event,
            reference_id="test-reference",
        )

    def response(self, status, body):
        return Mock(status=status, read=Mock(return_value=body))

    @patch("common.sms.time.sleep")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_gateway_html_retries_then_accepts_for_all_events(self, connection, sleep):
        for event in ("login_otp", "visit_finalized", "program_ready"):
            with self.subTest(event=event):
                connection.reset_mock()
                sleep.reset_mock()
                connection.return_value.getresponse.side_effect = [
                    self.response(502, b"<html>Bad gateway</html>"),
                    self.response(
                        200, b'{"return":{"status":200},"entries":[{"status":1,"messageid":42}]}'
                    ),
                ]
                with self.assertLogs("common.sms", level="INFO") as logs:
                    self.assertEqual(self.send(event), 42)
                self.assertEqual(connection.call_count, 2)
                self.assertEqual(connection.return_value.close.call_count, 2)
                sleep.assert_called_once_with(5)
                self.assertIn("state=scheduled", str(logs.output))
                for secret in ("test-key", "123456", "+989121234567"):
                    self.assertNotIn(secret, str(logs.output))

    @patch("common.sms.time.sleep")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_exhausts_after_five_retries(self, connection, sleep):
        connection.return_value.getresponse.return_value = self.response(
            503, b'{"return":{"status":503},"entries":[]}'
        )
        with self.assertLogs("common.sms", level="WARNING") as logs:
            with self.assertRaises(SmsDeliveryUnavailable):
                self.send()
        self.assertEqual(connection.call_count, 6)
        self.assertEqual(sleep.call_count, 5)
        self.assertIn("state=exhausted", str(logs.output))

    @patch("common.sms.time.monotonic", side_effect=[0, 0, 45])
    @patch("common.sms.time.sleep")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_retry_budget_stops_slow_failures(self, connection, sleep, monotonic):
        connection.return_value.getresponse.return_value = self.response(504, b"gateway timeout")
        with self.assertRaises(SmsDeliveryUnavailable):
            self.send()
        self.assertEqual(connection.call_count, 1)
        sleep.assert_not_called()

    @patch("common.sms.time.sleep")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_no_retry_for_permanent_or_ambiguous_responses(self, connection, sleep):
        for status, body in (
            (424, b'{"return":{"status":424},"entries":[]}'),
            (200, b"invalid json"),
            (503, b'{"entries":[{"status":1,"messageid":42}]}'),
            (429, b'{"return":{"status":429},"entries":[]}'),
        ):
            with self.subTest(status=status, body=body):
                connection.reset_mock()
                connection.return_value.getresponse.return_value = self.response(status, body)
                with self.assertRaises(SmsDeliveryUnavailable):
                    self.send()
                self.assertEqual(connection.call_count, 1)
                sleep.assert_not_called()

    @patch("common.sms.time.sleep")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_ambiguous_transport_timeout_is_not_retried(self, connection, sleep):
        connection.return_value.request.side_effect = TimeoutError("secret transport details")
        with self.assertRaises(SmsDeliveryUnavailable):
            self.send()
        self.assertEqual(connection.call_count, 1)
        sleep.assert_not_called()
