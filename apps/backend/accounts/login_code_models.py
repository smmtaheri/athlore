"""Shared, bounded OTP state; no plaintext codes or provider credentials."""

import uuid

from django.db import models
from django.utils import timezone


class PhoneLoginChallenge(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    nonce = models.UUIDField(default=uuid.uuid4)
    code_digest = models.CharField(max_length=64, blank=True, default="")
    expires_at = models.DateTimeField(default=timezone.now)
    last_requested_at = models.DateTimeField(null=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    window_started_at = models.DateTimeField(default=timezone.now)
    request_count = models.PositiveIntegerField(default=0)


class LoginCodeIpLimit(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    window_started_at = models.DateTimeField(default=timezone.now, db_index=True)
    request_count = models.PositiveIntegerField(default=0)
