from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from common.sms import MOCK_MESSAGE_ID_BASE, SmsConfigurationError, send_template_sms


class SmsBackendTests(SimpleTestCase):
    @override_settings(SMS_BACKEND="mock")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_mock_backend_accepts_messages_without_network_access(self, connection):
        # All notification types share this transport, including future templates.
        for template in ("athlore_otp", "athlore_visit_finalized", "athlore_program_ready"):
            with self.subTest(template=template):
                with self.assertLogs("common.sms", level="INFO") as logs:
                    message_id = send_template_sms(
                        phone="+989121234567",
                        template=template,
                        tokens={"token": "123456"},
                    )

                self.assertGreaterEqual(message_id, MOCK_MESSAGE_ID_BASE)
                connection.assert_not_called()
                self.assertIn("no external delivery", logs.output[0])
                self.assertNotIn("+989121234567", str(logs.output))
                self.assertNotIn("123456", str(logs.output))

    @override_settings(SMS_BACKEND="invalid")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_unknown_backend_fails_closed_without_network_access(self, connection):
        with self.assertRaises(SmsConfigurationError):
            send_template_sms(
                phone="+989121234567", template="athlore_otp", tokens={"token": "123456"}
            )

        connection.assert_not_called()
